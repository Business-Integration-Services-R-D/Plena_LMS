import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.CAPTAIN, Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: courseId } = await params;
  const assignment = await prisma.assignment.findUnique({
    where: { userId_courseId: { userId: session.id, courseId } },
  });
  if (!assignment && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Atama yok" }, { status: 403 });
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      video: true,
      questions: { include: { choices: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!course?.video) {
    return NextResponse.json({ error: "Eğitim bulunamadı" }, { status: 404 });
  }

  let progress = await prisma.watchProgress.findUnique({
    where: { userId_courseId: { userId: session.id, courseId } },
  });
  if (!progress) {
    progress = await prisma.watchProgress.create({
      data: { userId: session.id, courseId },
    });
  }

  await prisma.watchEvent.create({
    data: {
      userId: session.id,
      videoId: course.video.id,
      eventType: "START",
      positionSec: progress.positionSec,
    },
  });

  // Auth-gated proxy URL (avoids exposing MinIO publicly in PoC demos)
  const url = `/api/captain/courses/${courseId}/video`;

  return NextResponse.json({
    course: {
      id: course.id,
      title: course.title,
      description: course.description,
      passPercent: course.passPercent,
      questionCount: course.questions.length,
    },
    video: {
      id: course.video.id,
      durationSec: course.video.durationSec,
      url,
    },
    progress,
  });
}
