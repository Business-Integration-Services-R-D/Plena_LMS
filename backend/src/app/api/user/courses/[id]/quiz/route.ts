import { NextRequest, NextResponse } from "next/server";
import { EnrollmentStatus, Role, ScoringMode } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  checkExamGate,
  gradeAttempt,
  requiresRewatchAfterFailure,
  resolveExamSettings,
  type ExamSettings,
} from "@/lib/exam";

export const dynamic = "force-dynamic";

/**
 * Testte sorulacak sorular. Havuzdan sortOrder sırasıyla alınır; GET ve POST
 * aynı listeyi görsün diye rastgele seçim yapılmaz.
 */
async function loadQuizQuestions(settings: ExamSettings) {
  if (!settings.questionPoolId) return [];

  return prisma.question.findMany({
    where: { poolId: settings.questionPoolId, active: true },
    orderBy: { sortOrder: "asc" },
    take: settings.questionCount > 0 ? settings.questionCount : undefined,
    include: { choices: { orderBy: { id: "asc" } } },
  });
}

/** Test ekranını açmadan önceki tüm kuralları doğrular. */
async function loadGate(userId: string, courseId: string, role: Role) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    include: { course: { include: { exam: true } } },
  });

  if (!enrollment) {
    return { error: "Bu eğitim size atanmamış", status: 403 as const };
  }

  if (!enrollment.course.active && role !== Role.ADMIN) {
    return { error: "Bu eğitim pasif durumda", status: 403 as const };
  }

  const settings = resolveExamSettings(enrollment.course, enrollment.course.exam);
  const gate = checkExamGate(enrollment, settings);
  if (!gate.allowed) return { error: gate.reason, status: gate.status };

  return { enrollment, settings, examId: enrollment.course.exam?.id ?? null };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.USER, Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: courseId } = await params;
  const gate = await loadGate(session.id, courseId, session.role);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { enrollment, settings } = gate;
  const questions = await loadQuizQuestions(settings);

  if (questions.length === 0) {
    return NextResponse.json(
      { error: "Bu eğitim için henüz soru tanımlanmamış" },
      { status: 409 },
    );
  }

  return NextResponse.json({
    courseId,
    title: enrollment.course.title,
    passPercent: settings.passPercent,
    attemptNo: enrollment.attemptCount + 1,
    maxAttempts: settings.maxAttempts,
    durationMinutes: settings.durationMinutes,
    retakePolicy: settings.retakePolicy,
    scoringMode: settings.scoringMode,
    questions: questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      type: q.type,
      // AUTO modunda her soru eşit ağırlıkta olduğu için puan gösterilmez.
      points: settings.scoringMode === ScoringMode.PER_QUESTION ? q.points : 1,
      choices: q.choices.map((c) => ({ id: c.id, text: c.text })),
    })),
  });
}

const submitSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string(),
      choiceId: z.string().optional(),
      textAnswer: z.string().optional(),
    }),
  ),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.USER, Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: courseId } = await params;
  const gate = await loadGate(session.id, courseId, session.role);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const parsed = submitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz cevaplar" }, { status: 400 });
  }

  const { enrollment, settings, examId } = gate;
  const questions = await loadQuizQuestions(settings);
  if (questions.length === 0) {
    return NextResponse.json({ error: "Soru bulunamadı" }, { status: 409 });
  }

  const graded = gradeAttempt(
    questions,
    parsed.data.answers,
    settings.passPercent,
    settings.scoringMode,
  );
  const attemptNo = enrollment.attemptCount + 1;
  const now = new Date();

  const attempt = await prisma.quizAttempt.create({
    data: {
      enrollmentId: enrollment.id,
      userId: session.id,
      courseId,
      examId,
      attemptNo,
      scorePercent: graded.scorePercent,
      correctCount: graded.correctCount,
      wrongCount: graded.wrongCount,
      passed: graded.passed,
      completedAt: now,
      answers: {
        create: graded.answers.map((a) => ({
          questionId: a.questionId,
          choiceId: a.choiceId,
          textAnswer: a.textAnswer,
          isCorrect: a.isCorrect,
        })),
      },
    },
  });

  // VIDEO_AND_TEST politikasında başarısız deneme sonrası video ilerlemesi
  // sıfırlanır; kullanıcı tekrar denemeden önce videoyu baştan izler.
  // Toplam izleme süresi denetim için korunur.
  const rewatch = requiresRewatchAfterFailure(settings, graded.passed);

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      attemptCount: attemptNo,
      bestScorePercent: Math.max(
        enrollment.bestScorePercent ?? 0,
        graded.scorePercent,
      ),
      lastCorrectCount: graded.correctCount,
      lastWrongCount: graded.wrongCount,
      passed: enrollment.passed || graded.passed,
      status: graded.passed
        ? EnrollmentStatus.COMPLETED
        : EnrollmentStatus.FAILED,
      completedAt: graded.passed
        ? (enrollment.completedAt ?? now)
        : enrollment.completedAt,
      lastActivityAt: now,
      ...(rewatch
        ? {
            videoCompleted: false,
            positionSec: 0,
            maxReachedSec: 0,
            watchedPercent: 0,
          }
        : {}),
    },
  });

  return NextResponse.json({
    attempt: {
      attemptNo: attempt.attemptNo,
      scorePercent: attempt.scorePercent,
      correctCount: attempt.correctCount,
      wrongCount: attempt.wrongCount,
      passed: attempt.passed,
    },
    passPercent: settings.passPercent,
    maxAttempts: settings.maxAttempts,
    mustRewatchVideo: rewatch,
    attemptsLeft:
      settings.maxAttempts > 0
        ? Math.max(0, settings.maxAttempts - attemptNo)
        : null,
  });
}
