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

function fmt(date: Date | null) {
  return date ? date.toISOString() : "";
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
        course: true,
        assignment: { include: { group: true } },
      },
      orderBy: [{ userId: "asc" }, { courseId: "asc" }],
    }),
    prisma.watchEvent.findMany({
      where: { userId, courseId },
      include: { user: true, course: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.quizAttempt.findMany({
      where: { userId, courseId },
      include: { user: true, course: true },
      orderBy: { completedAt: "asc" },
    }),
    prisma.auditLog.findMany({
      where: userId ? { actorId: userId } : undefined,
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
          fmt(e.assignedAt),
          fmt(e.startsAt),
          fmt(e.dueAt),
          e.totalWatchedSec,
          Math.round(e.watchedPercent),
          e.attemptCount,
          e.lastCorrectCount ?? "",
          e.lastWrongCount ?? "",
          e.bestScorePercent ?? "",
          fmt(e.completedAt),
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
  workbook.creator = "Martı LMS PoC";

  const reportSheet = workbook.addWorksheet("Rapor");
  reportSheet.columns = [
    { header: "Kullanıcı", key: "name", width: 24 },
    { header: "E-posta", key: "email", width: 28 },
    { header: "Eğitim", key: "course", width: 32 },
    { header: "Ekip", key: "group", width: 18 },
    { header: "Durum", key: "status", width: 16 },
    { header: "Atama Tarihi", key: "assignedAt", width: 22 },
    { header: "Başlangıç", key: "startsAt", width: 22 },
    { header: "Son Tarih", key: "dueAt", width: 22 },
    { header: "İzleme (sn)", key: "watched", width: 13 },
    { header: "İzleme %", key: "percent", width: 11 },
    { header: "Deneme", key: "attempts", width: 10 },
    { header: "Doğru", key: "correct", width: 10 },
    { header: "Yanlış", key: "wrong", width: 10 },
    { header: "En İyi Puan", key: "best", width: 13 },
    { header: "Bitirme Tarihi", key: "completedAt", width: 22 },
  ];
  for (const e of enrollments) {
    reportSheet.addRow({
      name: e.user.name,
      email: e.user.email,
      course: e.course.title,
      group: e.assignment?.group?.name ?? "",
      status: STATUS_TR[e.status] ?? e.status,
      assignedAt: fmt(e.assignedAt),
      startsAt: fmt(e.startsAt),
      dueAt: fmt(e.dueAt),
      watched: e.totalWatchedSec,
      percent: Math.round(e.watchedPercent),
      attempts: e.attemptCount,
      correct: e.lastCorrectCount ?? "",
      wrong: e.lastWrongCount ?? "",
      best: e.bestScorePercent ?? "",
      completedAt: fmt(e.completedAt),
    });
  }
  reportSheet.getRow(1).font = { bold: true };

  const watchSheet = workbook.addWorksheet("Izleme Loglari");
  watchSheet.columns = [
    { header: "Kullanıcı", key: "name", width: 24 },
    { header: "E-posta", key: "email", width: 28 },
    { header: "Eğitim", key: "course", width: 32 },
    { header: "Olay", key: "event", width: 14 },
    { header: "Pozisyon (sn)", key: "pos", width: 14 },
    { header: "Zaman", key: "time", width: 24 },
  ];
  for (const e of watchEvents) {
    watchSheet.addRow({
      name: e.user.name,
      email: e.user.email,
      course: e.course.title,
      event: e.eventType,
      pos: e.positionSec,
      time: fmt(e.createdAt),
    });
  }
  watchSheet.getRow(1).font = { bold: true };

  const quizSheet = workbook.addWorksheet("Sinav Loglari");
  quizSheet.columns = [
    { header: "Kullanıcı", key: "name", width: 24 },
    { header: "E-posta", key: "email", width: 28 },
    { header: "Eğitim", key: "course", width: 32 },
    { header: "Deneme", key: "attempt", width: 10 },
    { header: "Puan %", key: "score", width: 10 },
    { header: "Doğru", key: "correct", width: 10 },
    { header: "Yanlış", key: "wrong", width: 10 },
    { header: "Sonuç", key: "result", width: 10 },
    { header: "Zaman", key: "time", width: 24 },
  ];
  for (const a of quizAttempts) {
    quizSheet.addRow({
      name: a.user.name,
      email: a.user.email,
      course: a.course.title,
      attempt: a.attemptNo,
      score: a.scorePercent,
      correct: a.correctCount,
      wrong: a.wrongCount,
      result: a.passed ? "GEÇTİ" : "KALDI",
      time: fmt(a.completedAt),
    });
  }
  quizSheet.getRow(1).font = { bold: true };

  const auditSheet = workbook.addWorksheet("Sistem Denetim");
  auditSheet.columns = [
    { header: "Zaman", key: "time", width: 24 },
    { header: "Eylem", key: "action", width: 30 },
    { header: "Yapan", key: "actor", width: 28 },
    { header: "Kayıt Türü", key: "entityType", width: 16 },
    { header: "Kayıt No", key: "entityId", width: 28 },
    { header: "Detay", key: "metadata", width: 60 },
  ];
  for (const log of auditLogs) {
    auditSheet.addRow({
      time: fmt(log.createdAt),
      action: log.action,
      actor: log.actorEmail ?? "",
      entityType: log.entityType ?? "",
      entityId: log.entityId ?? "",
      metadata: log.metadata ? JSON.stringify(log.metadata) : "",
    });
  }
  auditSheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="marti-rapor.xlsx"',
    },
  });
}
