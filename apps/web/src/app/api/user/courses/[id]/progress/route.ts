import { NextRequest, NextResponse } from "next/server";
import { EnrollmentStatus, Role, WatchEventType } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkWindow } from "@/lib/enrollment";
import { computeProgress } from "@/lib/progress";

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
    include: { course: { include: { video: true } } },
  });
  if (!enrollment?.course.video) {
    return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
  }

  const window = checkWindow(enrollment);
  if (!window.open) {
    return NextResponse.json({ error: window.reason }, { status: 403 });
  }

  const progress = computeProgress(
    enrollment,
    parsed.data.positionSec,
    enrollment.course.video.durationSec,
  );

  const status: EnrollmentStatus =
    enrollment.status === EnrollmentStatus.COMPLETED
      ? EnrollmentStatus.COMPLETED
      : EnrollmentStatus.IN_PROGRESS;

  const updated = await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      positionSec: progress.positionSec,
      maxReachedSec: progress.maxReachedSec,
      watchedPercent: progress.watchedPercent,
      totalWatchedSec: progress.totalWatchedSec,
      videoCompleted: progress.videoCompleted,
      status,
      firstStartedAt: enrollment.firstStartedAt ?? new Date(),
      lastActivityAt: new Date(),
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
