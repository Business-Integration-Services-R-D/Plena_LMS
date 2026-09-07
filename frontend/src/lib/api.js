import axios from "axios";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";

// edu_module (marti-lms) API'sine giden gerçek HTTP istemcisi.
// Sayfalar bu istemciyi doğrudan kullanmaz; aşağıdaki `api` adapter'ı üzerinden geçer.
export const http = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  withCredentials: true,
});

// ---------------------------------------------------------------------------
// Shape mapper'ları: edu_module <-> Emergent UI sözleşmesi
// ---------------------------------------------------------------------------

// edu_module rolleri: ADMIN | USER — UI rolleri: admin | employee
export const toUiRole = (role) => (role === "ADMIN" ? "admin" : "employee");
export const toEduRole = (role) => (role === "admin" ? "ADMIN" : "USER");

export const toUiUser = (u) =>
  u
    ? {
        user_id: u.id,
        id: u.id,
        email: u.email,
        name: u.name,
        role: toUiRole(u.role),
        picture: u.picture || null,
        account_active: u.active !== false,
        can_manage_status:
          u.active !== false || Boolean(u.deactivatedAt),
        status:
          u.active !== false
            ? "active"
            : u.deactivatedAt
              ? "passive"
            : u.activationSent
              ? "invited"
              : "pending_activation",
        created_at: u.createdAt || null,
      }
    : null;

// edu_module EnrollmentStatus -> Emergent UI assignment status
const toUiStatus = (status, videoCompleted) => {
  if (status === "COMPLETED") return "completed";
  if (status === "OVERDUE") return "overdue";
  if (videoCompleted) return "video_completed";
  if (status === "NOT_STARTED") return "assigned";
  return "in_progress"; // IN_PROGRESS, FAILED (video sıfırlanmış)
};

const mapReportRow = (r) => ({
  assignment_id: r.enrollmentId,
  user_name: r.user?.name,
  user_email: r.user?.email,
  training_id: r.course?.id,
  training_title: r.course?.title,
  training_category: r.course?.category?.name || null,
  status: toUiStatus(r.status, r.videoCompleted),
  watch_pct: Math.round(r.watchedPercent || 0),
  watched_seconds: r.totalWatchedSec || 0,
  checkpoints_passed: r.checkpointsPassed || 0,
  checkpoints_total: r.checkpointsTotal || 0,
  checkpoint_fails: r.checkpointFails || 0,
  quiz_score: r.bestScorePercent != null ? Math.round(r.bestScorePercent) : null,
  completed_at: r.completedAt,
});

// Kurs başına learn oturumu bilgisi: video süresi, quiz varlığı ve
// answer_index -> choiceId çevirisi için soru/şık haritası.
const learnCache = new Map();

const mapQuizQuestions = (courseId, quizPayload) => {
  const entry = learnCache.get(courseId) || {};
  entry.choiceMap = {};
  const questions = quizPayload.questions.map((q) => {
    entry.choiceMap[q.id] = (q.choices || []).map((c) => c.id);
    return {
      question_id: q.id,
      text: q.prompt,
      qtype: q.type === "FREE_TEXT" ? "free_text" : "multiple_choice",
      points: q.points ?? 1,
      options: (q.choices || []).map((c) => c.text),
    };
  });
  learnCache.set(courseId, entry);
  return questions;
};

// ---------------------------------------------------------------------------
// Eğitim (Course) ve soru bankası eşlemeleri
// ---------------------------------------------------------------------------

// Kurs başına özel sınav havuzları bu önekle adlandırılır; soru bankasında gizlenir.
const COURSE_POOL_PREFIX = "[Kurs] ";

const toUiOnFail = (onFail, maxAttempts) => {
  if (onFail === "PREVIOUS") return "previous";
  if (onFail === "RETRY" || onFail === "RETRY_PREVIOUS") {
    return maxAttempts != null ? "retry_limited" : "retry";
  }
  return "start";
};

const mapCheckpoint = (cp) => ({
  id: cp.id,
  time: cp.timeSec,
  question_id: cp.questionId,
  timeout_seconds: cp.timeoutSeconds,
  on_fail: toUiOnFail(cp.onFail, cp.maxAttempts),
  attempts: cp.maxAttempts ?? null,
  retry_exhausted: cp.onFail === "RETRY_PREVIOUS" ? "previous" : "start",
});

const mapCourse = (c) => ({
  training_id: c.id,
  active: c.active !== false,
  title: c.title,
  description: c.description,
  video_filename: c.video?.fileName || null,
  video_size: c.video?.sizeBytes || 0,
  content_type: c.video?.pageCount ? "pdf" : c.video ? "video" : null,
  pdf_page_count: c.video?.pageCount || 0,
  duration: c.video?.durationSec || 0,
  checkpoints: (c.checkpoints || []).map(mapCheckpoint),
  assignment_count: c.assignmentCount || 0,
  created_at: c.createdAt,
});

const mapBankQuestion = (q) => ({
  question_id: q.id,
  text: q.prompt,
  qtype: q.type === "FREE_TEXT" ? "free_text" : "multiple_choice",
  options: (q.choices || []).map((c) => c.text),
  correct_index: q.type === "FREE_TEXT" ? null : (q.choices || []).findIndex((c) => c.isCorrect),
  category_id: q.questionCategory?.id || q.categoryId || null,
  category: q.questionCategory?.name || null,
  created_at: q.createdAt,
});

// Soru bankası = kurs-özel havuzlar dışındaki tüm havuzların aktif soruları
const fetchQuestionBank = (pools) =>
  pools
    .filter((p) => !p.name.startsWith(COURSE_POOL_PREFIX))
    .flatMap((p) => p.questions.map((q) => ({ ...q, _poolName: p.name, _poolId: p.id })));

// Bankaya yeni eklenen sorular bu havuza yazılır (yoksa oluşturulur).
const DEFAULT_POOL_NAME = "Genel Soru Havuzu";

const ensureDefaultPool = async (pools) => {
  const existing = pools.find((p) => p.name === DEFAULT_POOL_NAME);
  if (existing) return existing.id;
  const res = await http.post("/admin/pools", {
    name: DEFAULT_POOL_NAME,
    description: "Soru bankası üzerinden eklenen sorular",
  });
  return res.data.id;
};

const toChoices = (body) =>
  (body.options || []).map((text, i) => ({
    text,
    isCorrect: i === body.correct_index,
  }));

const fetchTrainingDetail = async (courseId) => {
  const [coursesRes, poolsRes] = await Promise.all([
    http.get("/admin/courses"),
    http.get("/admin/pools"),
  ]);
  const c = coursesRes.data.find((x) => x.id === courseId);
  if (!c) {
    const err = new Error("Eğitim bulunamadı");
    err.response = { status: 404, data: { error: err.message, detail: "Eğitim bulunamadı" } };
    throw err;
  }
  const pools = poolsRes.data;
  const coursePool = c.pool ? pools.find((p) => p.id === c.pool.id) : null;
  const bank = fetchQuestionBank(pools);
  // Kurs havuzundaki (kopya) sorular, bankadaki kaynak sorularla metin
  // üzerinden eşlenir; UI toggle durumu banka id'leriyle çalışır.
  const bankByPrompt = new Map(bank.map((q) => [q.prompt, q.id]));
  const question_ids = (coursePool?.questions || [])
    .map((q) => bankByPrompt.get(q.prompt))
    .filter(Boolean);

  // Puanlar kurs havuzundaki kopyalarda tutulur; UI banka id'leriyle çalışır.
  const question_points = {};
  for (const q of coursePool?.questions || []) {
    const bankId = bankByPrompt.get(q.prompt);
    if (bankId) question_points[bankId] = q.points ?? 1;
  }

  return {
    ...mapCourse(c),
    quiz: {
      question_ids,
      question_points,
      scoring_mode: c.scoringMode === "PER_QUESTION" ? "per_question" : "auto",
      pass_score: c.passPercent > 0 ? c.passPercent : null,
    },
  };
};

// Sınav seçimini kursun özel havuzuyla senkronlar (kopyala / pasifleştir).
const syncQuiz = async (courseId, quiz) => {
  const [coursesRes, poolsRes] = await Promise.all([
    http.get("/admin/courses"),
    http.get("/admin/pools"),
  ]);
  const c = coursesRes.data.find((x) => x.id === courseId);
  if (!c) return;
  const pools = poolsRes.data;

  let coursePool = c.pool ? pools.find((p) => p.id === c.pool.id) : null;

  // Paylaşılan havuza bağlı (ör. seed) kurslarda önce kursa özel havuz açılır;
  // paylaşılan havuz asla değiştirilmez.
  if (!coursePool || !coursePool.name.startsWith(COURSE_POOL_PREFIX)) {
    const poolName = `${COURSE_POOL_PREFIX}${courseId}`;
    // Yarım kalmış bir önceki denemeden havuz kalmış olabilir; varsa yeniden kullan.
    let dedicated = pools.find((p) => p.name === poolName);
    if (!dedicated) {
      const created = await http.post("/admin/pools", {
        name: poolName,
        description: `"${c.title}" eğitiminin sınav soruları`,
      });
      dedicated = { ...created.data, questions: [] };
    }
    await http.patch(`/admin/courses/${courseId}`, { questionPoolId: dedicated.id });
    coursePool = dedicated;
  }

  // Soru listesi yalnızca açıkça gönderildiğinde senkronlanır; geçme notu gibi
  // diğer quiz güncellemeleri bayat/eksik listeyle seçimleri silmesin.
  if (Array.isArray(quiz.question_ids)) {
    const bank = fetchQuestionBank(pools);
    const bankById = new Map(bank.map((q) => [q.id, q]));
    const desired = quiz.question_ids
      .map((id) => bankById.get(id))
      .filter(Boolean);
    const desiredPrompts = new Set(desired.map((q) => q.prompt));
    const existingByPrompt = new Map(
      (coursePool.questions || []).map((q) => [q.prompt, q]),
    );
    const pointsByBankId = quiz.question_points || {};

    for (const q of desired) {
      const points = Number(pointsByBankId[q.id]) || 1;
      const existing = existingByPrompt.get(q.prompt);
      if (!existing) {
        await http.post(`/admin/pools/${coursePool.id}/questions`, {
          prompt: q.prompt,
          categoryId: q.categoryId,
          type: q.type || "MULTIPLE_CHOICE",
          points,
          choices: (q.choices || []).map((ch) => ({ text: ch.text, isCorrect: ch.isCorrect })),
        });
      } else if ((existing.points ?? 1) !== points) {
        await http.patch(`/admin/questions/${existing.id}`, { points });
      }
    }
    for (const q of coursePool.questions || []) {
      if (!desiredPrompts.has(q.prompt)) {
        await http.patch(`/admin/questions/${q.id}`, { active: false });
      }
    }
  }

  if (quiz.scoring_mode !== undefined) {
    const scoringMode = quiz.scoring_mode === "per_question" ? "PER_QUESTION" : "AUTO";
    if (scoringMode !== c.scoringMode) {
      await http.patch(`/admin/courses/${courseId}`, { scoringMode });
    }
  }

  if (quiz.pass_score !== undefined) {
    const passPercent = quiz.pass_score == null ? 0 : Number(quiz.pass_score);
    if (passPercent !== c.passPercent) {
      await http.patch(`/admin/courses/${courseId}`, { passPercent });
    }
  }
};

// ---------------------------------------------------------------------------
// PDF raporu (istemci tarafında pdfmake ile üretilir; Türkçe karakter desteği
// için pdfmake'in gömülü Roboto fontu kullanılır)
// ---------------------------------------------------------------------------

const buildReportPdf = async (reportTitle, rows, dimension = "training") => {
  const [{ default: pdfMake }, fontsModule] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  // pdfmake sürümleri arasında vfs dışa aktarımı değişiyor; hepsini dene.
  const fonts = fontsModule.default || fontsModule;
  if (typeof pdfMake.addVirtualFileSystem === "function") {
    pdfMake.addVirtualFileSystem(fonts);
  } else {
    pdfMake.vfs = fonts.pdfMake?.vfs || fonts.vfs || fonts;
  }

  const formatDateTime = (value) => {
    if (!value) return "-";
    const parts = new Intl.DateTimeFormat("tr-TR", {
      timeZone: "Europe/Istanbul",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(value));
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${byType.day}.${byType.month}.${byType.year}\n${byType.hour}:${byType.minute}`;
  };
  const statusStyle = {
    completed: { label: "Tamamlandı", color: "#047857", fill: "#D1FAE5" },
    video_completed: { label: "İçerik tamamlandı", color: "#B45309", fill: "#FEF3C7" },
    in_progress: { label: "Devam ediyor", color: "#0369A1", fill: "#E0F2FE" },
    assigned: { label: "Başlamadı", color: "#475569", fill: "#F1F5F9" },
  };
  const statuses = rows.map((row) => toUiStatus(row.status, row.videoCompleted));
  const completedCount = statuses.filter((status) => status === "completed").length;
  const inProgressCount = statuses.filter(
    (status) => status === "in_progress" || status === "video_completed",
  ).length;
  const notStartedCount = statuses.filter((status) => status === "assigned").length;
  const averageProgress =
    rows.length > 0
      ? Math.round(
          rows.reduce((sum, row) => sum + Number(row.watchedPercent || 0), 0) /
            rows.length,
        )
      : 0;
  const totalWatched = rows.reduce(
    (sum, row) => sum + Number(row.totalWatchedSec || 0),
    0,
  );
  const generatedAt = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    dateStyle: "long",
    timeStyle: "medium",
  }).format(new Date());

  const isPersonReport = dimension === "person";
  const header = [
    isPersonReport ? "Eğitim" : "Kullanıcı",
    isPersonReport ? "Kategori" : "E-posta",
    "Durum",
    "İlerleme",
    "İçerikte Geçen Süre",
    "Kontrol Noktaları",
    "Sınav Sonucu",
    "Atama Tarihi",
    "Son Tarih",
    "Tamamlanma",
  ];
  const body = [
    header.map((text) => ({
      text,
      bold: true,
      fontSize: 8,
      color: "#FFFFFF",
      fillColor: "#0E2033",
      margin: [0, 2, 0, 2],
    })),
    ...rows.map((r, rowIndex) => {
      const status = toUiStatus(r.status, r.videoCompleted);
      const appearance = statusStyle[status] || {
        label: STATUS_TR[status] || status,
        color: "#475569",
        fill: "#F1F5F9",
      };
      const rowFill = rowIndex % 2 === 0 ? "#FFFFFF" : "#F8FAFC";
      const common = { fontSize: 8, color: "#334155", fillColor: rowFill };
      const checkpointFails = Number(r.checkpointFails || 0);
      const examDetail =
        r.bestScorePercent != null
          ? [
              `%${Math.round(r.bestScorePercent)}`,
              r.correctCount != null || r.wrongCount != null
                ? `${r.correctCount || 0} doğru · ${r.wrongCount || 0} yanlış`
                : null,
              r.attemptCount ? `${r.attemptCount} deneme` : null,
            ]
              .filter(Boolean)
              .join("\n")
          : "Sınava girilmedi";
      return [
        {
          ...common,
          text: isPersonReport ? r.course?.title || "-" : r.user?.name || "-",
          bold: true,
          color: "#0E2033",
        },
        {
          ...common,
          text: isPersonReport
            ? r.course?.category?.name || "-"
            : r.user?.email || "-",
          fontSize: 7.5,
        },
        {
          text: appearance.label,
          bold: true,
          fontSize: 7.5,
          color: appearance.color,
          fillColor: appearance.fill,
          alignment: "center",
        },
        {
          ...common,
          text: `%${Math.round(r.watchedPercent || 0)}`,
          bold: true,
          color: Number(r.watchedPercent || 0) >= 100 ? "#047857" : "#0369A1",
          alignment: "center",
        },
        { ...common, text: fmtTime(r.totalWatchedSec || 0), alignment: "center" },
        {
          ...common,
          text: `${r.checkpointsPassed || 0}/${r.checkpointsTotal || 0}${checkpointFails ? `\n${checkpointFails} hata` : ""}`,
          color: checkpointFails ? "#B91C1C" : "#334155",
          alignment: "center",
        },
        { ...common, text: examDetail, alignment: "center", fontSize: 7.5 },
        { ...common, text: formatDateTime(r.assignedAt), alignment: "center" },
        {
          ...common,
          text: formatDateTime(r.dueAt),
          alignment: "center",
          color: r.status === "OVERDUE" ? "#B91C1C" : "#334155",
        },
        { ...common, text: formatDateTime(r.completedAt), alignment: "center" },
      ];
    }),
  ];

  const docDefinition = {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [30, 58, 30, 38],
    info: {
      title: `${reportTitle} - ${isPersonReport ? "Kişi Bazlı Rapor" : "Eğitim Detay Raporu"}`,
      author: "Martı Denizcilik · Plena LMS",
      subject: "Eğitim ilerleme ve sınav sonuçları",
    },
    header: {
      margin: [30, 18, 30, 0],
      columns: [
        {
          text: "MARTI DENİZCİLİK",
          fontSize: 10,
          bold: true,
          color: "#0E2033",
        },
        {
          text: "Powered by Plena LMS",
          fontSize: 8,
          color: "#0891B2",
          alignment: "right",
        },
      ],
    },
    content: [
      {
        text: isPersonReport ? "KİŞİ BAZLI RAPOR" : "EĞİTİM DETAY RAPORU",
        fontSize: 9,
        bold: true,
        color: "#0891B2",
        characterSpacing: 1.5,
        margin: [0, 0, 0, 4],
      },
      {
        text: reportTitle,
        fontSize: 19,
        bold: true,
        color: "#0E2033",
        margin: [0, 0, 0, 3],
      },
      {
        text: `Türkiye saatiyle oluşturuldu: ${generatedAt}`,
        fontSize: 8,
        color: "#64748B",
        margin: [0, 0, 0, 14],
      },
      {
        table: {
          widths: ["*", "*", "*", "*", "*"],
          body: [[
            { text: [{ text: `${rows.length}\n`, fontSize: 18, bold: true, color: "#0E2033" }, { text: "Toplam Atama", fontSize: 8, color: "#64748B" }], margin: [8, 7, 8, 7] },
            { text: [{ text: `${completedCount}\n`, fontSize: 18, bold: true, color: "#047857" }, { text: "Tamamlanan", fontSize: 8, color: "#64748B" }], margin: [8, 7, 8, 7] },
            { text: [{ text: `${inProgressCount}\n`, fontSize: 18, bold: true, color: "#0369A1" }, { text: "Devam Eden", fontSize: 8, color: "#64748B" }], margin: [8, 7, 8, 7] },
            { text: [{ text: `${notStartedCount}\n`, fontSize: 18, bold: true, color: "#475569" }, { text: "Başlamayan", fontSize: 8, color: "#64748B" }], margin: [8, 7, 8, 7] },
            { text: [{ text: `%${averageProgress}\n`, fontSize: 18, bold: true, color: "#B45309" }, { text: `Ort. İlerleme · ${fmtTime(totalWatched)}`, fontSize: 8, color: "#64748B" }], margin: [8, 7, 8, 7] },
          ]],
        },
        layout: {
          hLineColor: () => "#DCE5EA",
          vLineColor: () => "#DCE5EA",
          hLineWidth: () => 0.7,
          vLineWidth: () => 0.7,
        },
        margin: [0, 0, 0, 16],
      },
      {
        text: "KATILIMCI DETAYLARI",
        fontSize: 9,
        bold: true,
        color: "#36566F",
        characterSpacing: 1,
        margin: [0, 0, 0, 7],
      },
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: [82, 112, 64, 43, 55, 50, 67, 67, 67, 67],
          body,
        },
        layout: {
          hLineWidth: (i) => (i <= 1 ? 0.8 : 0.35),
          vLineWidth: () => 0.35,
          hLineColor: () => "#DCE5EA",
          vLineColor: () => "#E8EEF2",
          paddingTop: () => 7,
          paddingBottom: () => 7,
          paddingLeft: () => 5,
          paddingRight: () => 5,
        },
      },
      {
        text: "Not: Tarih ve saatler Europe/Istanbul (UTC+3) saat dilimindedir. İzleme süresi, sistemde kaydedilen toplam içerik etkileşim süresini gösterir.",
        fontSize: 7,
        color: "#64748B",
        margin: [0, 10, 0, 0],
      },
    ],
    footer: (page, total) => ({
      margin: [30, 0, 30, 14],
      columns: [
        { text: "Martı Denizcilik · Gizli eğitim raporu", fontSize: 7, color: "#94A3B8" },
        { text: `Sayfa ${page} / ${total}`, alignment: "right", fontSize: 7, color: "#64748B" },
      ],
    }),
    defaultStyle: { font: "Roboto" },
  };

  const pdf = pdfMake.createPdf(docDefinition);
  return new Promise((resolve, reject) => {
    try {
      const maybe = pdf.getBlob((b) => resolve(b));
      if (maybe && typeof maybe.then === "function") maybe.then(resolve, reject);
    } catch (e) {
      reject(e);
    }
  });
};

// ---------------------------------------------------------------------------
// Route tablosu: Emergent UI'nin çağırdığı path'ler -> edu_module endpoint'leri
// Her handler UI'nin beklediği veri şeklini döner.
// ---------------------------------------------------------------------------

const routes = [
  // --- Auth ---
  {
    method: "POST",
    pattern: /^\/auth\/login$/,
    handler: async (_m, body) => {
      const res = await http.post("/auth/login", body);
      return toUiUser(res.data);
    },
  },
  {
    method: "GET",
    pattern: /^\/auth\/me$/,
    handler: async () => {
      const res = await http.get("/auth/me");
      return toUiUser(res.data);
    },
  },
  {
    method: "POST",
    pattern: /^\/auth\/logout$/,
    handler: async () => {
      const res = await http.post("/auth/logout");
      return res.data;
    },
  },
  {
    method: "POST",
    pattern: /^\/auth\/forgot-password$/,
    handler: async (_m, body) => {
      const res = await http.post("/auth/forgot-password", body);
      return res.data;
    },
  },
  {
    method: "GET",
    pattern: /^\/auth\/reset-password$/,
    handler: async (_m, _body, query) => {
      const res = await http.get("/auth/reset-password", {
        params: { token: query.get("token") },
      });
      return res.data;
    },
  },
  {
    method: "POST",
    pattern: /^\/auth\/reset-password$/,
    handler: async (_m, body) => {
      const res = await http.post("/auth/reset-password", body);
      return res.data;
    },
  },
  {
    method: "GET",
    pattern: /^\/profile$/,
    handler: async () => {
      const res = await http.get("/user/profile");
      return toUiUser(res.data);
    },
  },
  {
    method: "PATCH",
    pattern: /^\/profile$/,
    handler: async (_m, body) => {
      const res = await http.patch("/user/profile", {
        name: body.name,
      });
      return toUiUser(res.data);
    },
  },
  {
    method: "POST",
    pattern: /^\/profile\/change-password$/,
    handler: async (_m, body) => {
      const res = await http.post("/user/change-password", {
        currentPassword: body.current_password,
        newPassword: body.new_password,
        newPasswordConfirmation: body.new_password_confirmation,
      });
      return res.data;
    },
  },
  {
    method: "GET",
    pattern: /^\/auth\/activate$/,
    handler: async (_m, _body, query) => {
      const res = await http.get("/auth/activate", {
        params: { token: query.get("token") },
      });
      return res.data;
    },
  },
  {
    method: "POST",
    pattern: /^\/auth\/activate$/,
    handler: async (_m, body) => {
      const res = await http.post("/auth/activate", body);
      return toUiUser(res.data);
    },
  },
  {
    method: "GET",
    pattern: /^\/notifications$/,
    handler: async () => {
      const res = await http.get("/user/notifications");
      return {
        items: res.data.items.map((item) => ({
          id: item.id,
          type: item.kind.toLowerCase(),
          title: item.title,
          text: item.body,
          link: item.link,
          metadata: item.metadata,
          read: Boolean(item.readAt),
          occurred_at: item.occurredAt,
          created_at: item.createdAt,
        })),
        unread_count: res.data.unreadCount,
      };
    },
  },
  {
    method: "PATCH",
    pattern: /^\/notifications\/([^/]+)\/read$/,
    handler: async (m) => {
      const res = await http.patch(`/user/notifications/${m[1]}/read`);
      return res.data;
    },
  },
  {
    method: "POST",
    pattern: /^\/notifications\/read-all$/,
    handler: async () => {
      const res = await http.post("/user/notifications/read-all");
      return res.data;
    },
  },
  // --- Admin: kullanıcılar ---
  {
    method: "GET",
    pattern: /^\/users$/,
    handler: async () => {
      const res = await http.get("/admin/users");
      return res.data.map(toUiUser);
    },
  },
  {
    method: "POST",
    pattern: /^\/users$/,
    handler: async (_m, body) => {
      const res = await http.post("/admin/users", {
        email: body.email,
        name: body.name,
        role: toEduRole(body.role),
        sendActivation: Boolean(body.sendActivation),
        ...(body.password ? { password: body.password } : {}),
      });
      return {
        ...toUiUser(res.data),
        activation_email_sent: res.data.activationEmailSent,
        activation_email_error: res.data.activationEmailError,
      };
    },
  },
  {
    method: "DELETE",
    pattern: /^\/users\/([^/]+)$/,
    handler: async (m) => {
      await http.delete(`/admin/users/${m[1]}`);
      return { ok: true };
    },
  },
  {
    method: "PATCH",
    pattern: /^\/users\/([^/]+)$/,
    handler: async (m, body) => {
      const res = await http.patch(`/admin/users/${m[1]}`, body);
      return toUiUser(res.data);
    },
  },
  {
    method: "POST",
    pattern: /^\/users\/([^/]+)\/resend-activation$/,
    handler: async (m) => {
      const res = await http.post(`/admin/users/${m[1]}/resend-activation`);
      return res.data;
    },
  },

  // --- Admin: gruplar ---
  {
    method: "GET",
    pattern: /^\/groups$/,
    handler: async () => {
      const res = await http.get("/admin/groups");
      return res.data
        .filter((g) => g.active !== false)
        .map((g) => ({
          group_id: g.id,
          name: g.name,
          description: g.description,
          member_ids: (g.members || []).map((u) => u.id),
        }));
    },
  },
  {
    method: "POST",
    pattern: /^\/groups$/,
    handler: async (_m, body) => {
      const res = await http.post("/admin/groups", { name: body.name });
      const groupId = res.data.id;
      for (const userId of body.member_ids || []) {
        await http.post(`/admin/groups/${groupId}/members`, { userId });
      }
      return { group_id: groupId, name: res.data.name, member_ids: body.member_ids || [] };
    },
  },
  {
    method: "PUT",
    pattern: /^\/groups\/([^/]+)$/,
    handler: async (m, body) => {
      const groupId = m[1];
      const current = (await http.get("/admin/groups")).data.find((g) => g.id === groupId);
      if (!current) throw Object.assign(new Error("Grup bulunamadı"), { response: { status: 404, data: { error: "Grup bulunamadı" } } });

      if (body.name && body.name !== current.name) {
        await http.patch(`/admin/groups/${groupId}`, { name: body.name });
      }

      const currentIds = new Set((current.members || []).map((u) => u.id));
      const nextIds = new Set(body.member_ids || []);
      for (const userId of nextIds) {
        if (!currentIds.has(userId)) {
          await http.post(`/admin/groups/${groupId}/members`, { userId });
        }
      }
      for (const userId of currentIds) {
        if (!nextIds.has(userId)) {
          await http.delete(`/admin/groups/${groupId}/members?userId=${userId}`);
        }
      }
      return { group_id: groupId, name: body.name, member_ids: body.member_ids || [] };
    },
  },
  {
    method: "DELETE",
    pattern: /^\/groups\/([^/]+)$/,
    handler: async (m) => {
      // Atama/denetim geçmişi korunması için soft delete.
      await http.patch(`/admin/groups/${m[1]}`, { active: false });
      return { ok: true };
    },
  },

  // --- Admin: eğitimler (Course) ---
  {
    method: "GET",
    pattern: /^\/trainings$/,
    handler: async (_m, _body, query) => {
      const res = await http.get("/admin/courses");
      const status = query.get("status") || "active";
      return res.data
        .filter((course) => {
          if (status === "all") return true;
          if (status === "inactive") return course.active === false;
          return course.active !== false;
        })
        .map(mapCourse);
    },
  },
  {
    method: "POST",
    pattern: /^\/trainings$/,
    handler: async (_m, body) => {
      const res = await http.post("/admin/courses", {
        title: body.title,
        description: body.description || "",
      });
      return { training_id: res.data.id, title: res.data.title };
    },
  },
  {
    method: "GET",
    pattern: /^\/trainings\/([^/]+)$/,
    handler: async (m) => fetchTrainingDetail(m[1]),
  },
  {
    method: "PUT",
    pattern: /^\/trainings\/([^/]+)$/,
    handler: async (m, body) => {
      const courseId = m[1];
      if (body.checkpoints !== undefined) {
        await http.put(`/admin/courses/${courseId}/checkpoints`, {
          checkpoints: body.checkpoints.map((cp) => ({
            timeSec: Math.round(cp.time),
            questionId: cp.question_id,
            // null = süre sınırı yok
            timeoutSeconds:
              cp.timeout_seconds == null ? null : Number(cp.timeout_seconds) || 60,
            onFail:
              cp.on_fail === "previous"
                ? "PREVIOUS"
                : cp.on_fail === "retry" || cp.on_fail === "retry_limited"
                  ? cp.on_fail === "retry_limited" && cp.retry_exhausted === "previous"
                    ? "RETRY_PREVIOUS"
                    : "RETRY"
                  : "START",
            // Yalnızca sınırlı denemede sayı gönderilir; diğerlerinde null.
            maxAttempts:
              cp.on_fail === "retry_limited" ? Number(cp.attempts) || 3 : null,
          })),
        });
      }
      if (body.quiz) {
        await syncQuiz(courseId, body.quiz);
      }
      if (body.title || body.description !== undefined) {
        await http.patch(`/admin/courses/${courseId}`, {
          ...(body.title ? { title: body.title } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
        });
      }
      return fetchTrainingDetail(courseId);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/trainings\/([^/]+)$/,
    handler: async (m) => {
      // Rapor/denetim geçmişi korunması için soft delete.
      await http.patch(`/admin/courses/${m[1]}`, { active: false });
      return { ok: true };
    },
  },
  {
    method: "PATCH",
    pattern: /^\/trainings\/([^/]+)\/status$/,
    handler: async (m, body) => {
      const res = await http.patch(`/admin/courses/${m[1]}`, {
        active: Boolean(body.active),
      });
      return { ok: true, active: res.data.active };
    },
  },
  {
    method: "POST",
    pattern: /^\/trainings\/([^/]+)\/video$/,
    handler: async (m, body, _q, config) => {
      const res = await http.post(`/admin/courses/${m[1]}/video`, body, {
        onUploadProgress: config?.onUploadProgress,
      });
      return res.data;
    },
  },

  // --- Admin: soru bankası ---
  {
    method: "GET",
    pattern: /^\/question-categories$/,
    handler: async () => (await http.get("/admin/question-categories")).data,
  },
  {
    method: "POST",
    pattern: /^\/question-categories$/,
    handler: async (_m, body) =>
      (await http.post("/admin/question-categories", body)).data,
  },
  {
    method: "PATCH",
    pattern: /^\/question-categories\/([^/]+)$/,
    handler: async (m, body) =>
      (await http.patch(`/admin/question-categories/${m[1]}`, body)).data,
  },
  {
    method: "DELETE",
    pattern: /^\/question-categories\/([^/]+)$/,
    handler: async (m, _body, query) =>
      (
        await http.delete(`/admin/question-categories/${m[1]}`, {
          params: { mode: query.get("mode") },
        })
      ).data,
  },
  {
    method: "GET",
    pattern: /^\/questions$/,
    handler: async () => {
      const pools = (await http.get("/admin/pools")).data;
      return fetchQuestionBank(pools).map((q) => mapBankQuestion(q));
    },
  },
  {
    method: "POST",
    pattern: /^\/questions$/,
    handler: async (_m, body) => {
      const pools = (await http.get("/admin/pools")).data;
      const poolId = await ensureDefaultPool(pools);
      const res = await http.post(`/admin/pools/${poolId}/questions`, {
        prompt: body.text,
        ...(body.category_id ? { categoryId: body.category_id } : {}),
        type: body.qtype === "free_text" ? "FREE_TEXT" : "MULTIPLE_CHOICE",
        choices: body.qtype === "free_text" ? [] : toChoices(body),
      });
      return mapBankQuestion(res.data);
    },
  },
  {
    method: "POST",
    pattern: /^\/questions\/bulk$/,
    handler: async (_m, body) => {
      const pools = (await http.get("/admin/pools")).data;
      const poolId = await ensureDefaultPool(pools);
      const res = await http.post(`/admin/pools/${poolId}/questions/bulk`, {
        questions: body.questions.map((question) => ({
          prompt: question.text,
          ...(question.category_id ? { categoryId: question.category_id } : {}),
          type: question.qtype === "free_text" ? "FREE_TEXT" : "MULTIPLE_CHOICE",
          choices:
            question.qtype === "free_text" ? [] : toChoices(question),
        })),
      });
      return res.data.map((question) => mapBankQuestion(question));
    },
  },
  {
    method: "PUT",
    pattern: /^\/questions\/([^/]+)$/,
    handler: async (m, body) => {
      // Şıklar sınav cevap geçmişinde (QuizAnswer) referanslandığı için soru
      // yerinde değiştirilmez: eskisi pasifleştirilir, aynı havuza yenisi eklenir.
      const pools = (await http.get("/admin/pools")).data;
      const existing = fetchQuestionBank(pools).find((q) => q.id === m[1]);
      if (!existing) {
        const err = new Error("Soru bulunamadı");
        err.response = { status: 404, data: { error: err.message, detail: err.message } };
        throw err;
      }
      const res = await http.post(`/admin/pools/${existing._poolId}/questions`, {
        prompt: body.text,
        ...(body.category_id ? { categoryId: body.category_id } : {}),
        type: body.qtype === "free_text" ? "FREE_TEXT" : "MULTIPLE_CHOICE",
        choices: body.qtype === "free_text" ? [] : toChoices(body),
      });
      await http.patch(`/admin/questions/${m[1]}`, { active: false });
      return mapBankQuestion(res.data);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/questions\/([^/]+)$/,
    handler: async (m) => {
      // Cevap geçmişi korunması için soft delete.
      await http.patch(`/admin/questions/${m[1]}`, { active: false });
      return { ok: true };
    },
  },

  // --- Admin: atamalar ---
  {
    method: "GET",
    pattern: /^\/assignments$/,
    handler: async () => {
      // Kişi bazlı durum görünümü için kaynak enrollment raporudur.
      const res = await http.get("/admin/reports");
      return res.data.rows.map((r) => ({
        assignment_id: r.enrollmentId,
        user_name: r.user?.name,
        user_email: r.user?.email,
        training_id: r.course.id,
        training_title: r.course.title,
        status: toUiStatus(r.status, r.videoCompleted),
        start_at: r.startsAt,
        due_at: r.dueAt,
        reminder_days: r.reminderDays || 0,
      }));
    },
  },
  {
    method: "POST",
    pattern: /^\/assignments$/,
    handler: async (_m, body) => {
      const startsAt = body.start_at || null;
      const dueAt = body.due_at || null;
      let created = 0;
      for (const userId of body.user_ids || []) {
        await http.post("/admin/assignments", {
          courseId: body.training_id,
          target: "USER",
          userId,
          startsAt,
          dueAt,
          reminderDays: Number(body.reminder_days) || 0,
        });
        created += 1;
      }
      for (const groupId of body.group_ids || []) {
        const res = await http.post("/admin/assignments", {
          courseId: body.training_id,
          target: "GROUP",
          groupId,
          startsAt,
          dueAt,
          reminderDays: Number(body.reminder_days) || 0,
        });
        created += res.data.enrolled ?? 1;
      }
      return { created };
    },
  },
  {
    method: "DELETE",
    pattern: /^\/assignments\/([^/]+)$/,
    handler: async () => {
      // İzleme/sınav kayıtları denetim için korunur; atama silme desteklenmez.
      const msg = "Atama silme bu sürümde desteklenmiyor (denetim kayıtları korunur)";
      toast.error(msg);
      const err = new Error(msg);
      err.response = { status: 400, data: { error: msg, detail: msg } };
      throw err;
    },
  },

  // --- Admin: raporlar ---
  {
    method: "GET",
    pattern: /^\/reports\/users\/([^/]+)\/export$/,
    raw: true,
    handler: async (m, _b, _q, config) => {
      const userId = m[1];
      const fmt = config?.params?.fmt;
      if (fmt === "pdf") {
        const [reportRes, usersRes] = await Promise.all([
          http.get("/admin/reports", { params: { userId } }),
          http.get("/admin/users"),
        ]);
        const user = usersRes.data.find((item) => item.id === userId);
        const userName = user?.name || "Kullanıcı";
        const blob = await buildReportPdf(userName, reportRes.data.rows, "person");
        const safeName = userName
          .toLowerCase()
          .replace(/[^a-z0-9çğıöşü]+/gi, "-")
          .replace(/^-+|-+$/g, "");
        return {
          data: blob,
          headers: {
            "content-disposition": `attachment; filename="kisi-raporu-${safeName || "kullanici"}.pdf"`,
          },
        };
      }
      return http.get("/admin/audit/export", {
        params: { format: "xlsx", userId },
        responseType: "blob",
      });
    },
  },
  {
    method: "GET",
    pattern: /^\/reports\/users\/([^/]+)$/,
    handler: async (m) => {
      const userId = m[1];
      const res = await http.get("/admin/reports", { params: { userId } });
      return {
        user: { user_id: userId },
        rows: res.data.rows.map(mapReportRow),
      };
    },
  },
  {
    method: "GET",
    pattern: /^\/reports\/trainings\/([^/]+)\/export$/,
    raw: true,
    handler: async (m, _b, _q, config) => {
      const fmt = config?.params?.fmt;
      if (fmt === "pdf") {
        // PDF istemci tarafında üretilir (pdfmake); backend'e ihtiyaç yok.
        const courseId = m[1];
        const [reportRes, coursesRes] = await Promise.all([
          http.get("/admin/reports", { params: { courseId } }),
          http.get("/admin/courses"),
        ]);
        const course = coursesRes.data.find((c) => c.id === courseId);
        const blob = await buildReportPdf(course?.title || "Eğitim", reportRes.data.rows);
        const safeName = (course?.title || "egitim")
          .toLowerCase()
          .replace(/[^a-z0-9çğıöşü]+/gi, "-")
          .replace(/^-+|-+$/g, "");
        return {
          data: blob,
          headers: { "content-disposition": `attachment; filename="egitim-raporu-${safeName}.pdf"` },
        };
      }
      return http.get("/admin/audit/export", {
        params: { format: "xlsx", courseId: m[1] },
        responseType: "blob",
      });
    },
  },
  {
    method: "GET",
    pattern: /^\/reports\/trainings\/([^/]+)$/,
    handler: async (m) => {
      const courseId = m[1];
      const res = await http.get("/admin/reports", { params: { courseId } });
      return {
        training: { training_id: courseId },
        rows: res.data.rows.map(mapReportRow),
      };
    },
  },
  {
    method: "GET",
    pattern: /^\/reports\/free-text$/,
    handler: async (_m, _b, query, config) => {
      const courseId = config?.params?.training_id || query?.get("training_id");
      const userId = config?.params?.user_id || query?.get("user_id");
      const res = await http.get("/admin/reports/free-text", {
        params: {
          ...(courseId ? { courseId } : {}),
          ...(userId ? { userId } : {}),
        },
      });
      return res.data.rows.map((r) => ({
        id: r.id,
        source: r.source,
        user_name: r.user?.name,
        user_email: r.user?.email,
        training_title: r.course?.title,
        question_text: r.prompt,
        answer_text: r.textAnswer,
        position: r.positionSec ?? null,
        attempt_no: r.attemptNo ?? null,
        answered_at: r.answeredAt,
      }));
    },
  },
  {
    method: "GET",
    pattern: /^\/reports\/assignments\/([^/]+)\/detail$/,
    handler: async (m) => {
      const res = await http.get(`/admin/enrollments/${m[1]}`);
      const { enrollment, watchEvents, quizAttempts } = res.data;

      const EVENT_MAP = {
        START: "video_started",
        RESUME: "video_resumed",
        PAUSE: "video_paused",
        EXIT: "video_closed",
        COMPLETE: "video_completed",
        SEEK_BLOCKED: "İleri sarma engellendi (anti-skip)",
        CHECKPOINT_PASSED: "checkpoint_passed",
        CHECKPOINT_FAILED: "checkpoint_failed",
      };

      return {
        user: enrollment.user,
        progress: {
          watched_seconds: enrollment.totalWatchedSec || 0,
          video_completed: enrollment.videoCompleted,
          quiz_attempts: quizAttempts.map((a) => ({
            score: a.scorePercent,
            passed: a.passed,
            answers: a.answers.map((ans) =>
              ans.type === "FREE_TEXT"
                ? {
                    text: ans.prompt,
                    qtype: "free_text",
                    answer_text: ans.textAnswer,
                  }
                : {
                    text: ans.prompt,
                    qtype: "multiple_choice",
                    options: ans.choices.map((c) => c.text),
                    answer_index: ans.choices.findIndex((c) => c.id === ans.choiceId),
                    correct_index: ans.choices.findIndex((c) => c.isCorrect),
                    correct: ans.isCorrect,
                  },
            ),
          })),
        },
        // Kalp atışı kayıtları günlüğü boğmasın diye gösterilmez.
        events: watchEvents
          .filter((e) => e.eventType !== "HEARTBEAT")
          .map((e) => ({
            event_id: e.id,
            type: EVENT_MAP[e.eventType] || e.eventType,
            position: e.positionSec,
            answer_text: e.metadata?.textAnswer || null,
            created_at: e.createdAt,
          })),
      };
    },
  },

  // --- Admin: bildirimler (mock) ---
  {
    method: "GET",
    pattern: /^\/emails$/,
    // E-posta altyapısı yok; UI'deki mock liste boş gösterilir.
    handler: async () => [],
  },

  // --- Admin: genel bakış (dashboard) ---
  {
    method: "GET",
    pattern: /^\/reports\/overview$/,
    handler: async () => {
      const [users, courses, pools, reports] = await Promise.all([
        http.get("/admin/users"),
        http.get("/admin/courses"),
        http.get("/admin/pools"),
        http.get("/admin/reports"),
      ]);

      const totalAssignments = reports.data.summary.total;
      const completed = reports.data.summary.completed;

      const perTraining = new Map();
      for (const row of reports.data.rows) {
        const key = row.course.id;
        if (!perTraining.has(key)) {
          perTraining.set(key, { training_id: key, title: row.course.title, assigned: 0, completed: 0 });
        }
        const t = perTraining.get(key);
        t.assigned += 1;
        if (row.status === "COMPLETED") t.completed += 1;
      }

      return {
        total_users: users.data.filter((u) => u.active && u.role === "USER").length,
        total_trainings: courses.data.length,
        total_questions: pools.data.reduce((s, p) => s + (p.questionCount || 0), 0),
        total_assignments: totalAssignments,
        completed,
        completion_rate: totalAssignments ? Math.round((completed / totalAssignments) * 100) : 0,
        per_training: [...perTraining.values()],
      };
    },
  },

  // --- Çalışan: eğitim listesi ---
  {
    method: "GET",
    pattern: /^\/my\/assignments$/,
    handler: async () => {
      const res = await http.get("/user/courses");
      return res.data.map((e) => ({
        // edu_module'de assignment yerine enrollment/course kimliği kullanılır;
        // UI route'ları (/trainings/:id/watch) kurs id'si ile çalışır.
        assignment_id: e.course.id,
        training_id: e.course.id,
        status: toUiStatus(e.status, e.videoCompleted),
        training_title: e.course.title,
        training_description: e.course.description,
        watch_pct: Math.round(e.watchedPercent || 0),
        duration: e.course.durationSec || 0,
        content_type: e.course.pageCount ? "pdf" : e.course.contentType ? "video" : null,
        pdf_page_count: e.course.pageCount || 0,
        has_quiz: (e.course.questionCount || 0) > 0,
        quiz_question_count: e.course.questionCount || 0,
        checkpoint_count: e.course.checkpointCount || 0,
        due_at: e.dueAt,
      }));
    },
  },

  // --- Çalışan: izleme oturumu (learn) ---
  {
    method: "GET",
    pattern: /^\/learn\/([^/]+)$/,
    handler: async (m) => {
      const courseId = m[1];
      const play = (await http.get(`/user/courses/${courseId}/play`)).data;
      const hasQuiz = (play.course.questionCount || 0) > 0;

      // Kontrol noktaları: cevap gönderiminde answer_index -> choiceId
      // çevirisi için şık id'leri kurs bazında saklanır.
      const cpChoiceMap = {};
      const checkpoints = (play.checkpoints || []).map((cp) => {
        cpChoiceMap[cp.id] = cp.question.choices.map((c) => c.id);
        return {
          id: cp.id,
          time: cp.timeSec,
          timeout_seconds: cp.timeoutSeconds,
          on_fail:
            cp.onFail === "PREVIOUS" || cp.onFail === "RETRY_PREVIOUS"
              ? "previous"
              : "start",
          question: {
            text: cp.question.prompt,
            qtype: cp.question.type === "FREE_TEXT" ? "free_text" : "multiple_choice",
            options: cp.question.choices.map((c) => c.text),
          },
        };
      });

      learnCache.set(courseId, {
        ...(learnCache.get(courseId) || {}),
        duration: play.video.durationSec,
        contentType: play.video.pageCount ? "pdf" : "video",
        hasQuiz,
        cpChoiceMap,
      });

      let quiz = null;
      if (hasQuiz) {
        let questions = [];
        let passScore = play.course.passPercent;
        let scoringMode = "auto";
        // Quiz soruları backend gate'i gereği ancak video tamamlandıktan
        // sonra çekilebilir (tamamlanmış eğitimde tekrar gerekmez).
        if (play.progress.completed && play.progress.status !== "COMPLETED") {
          try {
            const q = (await http.get(`/user/courses/${courseId}/quiz`)).data;
            questions = mapQuizQuestions(courseId, q);
            passScore = q.passPercent;
            scoringMode = q.scoringMode === "PER_QUESTION" ? "per_question" : "auto";
          } catch {}
        }
        // Sorular video bitmeden çekilemediği için gerçek sayı ayrıca verilir.
        quiz = {
          questions,
          pass_score: passScore,
          scoring_mode: scoringMode,
          question_count: play.course.questionCount || 0,
        };
      }

      return {
        assignment: {
          assignment_id: courseId,
          status: toUiStatus(play.progress.status, play.progress.completed),
          due_at: play.dueAt,
        },
        training: {
          training_id: courseId,
          title: play.course.title,
          description: play.course.description,
          duration: play.video.durationSec,
          content_type: play.video.pageCount ? "pdf" : "video",
          pdf_page_count: play.video.pageCount || 0,
          checkpoints,
          quiz,
        },
        progress: {
          current_position: play.progress.positionSec || 0,
          max_position: play.progress.maxReachedSec || 0,
          video_completed: play.progress.completed,
          checkpoints_passed: play.passedCheckpointIds || [],
        },
      };
    },
  },
  {
    method: "POST",
    pattern: /^\/learn\/([^/]+)\/heartbeat$/,
    handler: async (m, body) => {
      const res = await http.post(`/user/courses/${m[1]}/progress`, {
        positionSec: body.position ?? 0,
        eventType: "HEARTBEAT",
      });
      return {
        current_position: res.data.progress.positionSec,
        max_position: res.data.progress.maxReachedSec,
      };
    },
  },
  {
    method: "POST",
    pattern: /^\/learn\/([^/]+)\/event$/,
    handler: async (m, body) => {
      // START/RESUME olayları edu_module'de play endpoint'i tarafından
      // otomatik loglanır; burada yalnızca karşılığı olanlar iletilir.
      const eventType = { video_paused: "PAUSE", video_closed: "EXIT" }[body.type];
      if (!eventType) return { ok: true };
      await http.post(`/user/courses/${m[1]}/progress`, {
        positionSec: body.position ?? 0,
        eventType,
      });
      return { ok: true };
    },
  },
  {
    method: "POST",
    pattern: /^\/learn\/([^/]+)\/checkpoint$/,
    handler: async (m, body) => {
      const courseId = m[1];
      let entry = learnCache.get(courseId);
      // Sayfa yenilendiyse şık haritasını play verisinden tazele.
      if (!entry?.cpChoiceMap?.[body.checkpoint_id]) {
        const play = (await http.get(`/user/courses/${courseId}/play`)).data;
        const cpChoiceMap = {};
        for (const cp of play.checkpoints || []) {
          cpChoiceMap[cp.id] = cp.question.choices.map((c) => c.id);
        }
        entry = { ...(entry || {}), cpChoiceMap };
        learnCache.set(courseId, entry);
      }
      const choiceIds = entry.cpChoiceMap[body.checkpoint_id] || [];
      const res = await http.post(`/user/courses/${courseId}/checkpoint`, {
        checkpointId: body.checkpoint_id,
        choiceId:
          body.answer_index != null ? choiceIds[body.answer_index] : undefined,
        textAnswer: body.answer_text || undefined,
        timedOut: !!body.timed_out,
      });
      return {
        passed: res.data.passed,
        retry: res.data.retry || false,
        remaining: res.data.remaining ?? null,
        rewind_to: res.data.rewindTo ?? 0,
      };
    },
  },
  {
    method: "POST",
    pattern: /^\/learn\/([^/]+)\/video-complete$/,
    handler: async (m) => {
      const courseId = m[1];
      const entry = learnCache.get(courseId) || {};
      const res = await http.post(`/user/courses/${courseId}/progress`, {
        positionSec: entry.duration ?? 0,
        eventType: "COMPLETE",
      });
      return {
        ok: true,
        has_quiz: !!entry.hasQuiz,
        status: toUiStatus(res.data.progress.status, res.data.progress.completed),
      };
    },
  },
  {
    method: "POST",
    pattern: /^\/learn\/([^/]+)\/quiz$/,
    handler: async (m, body) => {
      const courseId = m[1];
      let entry = learnCache.get(courseId);
      // Sayfa quiz aşamasında yenilendiyse şık haritasını tazele (soru sırası
      // backend'de deterministik olduğu için indeksler tutarlıdır).
      if (!entry?.choiceMap) {
        const q = (await http.get(`/user/courses/${courseId}/quiz`)).data;
        mapQuizQuestions(courseId, q);
        entry = learnCache.get(courseId);
      }
      const answers = (body.answers || [])
        .map((a) => {
          // Çoktan seçmeli: şık indeksi choiceId'ye çevrilir.
          if (a.answer_index != null && entry.choiceMap[a.question_id]?.length) {
            return {
              questionId: a.question_id,
              choiceId: entry.choiceMap[a.question_id][a.answer_index],
            };
          }
          // Serbest metin: cevap metni olduğu gibi iletilir.
          if (a.answer_text) {
            return { questionId: a.question_id, textAnswer: a.answer_text };
          }
          return null;
        })
        .filter(Boolean);
      const res = await http.post(`/user/courses/${courseId}/quiz`, { answers });
      return {
        score: Math.round(res.data.attempt.scorePercent),
        passed: res.data.attempt.passed,
        pass_score: res.data.passPercent,
        answers: [],
      };
    },
  },
];

// ---------------------------------------------------------------------------
// Dispatch mekanizması: axios benzeri imza korunur (res.data ile erişim)
// ---------------------------------------------------------------------------

function parseUrl(url) {
  const [path, query = ""] = url.split("?");
  return { path, query: new URLSearchParams(query) };
}

async function dispatch(method, url, body, config) {
  const { path, query } = parseUrl(url);
  const route = routes.find((r) => r.method === method && r.pattern.test(path));
  if (!route) {
    const err = new Error(`API adapter: henüz eşlenmemiş endpoint: ${method} ${path}`);
    err.response = { status: 501, data: { error: err.message } };
    console.error(err.message);
    throw err;
  }
  const match = path.match(route.pattern);
  try {
    const data = await route.handler(match, body, query, config);
    // raw: handler axios yanıtını olduğu gibi döner (blob indirme, header erişimi)
    return route.raw ? data : { data };
  } catch (err) {
    // UI, FastAPI sözleşmesindeki `detail` alanını okur; edu_module `error` döner.
    if (err?.response?.data?.error && err.response.data.detail == null) {
      err.response.data.detail = err.response.data.error;
    }
    throw err;
  }
}

export const api = {
  get: (url, config) => dispatch("GET", url, undefined, config),
  post: (url, body, config) => dispatch("POST", url, body, config),
  put: (url, body, config) => dispatch("PUT", url, body, config),
  patch: (url, body, config) => dispatch("PATCH", url, body, config),
  delete: (url, config) => dispatch("DELETE", url, undefined, config),
};

// Ana eğitim içeriği (MP4/PDF): kurs bazlı kimlik doğrulamalı stream endpoint'i.
export const videoUrl = (trainingId) =>
  `${BACKEND_URL}/api/user/courses/${trainingId}/video`;
export const contentUrl = videoUrl;

// ---------------------------------------------------------------------------
// UI yardımcıları (değişmedi)
// ---------------------------------------------------------------------------

export const fmtTime = (s) => {
  if (s == null || isNaN(s)) return "00:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

export const fmtDate = (iso) => {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "-";
  }
};

export const STATUS_TR = {
  assigned: "Atandı",
  in_progress: "Devam Ediyor",
  video_completed: "İçerik Tamamlandı",
  completed: "Eğitim Tamamlandı",
  overdue: "Süresi Doldu",
};

export const STATUS_COLOR = {
  assigned: "bg-slate-100 text-slate-600",
  in_progress: "bg-brand-50 text-brand-700",
  video_completed: "bg-amber-50 text-amber-600",
  completed: "bg-emerald-50 text-emerald-600",
  overdue: "bg-red-50 text-red-600",
};
