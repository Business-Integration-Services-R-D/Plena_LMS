import { NextRequest, NextResponse } from "next/server";
import { CourseStatus, Role } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  positionSec: z.number().min(0),
  eventType: z.enum(["HEARTBEAT", "END"]).default("HEARTBEAT"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.CAPTAIN, Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: courseId } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { video: true },
  });
  if (!course?.video) {
    return NextResponse.json({ error: "Eğitim yok" }, { status: 404 });
  }

  const current = await prisma.watchProgress.findUnique({
    where: { userId_courseId: { userId: session.id, courseId } },
  });
  if (!current) {
    return NextResponse.json({ error: "Progress yok" }, { status: 404 });
  }

  // Anti-skip: only allow forward progress within a small grace window
  const reported = parsed.data.positionSec;
  const maxAllowed = current.maxReachedSec + 8;
  const acceptedPosition = Math.min(reported, maxAllowed);
  const maxReachedSec = Math.max(current.maxReachedSec, acceptedPosition);
  const watchedPercent = Math.min(
    100,
    (maxReachedSec / Math.max(course.video.durationSec, 1)) * 100,
  );
  const completed = watchedPercent >= 99.5;
  const status: CourseStatus = completed
    ? current.status === CourseStatus.COMPLETED
      ? CourseStatus.COMPLETED
      : CourseStatus.IN_PROGRESS
    : maxReachedSec > 0
      ? CourseStatus.IN_PROGRESS
      : CourseStatus.NOT_STARTED;

  const progress = await prisma.watchProgress.update({
    where: { id: current.id },
    data: {
      positionSec: acceptedPosition,
      maxReachedSec,
      watchedPercent,
      completed,
      status,
    },
  });

  await prisma.watchEvent.create({
    data: {
      userId: session.id,
      videoId: course.video.id,
      eventType: parsed.data.eventType,
      positionSec: acceptedPosition,
    },
  });

  return NextResponse.json({
    progress,
    accepted: acceptedPosition >= reported - 0.01,
  });
}
