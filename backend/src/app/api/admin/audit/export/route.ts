import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { AuditAction, Role } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { refreshOverdue } from "@/lib/enrollment";

export const dynamic = "force-dynamic";

const STATUS_TR: Record<string, string> = {
  NOT_STARTED: "Başlamadı",
  IN_PROGRESS: "Devam ediyor",
  COMPLETED: "Tamamlandı",
  FAILED: "Kaldı",
  OVERDUE: "Süresi geçti",
};

const EVENT_TR: Record<string, string> = {
  START: "İçerik başlatıldı",
  RESUME: "İçeriğe devam edildi",
  HEARTBEAT: "İlerleme kaydedildi",
  PAUSE: "Video duraklatıldı",
  SEEK_BLOCKED: "İleri sarma engellendi",
  EXIT: "İçerikten çıkıldı",
  COMPLETE: "İçerik tamamlandı",
  CHECKPOINT_PASSED: "Kontrol noktası geçildi",
  CHECKPOINT_FAILED: "Kontrol noktası başarısız",
};

const ACTION_TR: Record<string, string> = {
  ADMIN_CREATED_USER: "Kullanıcı oluşturuldu",
  ADMIN_UPDATED_USER: "Kullanıcı güncellendi",
  ADMIN_CHANGED_USER_STATUS: "Kullanıcı durumu değiştirildi",
  ADMIN_SENT_ACTIVATION: "Aktivasyon gönderildi",
  ADMIN_CREATED_COURSE: "Eğitim oluşturuldu",
  ADMIN_UPDATED_COURSE: "Eğitim güncellendi",
  ADMIN_DEACTIVATED_COURSE: "Eğitim pasife alındı",
  ADMIN_REACTIVATED_COURSE: "Eğitim yeniden aktifleştirildi",
  ADMIN_CREATED_GROUP: "Ekip oluşturuldu",
  ADMIN_UPDATED_GROUP: "Ekip güncellendi",
  ADMIN_ADDED_GROUP_MEMBER: "Ekibe üye eklendi",
  ADMIN_REMOVED_GROUP_MEMBER: "Ekipten üye çıkarıldı",
  ADMIN_ASSIGNED_COURSE: "Eğitim atandı",
  ADMIN_CREATED_QUESTION_POOL: "Soru havuzu oluşturuldu",
  ADMIN_EXPORTED_REPORT: "Rapor dışa aktarıldı",
  USER_LOGGED_IN: "Kullanıcı giriş yaptı",
  USER_LOGGED_OUT: "Kullanıcı çıkış yaptı",
  USER_ACTIVATED_ACCOUNT: "Hesap aktifleştirildi",
};

const DATE_NUMBER_FORMAT = "dd.mm.yyyy hh:mm:ss";
const ISTANBUL_DATE_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Istanbul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Türkiye yerel saatini sıralanabilir gerçek Excel tarih seri değerine çevirir. */
function excelDate(date: Date | null): number | null {
  if (!date) return null;
  const parts = Object.fromEntries(
    ISTANBUL_DATE_PARTS.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const wallClockUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return wallClockUtc / 86_400_000 + 25_569;
}

function fmtCsvDate(date: Date | null) {
  if (!date) return "";
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function fmtDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function metadataText(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  return Object.entries(metadata as Record<string, unknown>)
    .map(([key, value]) => {
      const readable = key
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/_/g, " ")
        .toLocaleLowerCase("tr-TR");
      const shown =
        value && typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
      return `${readable}: ${shown}`;
    })
    .join(" · ");
}

function styleTable(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.height = 28;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0E2033" },
  };
  header.alignment = { vertical: "middle", horizontal: "left" };

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.alignment = { vertical: "top", wrapText: true };
    if (rowNumber % 2 === 0) {
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF4F8FA" },
      };
    }
  }

  sheet.views = [{ state: "frozen", ySplit: 1 }];
  if (sheet.columnCount > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columnCount },
    };
  }
}

export async function GET(req: NextRequest) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "xlsx";
  const userId = searchParams.get("userId") || undefined;
  const courseId = searchParams.get("courseId") || undefined;

  await refreshOverdue({ userId, courseId });

  await recordAudit({
    action: AuditAction.ADMIN_EXPORTED_REPORT,
    actor: session,
    metadata: { format, userId: userId ?? null, courseId: courseId ?? null },
  });

  const [enrollments, watchEvents, quizAttempts, auditLogs] = await Promise.all([
    prisma.enrollment.findMany({
      where: { userId, courseId },
      include: {
        user: true,
        course: { include: { video: true } },
        assignment: { include: { group: true } },
      },
      orderBy: [{ userId: "asc" }, { courseId: "asc" }],
    }),
    prisma.watchEvent.findMany({
      where: { userId, courseId },
      include: { user: true, course: { include: { video: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.quizAttempt.findMany({
      where: { userId, courseId },
      include: { user: true, course: true },
      orderBy: { completedAt: "asc" },
    }),
    prisma.auditLog.findMany({
      where: {
        ...(userId ? { actorId: userId } : {}),
        ...(courseId ? { entityId: courseId } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 5000,
    }),
  ]);

  if (format === "csv") {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      "kullanici,eposta,egitim,ekip,durum,atama_tarihi,baslangic,son_tarih,izleme_sn,izleme_yuzde,deneme,dogru,yanlis,en_iyi_puan,bitirme_tarihi",
      ...enrollments.map((e) =>
        [
          e.user.name,
          e.user.email,
          e.course.title,
          e.assignment?.group?.name ?? "",
          STATUS_TR[e.status] ?? e.status,
          fmtCsvDate(e.assignedAt),
          fmtCsvDate(e.startsAt),
          fmtCsvDate(e.dueAt),
          e.totalWatchedSec,
          Math.round(e.watchedPercent),
          e.attemptCount,
          e.lastCorrectCount ?? "",
          e.lastWrongCount ?? "",
          e.bestScorePercent ?? "",
          fmtCsvDate(e.completedAt),
        ]
          .map(esc)
          .join(","),
      ),
    ];
    return new NextResponse("\uFEFF" + lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="marti-rapor.csv"',
      },
    });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Martı Denizcilik - Plena LMS";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.company = "Martı Denizcilik";

  const courseTitle =
    enrollments[0]?.course.title ??
    watchEvents[0]?.course.title ??
    quizAttempts[0]?.course.title ??
    (courseId ? "Seçili eğitim" : "Tüm eğitimler");
  const userName =
    enrollments[0]?.user.name ??
    watchEvents[0]?.user.name ??
    quizAttempts[0]?.user.name ??
    (userId ? "Seçili kullanıcı" : null);
  const reportScope = userId ? userName! : courseTitle;
  const reportTitle = userId ? "Kişi Bazlı Rapor" : "Eğitim Detay Raporu";
  const completedCount = enrollments.filter((item) => item.status === "COMPLETED").length;
  const averageProgress =
    enrollments.length > 0
      ? enrollments.reduce((sum, item) => sum + item.watchedPercent, 0) /
        enrollments.length
      : 0;

  const summarySheet = workbook.addWorksheet("Özet", {
    views: [{ showGridLines: false }],
  });
  summarySheet.columns = [
    { width: 25 },
    { width: 30 },
    { width: 4 },
    { width: 25 },
    { width: 30 },
    { width: 4 },
  ];
  summarySheet.mergeCells("A1:F1");
  summarySheet.getCell("A1").value = reportTitle;
  summarySheet.getCell("A1").font = {
    bold: true,
    size: 20,
    color: { argb: "FFFFFFFF" },
  };
  summarySheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0E2033" },
  };
  summarySheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left" };
  summarySheet.getRow(1).height = 42;
  summarySheet.addRow([]);
  summarySheet.addRow(["Rapor kapsamı", reportScope, "", "Oluşturulma zamanı", excelDate(new Date())]);
  summarySheet.addRow(["Toplam atama", enrollments.length, "", "Tamamlanan", completedCount]);
  summarySheet.addRow([
    "Tamamlanma oranı",
    enrollments.length > 0 ? completedCount / enrollments.length : 0,
    "",
    "Ortalama ilerleme",
    averageProgress / 100,
  ]);
  summarySheet.addRow([
    userId ? "Tekil eğitim" : "Tekil kullanıcı",
    userId
      ? new Set(enrollments.map((item) => item.courseId)).size
      : new Set(enrollments.map((item) => item.userId)).size,
    "",
    "Sınav denemesi",
    quizAttempts.length,
  ]);
  for (const cellAddress of ["A3", "D3", "A4", "D4", "A5", "D5", "A6", "D6"]) {
    const cell = summarySheet.getCell(cellAddress);
    cell.font = { bold: true, color: { argb: "FF36566F" } };
  }
  summarySheet.getCell("E3").numFmt = DATE_NUMBER_FORMAT;
  summarySheet.getCell("B5").numFmt = "0.0%";
  summarySheet.getCell("E5").numFmt = "0.0%";

  const reportSheet = workbook.addWorksheet("Rapor");
  reportSheet.columns = [
    { header: "Kullanıcı", key: "name", width: 24 },
    { header: "E-posta", key: "email", width: 28 },
    { header: "Eğitim", key: "course", width: 32 },
    { header: "Ekip", key: "group", width: 18 },
    { header: "Atama Türü", key: "assignmentType", width: 15 },
    { header: "Durum", key: "status", width: 16 },
    { header: "Atama Tarihi (TR)", key: "assignedAt", width: 22 },
    { header: "Başlangıç (TR)", key: "startsAt", width: 22 },
    { header: "Son Tarih (TR)", key: "dueAt", width: 22 },
    { header: "İlk Başlama (TR)", key: "firstStartedAt", width: 22 },
    { header: "Son Aktivite (TR)", key: "lastActivityAt", width: 22 },
    { header: "Tamamlanma (TR)", key: "completedAt", width: 22 },
    { header: "İçerikte Geçen Süre", key: "watched", width: 20 },
    { header: "İlerleme", key: "percent", width: 12 },
    { header: "Sınav Denemesi", key: "attempts", width: 15 },
    { header: "Doğru", key: "correct", width: 10 },
    { header: "Yanlış", key: "wrong", width: 10 },
    { header: "En İyi Puan", key: "best", width: 14 },
  ];
  for (const e of enrollments) {
    reportSheet.addRow({
      name: e.user.name,
      email: e.user.email,
      course: e.course.title,
      group: e.assignment?.group?.name ?? "",
      assignmentType: e.assignment?.target === "GROUP" ? "Ekip" : "Kullanıcı",
      status: STATUS_TR[e.status] ?? e.status,
      assignedAt: excelDate(e.assignedAt),
      startsAt: excelDate(e.startsAt),
      dueAt: excelDate(e.dueAt),
      firstStartedAt: excelDate(e.firstStartedAt),
      lastActivityAt: excelDate(e.lastActivityAt),
      completedAt: excelDate(e.completedAt),
      watched: e.totalWatchedSec / 86_400,
      percent: e.watchedPercent / 100,
      attempts: e.attemptCount,
      correct: e.lastCorrectCount ?? "",
      wrong: e.lastWrongCount ?? "",
      best: e.bestScorePercent != null ? e.bestScorePercent / 100 : "",
    });
  }
  for (const key of [
    "assignedAt",
    "startsAt",
    "dueAt",
    "firstStartedAt",
    "lastActivityAt",
    "completedAt",
  ]) {
    reportSheet.getColumn(key).numFmt = DATE_NUMBER_FORMAT;
  }
  reportSheet.getColumn("watched").numFmt = "[h]:mm:ss";
  reportSheet.getColumn("percent").numFmt = "0.0%";
  reportSheet.getColumn("best").numFmt = "0.0%";
  styleTable(reportSheet);

  const watchSheet = workbook.addWorksheet("İzleme Geçmişi");
  watchSheet.columns = [
    { header: "Kullanıcı", key: "name", width: 24 },
    { header: "E-posta", key: "email", width: 28 },
    { header: "Eğitim", key: "course", width: 32 },
    { header: "İçerik Türü", key: "contentType", width: 15 },
    { header: "Olay", key: "event", width: 28 },
    { header: "Konum", key: "position", width: 18 },
    { header: "Tarih ve Saat (TR)", key: "time", width: 22 },
    { header: "Detay", key: "detail", width: 45 },
  ];
  for (const e of watchEvents) {
    const isPdf = Boolean(e.course.video?.pageCount);
    watchSheet.addRow({
      name: e.user.name,
      email: e.user.email,
      course: e.course.title,
      contentType: isPdf ? "PDF" : "Video",
      event: EVENT_TR[e.eventType] ?? e.eventType,
      position: isPdf
        ? `Sayfa ${Math.max(1, Math.round(e.positionSec))} / ${e.course.video?.pageCount}`
        : fmtDuration(e.positionSec),
      time: excelDate(e.createdAt),
      detail: metadataText(e.metadata),
    });
  }
  watchSheet.getColumn("time").numFmt = DATE_NUMBER_FORMAT;
  styleTable(watchSheet);

  const quizSheet = workbook.addWorksheet("Sınav Sonuçları");
  quizSheet.columns = [
    { header: "Kullanıcı", key: "name", width: 24 },
    { header: "E-posta", key: "email", width: 28 },
    { header: "Eğitim", key: "course", width: 32 },
    { header: "Deneme", key: "attempt", width: 10 },
    { header: "Puan", key: "score", width: 12 },
    { header: "Doğru", key: "correct", width: 10 },
    { header: "Yanlış", key: "wrong", width: 10 },
    { header: "Sonuç", key: "result", width: 14 },
    { header: "Tamamlanma (TR)", key: "time", width: 22 },
  ];
  for (const a of quizAttempts) {
    quizSheet.addRow({
      name: a.user.name,
      email: a.user.email,
      course: a.course.title,
      attempt: a.attemptNo,
      score: a.scorePercent / 100,
      correct: a.correctCount,
      wrong: a.wrongCount,
      result: a.passed ? "GEÇTİ" : "KALDI",
      time: excelDate(a.completedAt),
    });
  }
  quizSheet.getColumn("score").numFmt = "0.0%";
  quizSheet.getColumn("time").numFmt = DATE_NUMBER_FORMAT;
  styleTable(quizSheet);

  const auditSheet = workbook.addWorksheet("Sistem Denetimi");
  auditSheet.columns = [
    { header: "Tarih ve Saat (TR)", key: "time", width: 22 },
    { header: "Eylem", key: "action", width: 30 },
    { header: "Yapan", key: "actor", width: 28 },
    { header: "Kayıt Türü", key: "entityType", width: 16 },
    { header: "Kayıt No", key: "entityId", width: 28 },
    { header: "Detay", key: "metadata", width: 60 },
  ];
  for (const log of auditLogs) {
    auditSheet.addRow({
      time: excelDate(log.createdAt),
      action: ACTION_TR[log.action] ?? log.action,
      actor: log.actorEmail ?? "",
      entityType: log.entityType ?? "",
      entityId: log.entityId ?? "",
      metadata: metadataText(log.metadata),
    });
  }
  auditSheet.getColumn("time").numFmt = DATE_NUMBER_FORMAT;
  styleTable(auditSheet);

  workbook.title = `${reportScope} - ${reportTitle}`;
  workbook.subject = "Eğitim ilerleme, izleme ve sınav sonuçları";
  const safeReportName = reportScope
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ıİ]/g, "i")
    .replace(/[şŞ]/g, "s")
    .replace(/[çÇ]/g, "c")
    .replace(/[ğĞ]/g, "g")
    .replace(/[öÖ]/g, "o")
    .replace(/[üÜ]/g, "u")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLocaleLowerCase("tr-TR")
    .slice(0, 60) || "egitim";
  const reportDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
  }).format(new Date());

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${userId ? "kisi" : "egitim"}-raporu-${safeReportName}-${reportDate}.xlsx"`,
    },
  });
}
