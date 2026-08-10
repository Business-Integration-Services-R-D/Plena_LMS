import { NextRequest, NextResponse } from "next/server";
import { CourseStatus, Role } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.CAPTAIN, Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: courseId } = await params;
  const progress = await prisma.watchProgress.findUnique({
    where: { userId_courseId: { userId: session.id, courseId } },
  });
  if (!progress?.completed) {
    return NextResponse.json(
      { error: "Video %100 izlenmeden teste geçilemez" },
      { status: 403 },
    );
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      questions: {
        orderBy: { sortOrder: "asc" },
        include: {
          choices: {
            select: { id: true, text: true },
          },
        },
      },
    },
  });
  if (!course) return NextResponse.json({ error: "Yok" }, { status: 404 });

  return NextResponse.json({
    courseId: course.id,
    title: course.title,
    passPercent: course.passPercent,
    questions: course.questions,
  });
}

const submitSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string(),
      choiceId: z.string(),
    }),
  ),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.CAPTAIN, Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: courseId } = await params;
  const progress = await prisma.watchProgress.findUnique({
    where: { userId_courseId: { userId: session.id, courseId } },
  });
  if (!progress?.completed) {
    return NextResponse.json(
      { error: "Video %100 izlenmeden teste geçilemez" },
      { status: 403 },
    );
  }

  const parsed = submitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz cevaplar" }, { status: 400 });
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { questions: { include: { choices: true } } },
  });
  if (!course) return NextResponse.json({ error: "Yok" }, { status: 404 });

  let correctCount = 0;
  for (const q of course.questions) {
    const answer = parsed.data.answers.find((a) => a.questionId === q.id);
    const correct = q.choices.find((c) => c.isCorrect);
    if (answer && correct && answer.choiceId === correct.id) correctCount += 1;
  }
  const total = course.questions.length || 1;
  const wrongCount = total - correctCount;
  const scorePercent = (correctCount / total) * 100;
  const passed = scorePercent >= course.passPercent;

  const attemptNo =
    (await prisma.quizAttempt.count({
      where: { userId: session.id, courseId },
    })) + 1;

  const attempt = await prisma.quizAttempt.create({
    data: {
      userId: session.id,
      courseId,
      attemptNo,
      scorePercent,
      correctCount,
      wrongCount,
      passed,
      answersJson: JSON.stringify(parsed.data.answers),
    },
  });

  await prisma.watchProgress.update({
    where: { id: progress.id },
    data: {
      status: passed ? CourseStatus.COMPLETED : CourseStatus.FAILED,
    },
  });

  return NextResponse.json({
    attempt,
    passPercent: course.passPercent,
  });
}
