import { NextRequest, NextResponse } from "next/server";
import { EnrollmentStatus, Role, WatchEventType } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkWindow } from "@/lib/enrollment";
import { effectiveQuestionCount, resolveExamSettings } from "@/lib/exam";
import { computePageProgress, computeProgress } from "@/lib/progress";

export const dynamic = "force-dynamic";

const schema = z.object({
  positionSec: z.number().min(0),
  eventType: z
    .enum(["HEARTBEAT", "PAUSE", "SEEK_BLOCKED", "EXIT", "COMPLETE"])
    .default("HEARTBEAT"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.USER, Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: courseId } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: session.id, courseId } },
    include: {
      course: {
        include: {
          video: true,
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
          checkpoints: { select: { id: true } },
        },
      },
    },
  });
  if (!enrollment?.course.video) {
    return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
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

  const pageCount = enrollment.course.video.pageCount;
  const progress = pageCount
    ? computePageProgress(enrollment, parsed.data.positionSec, pageCount)
    : computeProgress(
        enrollment,
        parsed.data.positionSec,
        enrollment.course.video.durationSec,
      );
  const wantsCompletion = parsed.data.eventType === "COMPLETE";

  const checkpointIds = new Set(enrollment.course.checkpoints.map((cp) => cp.id));
  let checkpointsComplete = checkpointIds.size === 0;
  if (progress.videoCompleted && !checkpointsComplete) {
    const passedEvents = await prisma.watchEvent.findMany({
      where: {
        enrollmentId: enrollment.id,
        eventType: WatchEventType.CHECKPOINT_PASSED,
      },
      select: { metadata: true },
    });
    const passedIds = new Set(
      passedEvents
        .map((event) => (event.metadata as { checkpointId?: string } | null)?.checkpointId)
        .filter(Boolean),
    );
    checkpointsComplete = [...checkpointIds].every((id) => passedIds.has(id));
    if (wantsCompletion && !checkpointsComplete) {
      return NextResponse.json(
        { error: "Tüm kontrol noktaları tamamlanmadan eğitim bitirilemez" },
        { status: 409 },
      );
    }
  }

  // PDF'de son sayfayı açmak yetmez; kullanıcı son sayfadaki tamamlama
  // düğmesine de basmalıdır.
  const contentCompleted =
    enrollment.videoCompleted ||
    (progress.videoCompleted &&
      checkpointsComplete &&
      (!pageCount || wantsCompletion));
  const settings = resolveExamSettings(enrollment.course, enrollment.course.exam);
  const poolTotal =
    enrollment.course.exam?.questionPool?._count.questions ??
    enrollment.course.questionPool?._count.questions ??
    0;
  const hasQuiz = effectiveQuestionCount(settings, poolTotal) > 0;
  const completedWithoutQuiz = contentCompleted && !hasQuiz;

  const status: EnrollmentStatus =
    enrollment.status === EnrollmentStatus.COMPLETED
      ? EnrollmentStatus.COMPLETED
      : completedWithoutQuiz
        ? EnrollmentStatus.COMPLETED
        : EnrollmentStatus.IN_PROGRESS;

  const updated = await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      positionSec: progress.positionSec,
      maxReachedSec: progress.maxReachedSec,
      watchedPercent: progress.watchedPercent,
      totalWatchedSec: progress.totalWatchedSec,
      videoCompleted: contentCompleted,
      status,
      firstStartedAt: enrollment.firstStartedAt ?? new Date(),
      lastActivityAt: new Date(),
      completedAt: completedWithoutQuiz ? (enrollment.completedAt ?? new Date()) : enrollment.completedAt,
    },
  });

  await prisma.watchEvent.create({
    data: {
      enrollmentId: enrollment.id,
      userId: session.id,
      courseId,
      videoId: enrollment.course.video.id,
      eventType: parsed.data.eventType as WatchEventType,
      positionSec: progress.positionSec,
    },
  });

  return NextResponse.json({
    progress: {
      positionSec: updated.positionSec,
      maxReachedSec: updated.maxReachedSec,
      watchedPercent: updated.watchedPercent,
      completed: updated.videoCompleted,
      status: updated.status,
    },
    accepted: progress.accepted,
  });
}
