import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { api, contentUrl, fmtTime } from "@/lib/api";
import { PageHeader } from "@/components/Layout";
import PdfPreview from "@/components/PdfPreview";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, UploadCloud, Trash2, Plus, CheckCircle2, Clock, ChevronLeft, ChevronRight, ChevronsUpDown, Eye, FileText, Search } from "lucide-react";

const inputCls = "w-full px-4 py-2.5 rounded-xl border border-navy-900/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent";

// Sınavın toplam puanı; soru puanlarının toplamı bunu geçemez.
const MAX_TOTAL_POINTS = 100;
const PASS_SCORE_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

// Soru puanı 1-100 arası tam sayı; boş/gecersiz giriş 1 sayılır.
const clampPoints = (value) => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_TOTAL_POINTS);
};
const btnPrimary = "px-5 py-2.5 rounded-full bg-navy-900 text-white text-sm font-medium hover:bg-navy-800 hover:shadow-glow-cyan-sm active:scale-[0.98] transition-[background-color,transform,box-shadow] disabled:opacity-40";

// PDF sayfa ağacındaki en yüksek /Count değeri toplam sayfa sayısıdır.
// Yönetici yüklemesinde tarayıcıda hesaplanır, sunucuya da sınır kontrolüyle iletilir.
const countPdfPages = async (file) => {
  const text = new TextDecoder("latin1").decode(await file.arrayBuffer());
  const counts = [];
  const pageTree = /\/Type\s*\/Pages\b[\s\S]{0,1200}?\/Count\s+(\d+)/g;
  let match;
  while ((match = pageTree.exec(text))) counts.push(Number(match[1]));
  if (counts.length) return Math.max(...counts);
  return (text.match(/\/Type\s*\/Page\b/g) || []).length;
};

export default function TrainingDetailPage() {
  const { trainingId } = useParams();
  const [training, setTraining] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [questionCategories, setQuestionCategories] = useState([]);
  const [quizCategoryFilter, setQuizCategoryFilter] = useState("all");
  const [quizCategoryPickerOpen, setQuizCategoryPickerOpen] = useState(false);
  const [quizQuestionSearch, setQuizQuestionSearch] = useState("");
  const [uploading, setUploading] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [passEnabled, setPassEnabled] = useState(false);
  // Sınav puanlaması: "auto" her soruyu eşit sayar, "per_question" puanları uygular.
  const [scoringMode, setScoringMode] = useState("auto");
  const [questionPoints, setQuestionPoints] = useState({});
  // Önizleme üzerinden kontrol noktası ekleme akışı
  const [previewTime, setPreviewTime] = useState(0);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPaused, setPreviewPaused] = useState(true);
  const [cpPanelOpen, setCpPanelOpen] = useState(false);
  const [cpAnchor, setCpAnchor] = useState(0); // panel açıldığı anda seçilen saniye
  const [cpInline, setCpInline] = useState({
    question_id: "",
    has_timeout: false,
    timeout_seconds: 60,
    on_fail: "start",
    attempts: 3,
    retry_exhausted: "start",
  });
  const [cpAdding, setCpAdding] = useState(false);
  // Kontrol noktası için soru kaynağı: havuzdan seç / yeni soru yaz (popup)
  const [cpSource, setCpSource] = useState("pool");
  const [cpQuestionPickerOpen, setCpQuestionPickerOpen] = useState(false);
  const [cpQuestionSearch, setCpQuestionSearch] = useState("");
  const [cpQModal, setCpQModal] = useState(false);
  const [cpQForm, setCpQForm] = useState({ text: "", qtype: "multiple_choice", options: ["", ""], correct_index: 0, category_id: "" });
  const [cpQSaving, setCpQSaving] = useState(false);
  const [editingBankQuestion, setEditingBankQuestion] = useState(null);
  const [bankQuestionForm, setBankQuestionForm] = useState({ text: "", qtype: "multiple_choice", options: ["", ""], correct_index: 0, category_id: "" });
  const [bankQuestionSaving, setBankQuestionSaving] = useState(false);
  const fileRef = useRef(null);
  const previewRef = useRef(null);

  const load = useCallback(() => {
    api.get(`/trainings/${trainingId}`).then((r) => setTraining(r.data));
    api.get("/questions").then((r) => setQuestions(r.data));
    api.get("/question-categories").then((r) => setQuestionCategories(r.data));
  }, [trainingId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setSelectedIds(training?.quiz?.question_ids || []);
    setPassEnabled(training?.quiz?.pass_score != null);
    setScoringMode(training?.quiz?.scoring_mode || "auto");
    setQuestionPoints(training?.quiz?.question_points || {});
  }, [training]);

  const uploadContent = async (file) => {
    if (!file) return;
    if (
      training?.video_filename &&
      !window.confirm("İçeriği değiştirmek mevcut kontrol noktalarını ve kullanıcı ilerlemelerini sıfırlar. Devam edilsin mi?")
    ) {
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    const isPdfFile = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
    const isVideoFile = file.name.toLowerCase().endsWith(".mp4") || file.type === "video/mp4";
    if (!isPdfFile && !isVideoFile) return toast.error("Yalnızca MP4 video veya PDF yükleyebilirsiniz");
    if (isPdfFile && file.size > 50 * 1024 * 1024) return toast.error("PDF 50MB sınırını aşıyor");
    if (isVideoFile && file.size > 1024 * 1024 * 1024) return toast.error("Video 1GB sınırını aşıyor");

    let duration = 0;
    let pageCount = 0;
    if (isPdfFile) {
      pageCount = await countPdfPages(file);
      if (!pageCount) return toast.error("PDF sayfa sayısı belirlenemedi");
    } else {
      duration = await new Promise((resolve) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(v.duration || 0); };
        v.onerror = () => resolve(0);
        v.src = URL.createObjectURL(file);
      });
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("duration", duration);
    if (isPdfFile) fd.append("pageCount", pageCount);
    setUploading(1);
    try {
      await api.post(`/trainings/${trainingId}/video`, fd, {
        onUploadProgress: (e) => setUploading(Math.max(1, Math.round((e.loaded / e.total) * 100))),
      });
      toast.success(isPdfFile ? "PDF yüklendi" : "Video yüklendi");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "İçerik yüklenemedi");
    } finally {
      setUploading(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const saveCheckpoints = async (checkpoints) => {
    const res = await api.put(`/trainings/${trainingId}`, { checkpoints });
    setTraining(res.data);
  };

  const removeCheckpoint = async (id) => {
    try {
      await saveCheckpoints(training.checkpoints.filter((c) => c.id !== id));
      toast.success("Kontrol noktası silindi");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Kontrol noktası silinemedi");
    }
  };

  // Önizlemede seçili ana kontrol noktası ekleme paneli aç/kapat.
  const openCpPanel = () => {
    setCpAnchor(training?.content_type === "pdf" ? previewPage : Math.floor(previewRef.current?.currentTime || 0));
    setCpInline({
      question_id: "",
      has_timeout: false,
      timeout_seconds: 60,
      on_fail: "start",
      attempts: 3,
      retry_exhausted: "start",
    });
    setCpSource("pool");
    setCpQuestionPickerOpen(false);
    setCpQuestionSearch("");
    setCpPanelOpen(true);
  };

  // Serbest metinde deneme hakkı politikaları anlamsızdır; sarma hedefi korunur.
  const selectCpQuestion = (questionId) => {
    const isFreeText = questions.find((q) => q.question_id === questionId)?.qtype === "free_text";
    setCpInline((f) => ({
      ...f,
      question_id: questionId,
      on_fail: isFreeText && f.on_fail !== "previous" ? "start" : f.on_fail,
    }));
  };

  // Popup'tan yeni soru: soru havuzuna eklenir ve kontrol noktası için seçilir.
  const saveCpQuestion = async () => {
    setCpQSaving(true);
    try {
      const filledOptions = cpQForm.options
        .map((option, originalIndex) => ({ option, originalIndex }))
        .filter(({ option }) => option.trim());
      const res = await api.post("/questions", {
        text: cpQForm.text,
        qtype: cpQForm.qtype,
        options: cpQForm.qtype === "free_text" ? [] : filledOptions.map(({ option }) => option),
        correct_index: cpQForm.qtype === "free_text" ? null : filledOptions.findIndex(({ originalIndex }) => originalIndex === cpQForm.correct_index),
        category_id: cpQForm.category_id,
      });
      setQuestions((prev) => [...prev, res.data]);
      setCpInline((f) => ({
        ...f,
        question_id: res.data.question_id,
        on_fail:
          cpQForm.qtype === "free_text" && f.on_fail !== "previous" ? "start" : f.on_fail,
      }));
      setCpQModal(false);
      setCpSource("pool");
      toast.success("Soru havuza eklendi ve kontrol noktası için seçildi");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Soru kaydedilemedi");
    } finally {
      setCpQSaving(false);
    }
  };

  const setCpQOption = (i, v) => setCpQForm((f) => ({ ...f, options: f.options.map((o, j) => (j === i ? v : o)) }));

  const openBankQuestionEditor = (question) => {
    setBankQuestionForm({
      text: question.text,
      qtype: question.qtype,
      options: question.options?.length ? question.options : ["", ""],
      correct_index: question.correct_index ?? 0,
      category_id: question.category_id || "",
    });
    setEditingBankQuestion(question);
  };

  const setBankQuestionOption = (index, value) =>
    setBankQuestionForm((current) => ({
      ...current,
      options: current.options.map((option, itemIndex) =>
        itemIndex === index ? value : option,
      ),
    }));

  const saveBankQuestion = async () => {
    if (!editingBankQuestion) return;
    const filledOptions = bankQuestionForm.options
      .map((option, originalIndex) => ({ option, originalIndex }))
      .filter(({ option }) => option.trim());
    setBankQuestionSaving(true);
    try {
      const res = await api.put(`/questions/${editingBankQuestion.question_id}`, {
        ...bankQuestionForm,
        options:
          bankQuestionForm.qtype === "free_text"
            ? []
            : filledOptions.map(({ option }) => option),
        correct_index:
          bankQuestionForm.qtype === "free_text"
            ? null
            : filledOptions.findIndex(
                ({ originalIndex }) => originalIndex === bankQuestionForm.correct_index,
              ),
      });
      const updated = res.data;
      const oldId = editingBankQuestion.question_id;
      setQuestions((current) =>
        current.map((question) => (question.question_id === oldId ? updated : question)),
      );
      setSelectedIds((current) =>
        current.map((questionId) => (questionId === oldId ? updated.question_id : questionId)),
      );
      setQuestionPoints((current) => {
        if (current[oldId] == null) return current;
        const next = { ...current, [updated.question_id]: current[oldId] };
        delete next[oldId];
        return next;
      });
      setCpInline((current) =>
        current.question_id === oldId
          ? { ...current, question_id: updated.question_id }
          : current,
      );
      api.get("/question-categories").then((categoryRes) =>
        setQuestionCategories(categoryRes.data),
      );
      setEditingBankQuestion(null);
      toast.success("Soru güncellendi");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Soru güncellenemedi");
    } finally {
      setBankQuestionSaving(false);
    }
  };

  const addCheckpointFromPreview = async () => {
    if (!cpInline.question_id) return toast.error("Bir soru seçin");
    if (training.content_type === "pdf" && (cpAnchor < 1 || cpAnchor > training.pdf_page_count)) return toast.error("Sayfa PDF aralığını aşıyor");
    if (training.content_type !== "pdf" && training.duration && cpAnchor >= training.duration) return toast.error("Süre video uzunluğunu aşıyor");
    setCpAdding(true);
    try {
      await saveCheckpoints([
        ...(training.checkpoints || []),
        {
          time: cpAnchor,
          question_id: cpInline.question_id,
          // null = süre sınırı yok
          timeout_seconds: cpInline.has_timeout ? Number(cpInline.timeout_seconds) || 60 : null,
          on_fail: cpInline.on_fail,
          attempts: cpInline.on_fail === "retry_limited" ? Number(cpInline.attempts) || 3 : null,
          retry_exhausted: cpInline.retry_exhausted,
        },
      ]);
      toast.success(`Kontrol noktası eklendi (${training.content_type === "pdf" ? `Sayfa ${cpAnchor}` : fmtTime(cpAnchor)})`);
      setCpPanelOpen(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Kontrol noktası eklenemedi");
    } finally {
      setCpAdding(false);
    }
  };

  // Seçim önce yerelde tutulur; "Seçili Soruları Eğitime Ekle" ile kaydedilir.
  const toggleQuizQuestion = (qid) => {
    setSelectedIds((prev) => (prev.includes(qid) ? prev.filter((x) => x !== qid) : [...prev, qid]));
  };

  // Sorunun puanı, diğer soruların toplamıyla birlikte 100'ü geçemez.
  const setQuestionPoint = (qid, value, maxAllowed) => {
    const n = Math.round(Number(value));
    if (Number.isFinite(n) && n > maxAllowed) {
      toast.error(
        maxAllowed > 0
          ? `Toplam puan ${MAX_TOTAL_POINTS} olabilir; bu soruya en fazla ${maxAllowed} puan verebilirsiniz.`
          : `Toplam puan ${MAX_TOTAL_POINTS}'e ulaştı; önce diğer soruların puanını düşürün.`,
      );
      setQuestionPoints((prev) => ({ ...prev, [qid]: Math.max(1, maxAllowed) }));
      return;
    }
    setQuestionPoints((prev) => ({ ...prev, [qid]: value }));
  };

  const saveQuizQuestions = async () => {
    setSavingQuiz(true);
    try {
      // Yalnızca soru listesi ve puanlama gönderilir; geçme notu ayrı akışta güncellenir.
      const res = await api.put(`/trainings/${trainingId}`, {
        quiz: {
          question_ids: selectedIds,
          question_points: Object.fromEntries(
            selectedIds.map((id) => [id, clampPoints(questionPoints[id])]),
          ),
          scoring_mode: scoringMode,
        },
      });
      setTraining(res.data);
      toast.success(`Sınav güncellendi (${selectedIds.length} soru)`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Sınav soruları kaydedilemedi");
    } finally {
      setSavingQuiz(false);
    }
  };

  const setPassScore = async (v) => {
    try {
      // Yalnızca geçme notu gönderilir; soru listesi bu akışta değişmez.
      const res = await api.put(`/trainings/${trainingId}`, { quiz: { pass_score: v === "" ? null : Number(v) } });
      setTraining(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Geçme notu kaydedilemedi");
    }
  };

  if (!training) return <div className="w-6 h-6 border-2 border-slate-200 border-t-navy-900 rounded-full animate-spin" />;

  const qById = Object.fromEntries(questions.map((q) => [q.question_id, q]));
  const cpSelectedIsFreeText = qById[cpInline.question_id]?.qtype === "free_text";
  const savedIds = training.quiz?.question_ids || [];
  const savedPoints = training.quiz?.question_points || {};
  const savedMode = training.quiz?.scoring_mode || "auto";
  const selectionDirty =
    selectedIds.length !== savedIds.length || selectedIds.some((id) => !savedIds.includes(id));
  const pointsDirty =
    scoringMode === "per_question" &&
    selectedIds.some((id) => clampPoints(questionPoints[id]) !== (savedPoints[id] ?? 1));
  const quizDirty = selectionDirty || pointsDirty || scoringMode !== savedMode;
  const totalPoints = selectedIds.reduce(
    (sum, id) => sum + (scoringMode === "per_question" ? clampPoints(questionPoints[id]) : 1),
    0,
  );
  const pointsOverLimit = scoringMode === "per_question" && totalPoints > MAX_TOTAL_POINTS;
  const normalizedQuestionSearch = quizQuestionSearch.trim().toLocaleLowerCase("tr-TR");
  const filteredQuizQuestions = questions.filter((question) => {
    const matchesCategory =
      quizCategoryFilter === "all" || question.category_id === quizCategoryFilter;
    const searchableContent = [question.text, ...(question.options || [])]
      .join(" ")
      .toLocaleLowerCase("tr-TR");
    return matchesCategory &&
      (!normalizedQuestionSearch || searchableContent.includes(normalizedQuestionSearch));
  });
  const selectedQuizCategory = questionCategories.find(
    (category) => category.id === quizCategoryFilter,
  );
  const selectedCategoryQuestions = quizCategoryFilter === "all"
    ? []
    : questions.filter((question) => question.category_id === quizCategoryFilter);
  const selectedCategoryQuestionIds = selectedCategoryQuestions.map(
    (question) => question.question_id,
  );
  const allSelectedCategoryQuestionsSelected =
    selectedCategoryQuestionIds.length > 0 &&
    selectedCategoryQuestionIds.every((questionId) => selectedIds.includes(questionId));

  const toggleAllSelectedCategoryQuestions = () => {
    const categoryIds = new Set(selectedCategoryQuestionIds);
    setSelectedIds((current) => {
      if (allSelectedCategoryQuestionsSelected) {
        return current.filter((questionId) => !categoryIds.has(questionId));
      }
      return [...new Set([...current, ...selectedCategoryQuestionIds])];
    });
  };
  const isPdf = training.content_type === "pdf";
  const fmtPosition = (value) => isPdf ? `Sayfa ${value}` : fmtTime(value);

  return (
    <div className="fade-up" data-testid="training-detail-page">
      <Link to="/admin/trainings" data-testid="back-to-trainings" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-navy-950 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Eğitimlere Dön
      </Link>
      <PageHeader overline="Eğitim Düzenleyici" title={training.title} subtitle={training.description} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ANA EĞİTİM İÇERİĞİ */}
        <div className="n-card p-8">
          <h2 className="text-lg font-medium tracking-tight text-navy-950 mb-6">Eğitim İçeriği</h2>
          {training.video_filename ? (
            <div>
              {isPdf ? (
                <div>
                  <PdfPreview
                    trainingId={training.training_id}
                    page={previewPage}
                    pageCount={training.pdf_page_count}
                    onPageChange={setPreviewPage}
                  />
                  <div className="flex items-center justify-center gap-4 mt-3">
                    <button type="button" onClick={() => setPreviewPage((p) => Math.max(1, p - 1))} disabled={previewPage <= 1} className="p-2 rounded-full border border-navy-900/10 disabled:opacity-30">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm text-slate-600 tabular-nums">Sayfa {previewPage} / {training.pdf_page_count}</span>
                    <button type="button" onClick={() => setPreviewPage((p) => Math.min(training.pdf_page_count, p + 1))} disabled={previewPage >= training.pdf_page_count} className="p-2 rounded-full border border-navy-900/10 disabled:opacity-30">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <video
                    ref={previewRef}
                    src={contentUrl(training.training_id)}
                    controls
                    className="w-full rounded-xl bg-black"
                    data-testid="admin-video-preview"
                    onTimeUpdate={() => setPreviewTime(previewRef.current?.currentTime || 0)}
                    onPause={() => setPreviewPaused(true)}
                    onPlay={() => setPreviewPaused(false)}
                  />

                  {/* Kontrol noktası şeridi: sarı işaretlere tıklayınca o ana gider */}
                  {(training.checkpoints || []).length > 0 && training.duration > 0 && (
                    <div className="relative h-2 mt-3 rounded-full bg-slate-100" data-testid="cp-preview-strip">
                      <div className="absolute inset-y-0 left-0 rounded-full bg-brand-500/30" style={{ width: `${Math.min(100, (previewTime / training.duration) * 100)}%` }} />
                      {(training.checkpoints || []).map((cp) => (
                        <button
                          key={cp.id}
                          data-testid={`cp-preview-marker-${cp.id}`}
                          title={`${fmtTime(cp.time)} · ${qById[cp.question_id]?.text || "Soru silinmiş"}`}
                          onClick={() => {
                            const v = previewRef.current;
                            if (!v) return;
                            v.currentTime = cp.time;
                            v.pause();
                            setPreviewTime(cp.time);
                          }}
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-amber-400 border-2 border-white shadow hover:scale-125 transition-transform"
                          style={{ left: `${Math.min(100, (cp.time / training.duration) * 100)}%` }}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center justify-between gap-3 flex-wrap mt-4">
                <p className="text-sm text-slate-400">
                  {isPdf ? `${training.pdf_page_count} sayfa` : `Süre: ${fmtTime(training.duration)}`} · {(training.video_size / 1024 / 1024).toFixed(1)} MB
                </p>
                <button data-testid="replace-video-btn" onClick={() => fileRef.current?.click()} className="text-sm text-brand-600 font-medium hover:underline">İçeriği değiştir</button>
              </div>

              {/* Duraklatılan ana kontrol noktası ekleme */}
              {(isPdf || previewPaused) && !cpPanelOpen && (
                <div className="flex items-center justify-between gap-3 flex-wrap mt-3 px-4 py-3 rounded-xl bg-[#F5F8FA] border n-hairline fade-up">
                  <span className="flex items-center gap-1.5 text-sm text-slate-600 tabular-nums">
                    {isPdf ? <FileText className="w-3.5 h-3.5 text-brand-600" /> : <Clock className="w-3.5 h-3.5 text-brand-600" />}
                    Seçilen {isPdf ? "sayfa" : "an"}: <span className="font-medium text-navy-950">{isPdf ? previewPage : fmtTime(Math.floor(previewTime))}</span>
                  </span>
                  <button data-testid="cp-preview-add-btn" className={btnPrimary + " !px-4 !py-2"} onClick={openCpPanel}>
                    <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Kontrol Noktası Ekle</span>
                  </button>
                </div>
              )}

              {cpPanelOpen && (
                <div className="mt-3 p-5 rounded-xl bg-[#F5F8FA] border n-hairline space-y-3 fade-up" data-testid="cp-preview-panel">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-navy-950 flex items-center gap-1.5">
                      {isPdf ? <FileText className="w-3.5 h-3.5 text-brand-600" /> : <Clock className="w-3.5 h-3.5 text-brand-600" />}
                      {fmtPosition(cpAnchor)} noktasına kontrol noktası
                    </p>
                    <button data-testid="cp-preview-cancel-btn" onClick={() => setCpPanelOpen(false)} className="text-sm text-slate-400 hover:text-slate-700 transition-colors">Vazgeç</button>
                  </div>
                  <div className="flex items-center gap-5 flex-wrap">
                    <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                      <input
                        data-testid="cp-source-new"
                        type="radio"
                        name="cp-question-source"
                        className="accent-navy-900"
                        checked={cpSource === "new"}
                        onChange={() => { setCpSource("new"); setCpQForm({ text: "", qtype: "multiple_choice", options: ["", ""], correct_index: 0, category_id: "" }); setCpQModal(true); }}
                      />
                      Yeni bir soru yazmak istiyorum
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                      <input
                        data-testid="cp-source-pool"
                        type="radio"
                        name="cp-question-source"
                        className="accent-navy-900"
                        checked={cpSource === "pool"}
                        onChange={() => setCpSource("pool")}
                      />
                      Soru havuzundan seçmek istiyorum
                    </label>
                  </div>
                  {cpSource === "pool" && (
                  <>
                  <Popover
                    open={cpQuestionPickerOpen}
                    onOpenChange={(open) => {
                      setCpQuestionPickerOpen(open);
                      if (!open) setCpQuestionSearch("");
                    }}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        data-testid="cp-preview-question-select"
                        role="combobox"
                        aria-expanded={cpQuestionPickerOpen}
                        className={`${inputCls} flex items-center justify-between gap-3 text-left ${cpQuestionPickerOpen ? "ring-2 ring-brand-500 border-transparent" : ""}`}
                      >
                        <span className={`truncate ${cpInline.question_id ? "text-navy-950" : "text-slate-400"}`}>
                          {cpInline.question_id && qById[cpInline.question_id]
                            ? qById[cpInline.question_id].text
                            : "Sorulacak soruyu seçin..."}
                        </span>
                        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[20rem] overflow-hidden rounded-xl p-0 shadow-xl">
                      <Command shouldFilter>
                        <CommandInput
                          data-testid="cp-preview-question-search"
                          placeholder="Soru metni veya seçeneklerde ara..."
                          value={cpQuestionSearch}
                          onValueChange={setCpQuestionSearch}
                        />
                        <CommandList className="max-h-80 p-1">
                          <CommandEmpty>Aramanızla eşleşen soru bulunamadı.</CommandEmpty>
                          <CommandGroup heading={`${questions.length} soru`}>
                            {questions.map((q) => (
                              <CommandItem
                                key={q.question_id}
                                value={`${q.question_id} ${q.category || "Genel"} ${q.qtype === "free_text" ? "serbest metin" : "çoktan seçmeli"} ${q.text} ${(q.options || []).join(" ")}`}
                                onSelect={() => {
                                  selectCpQuestion(q.question_id);
                                  setCpQuestionPickerOpen(false);
                                  setCpQuestionSearch("");
                                }}
                                className="items-start gap-2 rounded-lg px-3 py-2.5"
                              >
                                <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${cpInline.question_id === q.question_id ? "text-emerald-500" : "text-slate-200"}`} />
                                <span className="min-w-0">
                                  <span className="block truncate text-sm text-navy-950">{q.text}</span>
                                  <span className="mt-0.5 block truncate text-xs text-slate-400">
                                    {q.category || "Genel"} · {q.qtype === "free_text" ? "Serbest Metin" : "Çoktan Seçmeli"}
                                  </span>
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {cpInline.question_id && qById[cpInline.question_id] && (
                    cpSelectedIsFreeText ? (
                      <p className="px-3 py-2 rounded-lg text-xs text-amber-700 bg-amber-50 border border-amber-200">
                        Serbest metin soru: doğru cevap yoktur. Boş olmayan bir cevap yazan kullanıcı geçer, cevap raporlarda görünür.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {(qById[cpInline.question_id].options || []).map((o, i) => {
                          const correct = i === qById[cpInline.question_id].correct_index;
                          return (
                            <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${correct ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-navy-900/5 bg-white text-slate-600"}`}>
                              <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${correct ? "text-emerald-500" : "text-slate-200"}`} />
                              {o}
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}
                  <div className="flex items-center gap-5 flex-wrap">
                    <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                      <input
                        data-testid="cp-preview-no-timeout"
                        type="radio"
                        name="cp-timeout-mode"
                        className="accent-navy-900"
                        checked={!cpInline.has_timeout}
                        onChange={() => setCpInline({ ...cpInline, has_timeout: false })}
                      />
                      Süre sınırı yok
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                      <input
                        data-testid="cp-preview-has-timeout"
                        type="radio"
                        name="cp-timeout-mode"
                        className="accent-navy-900"
                        checked={cpInline.has_timeout}
                        onChange={() => setCpInline({ ...cpInline, has_timeout: true })}
                      />
                      Süre sınırı var
                    </label>
                  </div>
                  {cpInline.has_timeout && (
                    <div className="flex items-center gap-2 fade-up">
                      <input data-testid="cp-preview-timeout-input" type="number" min="5" max="600" className={inputCls + " w-28"} value={cpInline.timeout_seconds} onChange={(e) => setCpInline({ ...cpInline, timeout_seconds: e.target.value })} />
                      <span className="text-xs text-slate-400 whitespace-nowrap">saniye içinde cevaplanmalı</span>
                    </div>
                  )}
                  {/* Serbest metinde yanlış cevap yoktur; yalnızca süre aşımı başarısızlık sayılır. */}
                  {cpSelectedIsFreeText ? (
                    cpInline.has_timeout ? (
                      <select data-testid="cp-preview-onfail-select" className={inputCls} value={cpInline.on_fail} onChange={(e) => setCpInline({ ...cpInline, on_fail: e.target.value })}>
                        <option value="start">Süre dolarsa: Başa dön</option>
                        <option value="previous">Süre dolarsa: Önceki nokta</option>
                      </select>
                    ) : (
                      <p className="px-3 py-2 rounded-lg text-xs text-slate-500 bg-white border border-navy-900/10">
                        Süre sınırı olmadığı için başarısızlık durumu yoktur; kullanıcı cevabını yazana kadar içerik devam etmez.
                      </p>
                    )
                  ) : (
                    <select data-testid="cp-preview-onfail-select" className={inputCls} value={cpInline.on_fail} onChange={(e) => setCpInline({ ...cpInline, on_fail: e.target.value })}>
                      <option value="start">Başarısızsa: Başa dön</option>
                      <option value="previous">Başarısızsa: Önceki nokta</option>
                      <option value="retry_limited">Başarısızsa: Deneme hakkı olsun</option>
                      <option value="retry">Başarısızsa: Doğru yapana kadar deneyebilsin</option>
                    </select>
                  )}
                  {!cpSelectedIsFreeText && cpInline.on_fail === "retry_limited" && (
                    <div className="space-y-3 fade-up">
                      <div className="flex items-center gap-2">
                        <input data-testid="cp-preview-attempts-input" type="number" min="1" max="20" className={inputCls + " w-28"} value={cpInline.attempts} onChange={(e) => setCpInline({ ...cpInline, attempts: e.target.value })} />
                        <span className="text-xs text-slate-400 whitespace-nowrap">deneme hakkı</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 whitespace-nowrap">Haklar bitince:</span>
                        <select
                          data-testid="cp-preview-retry-exhausted-select"
                          className={inputCls}
                          value={cpInline.retry_exhausted}
                          onChange={(e) => setCpInline({ ...cpInline, retry_exhausted: e.target.value })}
                        >
                          <option value="start">{isPdf ? "PDF başa dönsün" : "Video başa dönsün"}</option>
                          <option value="previous">Bir önceki kontrol noktasına dönsün</option>
                        </select>
                      </div>
                    </div>
                  )}
                  <button data-testid="cp-preview-save-btn" className={btnPrimary + " w-full"} disabled={cpAdding || !cpInline.question_id} onClick={addCheckpointFromPreview}>
                    <span className="flex items-center justify-center gap-2">
                      <Plus className="w-4 h-4" /> {cpAdding ? "Ekleniyor..." : `${fmtPosition(cpAnchor)} Noktasına Ekle`}
                    </span>
                  </button>
                  </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button
              data-testid="video-upload-area"
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-slate-200 rounded-2xl py-16 flex flex-col items-center gap-3 hover:border-brand-500 hover:bg-brand-50/30 transition-colors"
            >
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                <UploadCloud className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-700">MP4 video veya PDF yükleyin</p>
              <p className="text-xs text-slate-400">Video 1GB · PDF 50MB</p>
            </button>
          )}
          {uploading > 0 && (
            <div className="mt-4">
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full transition-[width]" style={{ width: `${uploading}%` }} />
              </div>
              <p className="text-xs text-slate-400 mt-2">Yükleniyor... %{uploading}</p>
            </div>
          )}
          <input ref={fileRef} type="file" accept="video/mp4,application/pdf,.mp4,.pdf" className="hidden" data-testid="video-file-input" onChange={(e) => uploadContent(e.target.files?.[0])} />
        </div>

        {/* CHECKPOINTS */}
        <div className="n-card p-8">
          <h2 className="text-lg font-medium tracking-tight text-navy-950 mb-1">Kontrol Noktaları</h2>
          <p className="text-sm text-slate-400 mb-6">{isPdf ? "PDF belirtilen sayfada durur ve soru sorar." : "Video belirtilen sürede durur ve soru sorar."}</p>
          <div className="space-y-3 mb-6">
            {(training.checkpoints || []).length === 0 && <p className="text-sm text-slate-400">Henüz kontrol noktası yok.</p>}
            {(training.checkpoints || []).map((cp) => (
              <div key={cp.id} className="flex items-center gap-4 px-4 py-3 rounded-xl bg-[#F5F8FA] border n-hairline flex-wrap" data-testid={`checkpoint-item-${cp.id}`}>
                <span className="flex items-center gap-1.5 text-sm font-medium text-navy-950 tabular-nums">
                  {isPdf ? <FileText className="w-3.5 h-3.5 text-brand-600" /> : <Clock className="w-3.5 h-3.5 text-brand-600" />}
                  {fmtPosition(cp.time)}
                </span>
                <p className="flex-1 text-sm text-slate-600 truncate">{qById[cp.question_id]?.text || "Soru silinmiş"}</p>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {cp.timeout_seconds != null ? `${cp.timeout_seconds}sn` : "Süresiz"} · {
                    { start: "Başa dön", previous: "Önceki nokta", retry: "Doğru yapana kadar", retry_limited: `${cp.attempts} deneme · sonra ${cp.retry_exhausted === "previous" ? "önceki nokta" : "başa dön"}` }[cp.on_fail] || "Başa dön"
                  }
                </span>
                <button data-testid={`delete-checkpoint-${cp.id}`} onClick={() => removeCheckpoint(cp.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            Yeni kontrol noktası eklemek için soldaki önizlemede {isPdf ? "istediğiniz sayfaya gidip" : "videoyu istediğiniz anda duraklatıp"} "Kontrol Noktası Ekle" butonunu kullanın.
          </p>
        </div>

        {/* QUIZ */}
        <div className="n-card p-8 xl:col-span-2">
          <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
            <div>
              <h2 className="text-lg font-medium tracking-tight text-navy-950 mb-1">Eğitim Sonu Sınavı</h2>
              <p className="text-sm text-slate-400">
                Soru havuzundan sınava soru seçin. {selectedIds.length} soru seçildi
                {scoringMode === "per_question" && selectedIds.length > 0 && (
                  <span className={pointsOverLimit ? "text-red-500 font-medium" : ""} data-testid="quiz-total-points">
                    {" "}· toplam {totalPoints} / {MAX_TOTAL_POINTS} puan
                  </span>
                )}.
                {quizDirty && <span className="text-amber-500"> · Kaydedilmemiş değişiklik var</span>}
              </p>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500 whitespace-nowrap">Kategori:</span>
                <Popover open={quizCategoryPickerOpen} onOpenChange={setQuizCategoryPickerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      role="combobox"
                      aria-expanded={quizCategoryPickerOpen}
                      data-testid="quiz-category-filter"
                      className={`${inputCls} flex min-w-48 items-center justify-between gap-3 text-left ${quizCategoryPickerOpen ? "ring-2 ring-brand-500 border-transparent" : ""}`}
                    >
                      <span className="min-w-0 truncate">{selectedQuizCategory?.name || "Tüm kategoriler"}</span>
                      <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl p-0 shadow-xl">
                    <Command>
                      <CommandInput placeholder="Kategori ara..." data-testid="quiz-category-search-input" />
                      <CommandList className="max-h-80 p-1">
                        <CommandEmpty>Kategori bulunamadı.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="tüm kategoriler"
                            onSelect={() => {
                              setQuizCategoryFilter("all");
                              setQuizCategoryPickerOpen(false);
                            }}
                            className="rounded-lg px-3 py-2.5"
                          >
                            <CheckCircle2 className={`h-4 w-4 ${quizCategoryFilter === "all" ? "text-brand-600" : "text-transparent"}`} />
                            <span className="flex-1 font-medium">Tüm kategoriler</span>
                            <span className="text-xs text-slate-400">{questions.length} soru</span>
                          </CommandItem>
                        </CommandGroup>
                        <CommandGroup heading="Kategoriler">
                          {questionCategories.map((category) => (
                            <CommandItem
                              key={category.id}
                              value={`${category.name} ${category.description || ""}`}
                              onSelect={() => {
                                setQuizCategoryFilter(category.id);
                                setQuizCategoryPickerOpen(false);
                              }}
                              className="items-start rounded-lg px-3 py-2.5"
                            >
                              <CheckCircle2 className={`mt-0.5 h-4 w-4 ${quizCategoryFilter === category.id ? "text-brand-600" : "text-transparent"}`} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-navy-950">{category.name}</span>
                                {category.description && <span className="mt-0.5 block truncate text-xs text-slate-400">{category.description}</span>}
                              </span>
                              <span className="mt-0.5 whitespace-nowrap text-xs text-slate-400">{category.questionCount} soru</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500 whitespace-nowrap">Puanlama:</span>
                <select
                  data-testid="quiz-scoring-mode-select"
                  className={inputCls + " w-auto pr-9"}
                  value={scoringMode}
                  onChange={(e) => setScoringMode(e.target.value)}
                >
                  <option value="auto">Otomatik — her soru eşit</option>
                  <option value="per_question">Soru başına puan</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer select-none">
                <input
                  data-testid="quiz-pass-score-toggle"
                  type="checkbox"
                  className="accent-navy-900"
                  checked={passEnabled}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setPassEnabled(true);
                    } else {
                      setPassEnabled(false);
                      if (training.quiz?.pass_score != null) setPassScore("");
                    }
                  }}
                />
                Geçme notu uygula
              </label>
              {passEnabled && (
                <Select
                  value={training.quiz?.pass_score != null ? String(training.quiz.pass_score) : ""}
                  onValueChange={setPassScore}
                >
                  <SelectTrigger
                    data-testid="quiz-pass-score-input"
                    aria-label="Geçme notu"
                    className="h-[42px] w-28 rounded-xl border-navy-900/10 bg-white px-4 text-sm font-medium text-navy-950 shadow-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-0"
                  >
                    <SelectValue placeholder="Oran seçin" />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    sideOffset={6}
                    className="z-[70] rounded-xl border-navy-900/10 bg-white p-1.5 text-navy-950 shadow-[0_18px_45px_-18px_rgba(14,32,51,0.28)]"
                  >
                    {PASS_SCORE_OPTIONS.map((value) => (
                      <SelectItem
                        key={value}
                        value={String(value)}
                        className="rounded-lg py-2.5 pl-3 pr-9 text-sm font-medium cursor-pointer focus:bg-brand-50 focus:text-navy-950"
                      >
                        %{value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                data-testid="quiz-question-search"
                className={inputCls + " pl-10"}
                placeholder="Soru metni veya seçeneklerde ara..."
                value={quizQuestionSearch}
                onChange={(e) => setQuizQuestionSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-end gap-3">
              {(quizQuestionSearch || quizCategoryFilter !== "all") && (
                <span className="text-xs text-slate-400">{filteredQuizQuestions.length} soru gösteriliyor</span>
              )}
              {quizCategoryFilter !== "all" && (
                <button
                  type="button"
                  data-testid="quiz-category-select-all"
                  disabled={selectedCategoryQuestionIds.length === 0}
                  onClick={toggleAllSelectedCategoryQuestions}
                  title={`${selectedQuizCategory?.name || "Seçili kategori"} kategorisindeki tüm soruları ${allSelectedCategoryQuestionsSelected ? "seçimden kaldır" : "seç"}`}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${allSelectedCategoryQuestionsSelected ? "border-brand-500 bg-brand-50 text-brand-700" : "border-navy-900/10 bg-white text-navy-950 hover:border-brand-500 hover:text-brand-700"}`}
                >
                  <CheckCircle2 className={`h-4 w-4 ${allSelectedCategoryQuestionsSelected ? "text-brand-600" : "text-slate-400"}`} />
                  {allSelectedCategoryQuestionsSelected ? "Seçimi Kaldır" : "Tümünü Seç"}
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {questions.length === 0 && <p className="text-sm text-slate-400">Soru havuzu boş. Önce <Link to="/admin/questions" className="text-brand-600 hover:underline">soru ekleyin</Link>.</p>}
            {questions.length > 0 && filteredQuizQuestions.length === 0 && (
              <p className="text-sm text-slate-400 md:col-span-2">Filtreler ve aramayla eşleşen soru bulunamadı.</p>
            )}
            {filteredQuizQuestions.map((q) => {
              const selected = selectedIds.includes(q.question_id);
              // Bu soruya verilebilecek en yüksek puan = 100 - diğer soruların toplamı.
              const ownPoints = clampPoints(questionPoints[q.question_id]);
              const maxAllowed = Math.max(0, MAX_TOTAL_POINTS - (totalPoints - ownPoints));
              return (
                <div
                  key={q.question_id}
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-colors ${selected ? "border-brand-500 bg-brand-50/50" : "border-navy-900/5 bg-[#F5F8FA] hover:bg-slate-100"}`}
                >
                  <button
                    type="button"
                    aria-label="Soruyu görüntüle ve düzenle"
                    title="Soruyu görüntüle ve düzenle"
                    data-testid={`quiz-question-edit-${q.question_id}`}
                    onClick={() => openBankQuestionEditor(q)}
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-brand-600"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    data-testid={`quiz-question-toggle-${q.question_id}`}
                    onClick={() => toggleQuizQuestion(q.question_id)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <CheckCircle2 className={`w-4 h-4 shrink-0 ${selected ? "text-brand-600" : "text-slate-300"}`} />
                    <span className="text-sm text-slate-800 flex-1">{q.text}</span>
                  </button>
                  <span className="text-xs text-amber-700 whitespace-nowrap">{q.category || "Kategorisiz"}</span>
                  <span className="text-xs text-slate-400 whitespace-nowrap">{q.qtype === "multiple_choice" ? "Seçmeli" : "Metin"}</span>
                  {scoringMode === "per_question" && selected && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        data-testid={`quiz-question-points-${q.question_id}`}
                        type="number"
                        min="1"
                        max={maxAllowed}
                        aria-label="Soru puanı"
                        title={`En fazla ${maxAllowed} puan`}
                        className={`w-16 px-2 py-1.5 rounded-lg border bg-white text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent ${ownPoints > maxAllowed ? "border-red-400" : "border-navy-900/10"}`}
                        value={questionPoints[q.question_id] ?? 1}
                        onChange={(e) => setQuestionPoint(q.question_id, e.target.value, maxAllowed)}
                        onBlur={(e) => setQuestionPoint(q.question_id, clampPoints(e.target.value), maxAllowed)}
                      />
                      <span className="text-xs text-slate-400">puan</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {questions.length > 0 && (
            <div className="flex items-center justify-between gap-4 flex-wrap mt-6">
              <p className={`text-xs ${pointsOverLimit ? "text-red-500" : "text-slate-400"}`}>
                {pointsOverLimit
                  ? `Soru puanlarının toplamı ${totalPoints}. Kaydetmek için toplamı ${MAX_TOTAL_POINTS} veya altına indirin.`
                  : scoringMode === "per_question"
                    ? `Puanların toplamı en fazla ${MAX_TOTAL_POINTS} olabilir. Serbest metin sorularda boş olmayan cevap sorunun tam puanını alır.`
                    : "Çoktan seçmeli ve serbest metin sorular eşit ağırlıkta değerlendirilir."}
              </p>
              <button
                data-testid="quiz-save-questions-btn"
                className={btnPrimary}
                disabled={savingQuiz || !quizDirty || pointsOverLimit}
                onClick={saveQuizQuestions}
              >
                <span className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  {savingQuiz ? "Kaydediliyor..." : "Seçili Soruları Eğitime Ekle"}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!editingBankQuestion} onOpenChange={(open) => !open && setEditingBankQuestion(null)}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader><DialogTitle>Soruyu Düzenle</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500">Kategori</span>
              <select
                data-testid="bank-question-category-select"
                className={inputCls}
                value={bankQuestionForm.category_id}
                onChange={(e) => setBankQuestionForm({ ...bankQuestionForm, category_id: e.target.value })}
              >
                <option value="">Genel (varsayılan)</option>
                {questionCategories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <textarea
              data-testid="bank-question-text-input"
              className={inputCls + " min-h-[80px]"}
              placeholder="Soru metni"
              value={bankQuestionForm.text}
              onChange={(e) => setBankQuestionForm({ ...bankQuestionForm, text: e.target.value })}
            />
            <select
              data-testid="bank-question-type-select"
              className={inputCls}
              value={bankQuestionForm.qtype}
              onChange={(e) => setBankQuestionForm({ ...bankQuestionForm, qtype: e.target.value })}
            >
              <option value="multiple_choice">Çoktan Seçmeli</option>
              <option value="free_text">Serbest Metin</option>
            </select>
            {bankQuestionForm.qtype === "multiple_choice" && (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">Seçenekler — doğru cevabı işaretleyin</p>
                {bankQuestionForm.options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="bank-question-correct"
                      checked={bankQuestionForm.correct_index === index}
                      onChange={() => setBankQuestionForm({ ...bankQuestionForm, correct_index: index })}
                      className="accent-emerald-600"
                    />
                    <input
                      className={inputCls}
                      placeholder={`Seçenek ${index + 1}`}
                      value={option}
                      onChange={(e) => setBankQuestionOption(index, e.target.value)}
                    />
                    {bankQuestionForm.options.length > 2 && (
                      <button
                        type="button"
                        aria-label="Seçeneği sil"
                        onClick={() => setBankQuestionForm({ ...bankQuestionForm, options: bankQuestionForm.options.filter((_, itemIndex) => itemIndex !== index), correct_index: 0 })}
                        className="p-2 text-slate-300 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setBankQuestionForm({ ...bankQuestionForm, options: [...bankQuestionForm.options, ""] })}
                  className="text-sm text-brand-600 font-medium hover:underline"
                >
                  + Seçenek ekle
                </button>
              </div>
            )}
            <button
              data-testid="bank-question-save-btn"
              className={btnPrimary + " w-full"}
              disabled={
                bankQuestionSaving ||
                !bankQuestionForm.text.trim() ||
                (bankQuestionForm.qtype === "multiple_choice" &&
                  (bankQuestionForm.options.filter((option) => option.trim()).length < 2 ||
                    !bankQuestionForm.options[bankQuestionForm.correct_index]?.trim()))
              }
              onClick={saveBankQuestion}
            >
              {bankQuestionSaving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Kontrol noktası için yeni soru popup'ı (soru havuzuna da eklenir) */}
      <Dialog open={cpQModal} onOpenChange={(o) => { if (!o) { setCpQModal(false); setCpSource("pool"); } }}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader><DialogTitle>Yeni Soru</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <select
              data-testid="cp-question-category-select"
              className={inputCls}
              value={cpQForm.category_id}
              onChange={(e) => setCpQForm({ ...cpQForm, category_id: e.target.value })}
            >
              <option value="">Genel (varsayılan)</option>
              {questionCategories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
            <textarea data-testid="cp-question-text-input" className={inputCls + " min-h-[80px]"} placeholder="Soru metni" value={cpQForm.text} onChange={(e) => setCpQForm({ ...cpQForm, text: e.target.value })} />
            <select
              data-testid="cp-question-type-select"
              className={inputCls}
              value={cpQForm.qtype}
              onChange={(e) => setCpQForm({ ...cpQForm, qtype: e.target.value })}
            >
              <option value="multiple_choice">Çoktan Seçmeli</option>
              <option value="free_text">Serbest Metin</option>
            </select>
            {cpQForm.qtype === "multiple_choice" ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">Seçenekler — doğru cevabı işaretleyin</p>
                {cpQForm.options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="radio" data-testid={`cp-correct-option-${i}`} name="cp-q-correct" checked={cpQForm.correct_index === i} onChange={() => setCpQForm({ ...cpQForm, correct_index: i })} className="accent-emerald-600" />
                    <input data-testid={`cp-option-input-${i}`} className={inputCls} placeholder={`Seçenek ${i + 1}`} value={o} onChange={(e) => setCpQOption(i, e.target.value)} />
                    {cpQForm.options.length > 2 && (
                      <button onClick={() => setCpQForm({ ...cpQForm, options: cpQForm.options.filter((_, j) => j !== i), correct_index: 0 })} className="p-2 text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                ))}
                <button data-testid="cp-add-option-btn" onClick={() => setCpQForm({ ...cpQForm, options: [...cpQForm.options, ""] })} className="text-sm text-brand-600 font-medium hover:underline">+ Seçenek ekle</button>
              </div>
            ) : (
              <p className="px-3 py-2 rounded-lg text-xs text-amber-700 bg-amber-50 border border-amber-200">
                Serbest metin soruda doğru cevap yoktur. Kullanıcı boş olmayan bir cevap yazarsa içeriğe devam eder; cevap raporlarda değerlendirmeniz için listelenir.
              </p>
            )}
            <button
              data-testid="cp-question-save-btn"
              className={btnPrimary + " w-full"}
              disabled={
                cpQSaving ||
                !cpQForm.text.trim() ||
                (cpQForm.qtype === "multiple_choice" && (cpQForm.options.filter((o) => o.trim()).length < 2 || !cpQForm.options[cpQForm.correct_index]?.trim()))
              }
              onClick={saveCpQuestion}
            >
              {cpQSaving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
