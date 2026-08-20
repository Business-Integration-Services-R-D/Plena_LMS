import { NextRequest, NextResponse } from "next/server";
import { Prisma, QuestionType, Role, WatchEventType } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Serbest metin cevapları: kontrol noktalarında yazılanlar (izleme olayı
 * metadata'sından) ve sınavda yazılanlar. Doğru cevabı olmadığı için
 * puanlanmaz; admin okuyup değerlendirir.
 */
export async function GET(req: NextRequest) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId") || undefined;
  const userId = searchParams.get("userId") || undefined;

  const enrollmentWhere: Prisma.EnrollmentWhereInput = { courseId, userId };

  const [cpEvents, quizAnswers] = await Promise.all([
    prisma.watchEvent.findMany({
      where: {
        courseId,
        userId,
        eventType: {
          in: [WatchEventType.CHECKPOINT_PASSED, WatchEventType.CHECKPOINT_FAILED],
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        course: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    prisma.quizAnswer.findMany({
      where: {
        question: { type: QuestionType.FREE_TEXT },
        textAnswer: { not: null },
        attempt: { enrollment: enrollmentWhere },
      },
      include: {
        question: { select: { prompt: true } },
        attempt: {
          select: {
            attemptNo: true,
            completedAt: true,
            enrollment: {
              select: {
                id: true,
                user: { select: { id: true, name: true, email: true } },
                course: { select: { id: true, title: true } },
              },
            },
          },
        },
      },
      orderBy: { id: "desc" },
      take: 1000,
    }),
  ]);

  const checkpointIds = [
    ...new Set(
      cpEvents
        .map((e) => (e.metadata as { checkpointId?: string } | null)?.checkpointId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const checkpoints =
    checkpointIds.length > 0
      ? await prisma.checkpoint.findMany({
          where: { id: { in: checkpointIds }, question: { type: QuestionType.FREE_TEXT } },
          include: { question: { select: { prompt: true } } },
        })
      : [];
  const checkpointById = new Map(checkpoints.map((cp) => [cp.id, cp]));

  const checkpointRows = cpEvents.flatMap((e) => {
    const meta = e.metadata as { checkpointId?: string; textAnswer?: string } | null;
    const checkpoint = meta?.checkpointId
      ? checkpointById.get(meta.checkpointId)
      : undefined;
    if (!checkpoint || !meta?.textAnswer) return [];
    return [
      {
        id: e.id,
        source: "checkpoint" as const,
        enrollmentId: e.enrollmentId,
        user: e.user,
        course: e.course,
        prompt: checkpoint.question.prompt,
        textAnswer: meta.textAnswer,
        positionSec: e.positionSec,
        passed: e.eventType === WatchEventType.CHECKPOINT_PASSED,
        answeredAt: e.createdAt,
      },
    ];
  });

  const quizRows = quizAnswers.map((a) => ({
    id: a.id,
    source: "quiz" as const,
    enrollmentId: a.attempt.enrollment.id,
    user: a.attempt.enrollment.user,
    course: a.attempt.enrollment.course,
    prompt: a.question.prompt,
    textAnswer: a.textAnswer as string,
    attemptNo: a.attempt.attemptNo,
    answeredAt: a.attempt.completedAt,
  }));

  const rows = [...checkpointRows, ...quizRows].sort(
    (a, b) => new Date(b.answeredAt).getTime() - new Date(a.answeredAt).getTime(),
  );

  return NextResponse.json({ rows });
}
