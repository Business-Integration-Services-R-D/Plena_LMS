import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { Role } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "xlsx";
  const userId = searchParams.get("userId") || undefined;
  const courseId = searchParams.get("courseId") || undefined;

  const [watchEvents, quizAttempts] = await Promise.all([
    prisma.watchEvent.findMany({
      where: {
        userId,
        video: courseId ? { courseId } : undefined,
      },
      include: {
        user: true,
        video: { include: { course: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.quizAttempt.findMany({
      where: { userId, courseId },
      include: { user: true, course: true },
      orderBy: { completedAt: "asc" },
    }),
  ]);

  if (format === "csv") {
    const lines = [
      "type,userId,userEmail,courseTitle,detail,positionOrScore,timestamp",
      ...watchEvents.map(
        (e) =>
          `watch,${e.userId},${e.user.email},${e.video.course.title},${e.eventType},${e.positionSec},${e.createdAt.toISOString()}`,
      ),
      ...quizAttempts.map(
        (a) =>
          `quiz,${a.userId},${a.user.email},${a.course.title},attempt-${a.attemptNo}:${a.passed ? "PASS" : "FAIL"},${a.scorePercent},${a.completedAt.toISOString()}`,
      ),
    ];
    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="marti-audit.csv"',
      },
    });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Martı LMS PoC";

  const watchSheet = workbook.addWorksheet("Izleme Loglari");
  watchSheet.columns = [
    { header: "Kullanıcı ID", key: "userId", width: 28 },
    { header: "E-posta", key: "email", width: 28 },
    { header: "Eğitim", key: "course", width: 32 },
    { header: "Video ID", key: "videoId", width: 28 },
    { header: "Olay", key: "event", width: 12 },
    { header: "Pozisyon (sn)", key: "pos", width: 14 },
    { header: "Zaman", key: "time", width: 24 },
  ];
  for (const e of watchEvents) {
    watchSheet.addRow({
      userId: e.userId,
      email: e.user.email,
      course: e.video.course.title,
      videoId: e.videoId,
      event: e.eventType,
      pos: e.positionSec,
      time: e.createdAt.toISOString(),
    });
  }

  const quizSheet = workbook.addWorksheet("Sinav Loglari");
  quizSheet.columns = [
    { header: "Kullanıcı ID", key: "userId", width: 28 },
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
      userId: a.userId,
      email: a.user.email,
      course: a.course.title,
      attempt: a.attemptNo,
      score: a.scorePercent,
      correct: a.correctCount,
      wrong: a.wrongCount,
      result: a.passed ? "GEÇTİ" : "KALDI",
      time: a.completedAt.toISOString(),
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="marti-audit.xlsx"',
    },
  });
}
