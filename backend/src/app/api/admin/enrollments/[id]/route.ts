import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Tek bir kayıt (enrollment) için denetim detayı: izleme olayları ve
 * sınav denemeleri, cevap + şık düzeyinde.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const enrollment = await prisma.enrollment.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      course: { select: { id: true, title: true } },
    },
  });
  if (!enrollment) {
    return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
  }

  const [watchEvents, quizAttempts] = await Promise.all([
    prisma.watchEvent.findMany({
      where: { enrollmentId: id },
      orderBy: { createdAt: "asc" },
      take: 2000,
    }),
    prisma.quizAttempt.findMany({
      where: { enrollmentId: id },
      orderBy: { attemptNo: "asc" },
      include: {
        answers: {
          include: {
            question: { include: { choices: { orderBy: { id: "asc" } } } },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    enrollment: {
      id: enrollment.id,
      status: enrollment.status,
      totalWatchedSec: enrollment.totalWatchedSec,
      watchedPercent: enrollment.watchedPercent,
      videoCompleted: enrollment.videoCompleted,
      attemptCount: enrollment.attemptCount,
      bestScorePercent: enrollment.bestScorePercent,
      completedAt: enrollment.completedAt,
      user: enrollment.user,
      course: enrollment.course,
    },
    watchEvents: watchEvents.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      positionSec: e.positionSec,
      metadata: e.metadata,
      createdAt: e.createdAt,
    })),
    quizAttempts: quizAttempts.map((a) => ({
      attemptNo: a.attemptNo,
      scorePercent: a.scorePercent,
      passed: a.passed,
      completedAt: a.completedAt,
      answers: a.answers.map((ans) => ({
        prompt: ans.question.prompt,
        type: ans.question.type,
        choices: ans.question.choices.map((c) => ({
          id: c.id,
          text: c.text,
          isCorrect: c.isCorrect,
        })),
        choiceId: ans.choiceId,
        textAnswer: ans.textAnswer,
        isCorrect: ans.isCorrect,
      })),
    })),
  });
}
