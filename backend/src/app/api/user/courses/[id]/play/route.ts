import { NextResponse } from "next/server";
import { Role, WatchEventType } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkWindow, refreshOverdue } from "@/lib/enrollment";
import { effectiveQuestionCount, resolveExamSettings } from "@/lib/exam";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.USER, Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: courseId } = await params;
  await refreshOverdue({ userId: session.id, courseId });

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: session.id, courseId } },
    include: {
      course: {
        include: {
          video: true,
          checkpoints: {
            orderBy: { timeSec: "asc" },
            include: {
              question: {
                include: { choices: { select: { id: true, text: true } } },
              },
            },
          },
          questionPool: {
            select: {
              _count: { select: { questions: { where: { active: true } } } },
            },
          },
          exam: {
            include: {
              questionPool: {
                select: {
                  _count: { select: { questions: { where: { active: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!enrollment) {
    return NextResponse.json(
      { error: "Bu eğitim size atanmamış" },
      { status: 403 },
    );
  }

  if (!enrollment.course.active && session.role !== Role.ADMIN) {
    return NextResponse.json(
      { error: "Bu eğitim pasif durumda" },
      { status: 403 },
    );
  }

  const window = checkWindow(enrollment);
  if (!window.open) {
    return NextResponse.json({ error: window.reason }, { status: 403 });
  }

  if (!enrollment.course.video) {
    return NextResponse.json({ error: "Eğitim içeriği yok" }, { status: 404 });
  }

  await prisma.watchEvent.create({
    data: {
      enrollmentId: enrollment.id,
      userId: session.id,
      courseId,
      videoId: enrollment.course.video.id,
      eventType:
        enrollment.maxReachedSec > 0
          ? WatchEventType.RESUME
          : WatchEventType.START,
      positionSec: enrollment.positionSec,
    },
  });

  // Bu kayıtta daha önce geçilen kontrol noktaları (WatchEvent üzerinden).
  const passedEvents = await prisma.watchEvent.findMany({
    where: {
      enrollmentId: enrollment.id,
      eventType: WatchEventType.CHECKPOINT_PASSED,
    },
    select: { metadata: true },
  });
  const passedCheckpointIds = [
    ...new Set(
      passedEvents
        .map((e) => (e.metadata as { checkpointId?: string } | null)?.checkpointId)
        .filter((v): v is string => Boolean(v)),
    ),
  ];

  const settings = resolveExamSettings(enrollment.course, enrollment.course.exam);
  const poolTotal =
    enrollment.course.exam?.questionPool?._count.questions ??
    enrollment.course.questionPool?._count.questions ??
    0;

  return NextResponse.json({
    course: {
      id: enrollment.course.id,
      title: enrollment.course.title,
      description: enrollment.course.description,
      passPercent: settings.passPercent,
      questionCount: effectiveQuestionCount(settings, poolTotal),
    },
    video: {
      id: enrollment.course.video.id,
      durationSec: enrollment.course.video.durationSec,
      contentType: enrollment.course.video.contentType,
      pageCount: enrollment.course.video.pageCount,
      fileName: enrollment.course.video.fileName,
      url: `/api/user/courses/${courseId}/video`,
    },
    checkpoints: enrollment.course.checkpoints.map((cp) => ({
      id: cp.id,
      timeSec: cp.timeSec,
      timeoutSeconds: cp.timeoutSeconds,
      onFail: cp.onFail,
      question: {
        id: cp.question.id,
        prompt: cp.question.prompt,
        type: cp.question.type,
        choices: cp.question.choices,
      },
    })),
    passedCheckpointIds,
    progress: {
      positionSec: enrollment.positionSec,
      maxReachedSec: enrollment.maxReachedSec,
      watchedPercent: enrollment.watchedPercent,
      completed: enrollment.videoCompleted,
      status: enrollment.status,
    },
    dueAt: enrollment.dueAt,
  });
}
