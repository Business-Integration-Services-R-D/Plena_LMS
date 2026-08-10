import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await requireSession([Role.CAPTAIN, Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const assignments = await prisma.assignment.findMany({
    where: { userId: session.id },
    include: {
      course: {
        include: {
          video: true,
          _count: { select: { questions: true } },
        },
      },
    },
    orderBy: { assignedAt: "desc" },
  });

  const progress = await prisma.watchProgress.findMany({
    where: { userId: session.id },
  });
  const progressMap = new Map(progress.map((p) => [p.courseId, p]));

  const latestAttempts = await prisma.quizAttempt.findMany({
    where: { userId: session.id },
    orderBy: { completedAt: "desc" },
  });
  const attemptMap = new Map<string, (typeof latestAttempts)[number]>();
  for (const a of latestAttempts) {
    if (!attemptMap.has(a.courseId)) attemptMap.set(a.courseId, a);
  }

  return NextResponse.json(
    assignments.map((a) => ({
      assignmentId: a.id,
      course: a.course,
      progress: progressMap.get(a.courseId) || null,
      latestAttempt: attemptMap.get(a.courseId) || null,
    })),
  );
}
