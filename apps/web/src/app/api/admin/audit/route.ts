import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") || undefined;
  const courseId = searchParams.get("courseId") || undefined;
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const createdAt =
    from || to
      ? {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        }
      : undefined;

  const [watchEvents, quizAttempts, progress] = await Promise.all([
    prisma.watchEvent.findMany({
      where: {
        userId,
        createdAt,
        video: courseId ? { courseId } : undefined,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        video: { include: { course: { select: { id: true, title: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.quizAttempt.findMany({
      where: { userId, courseId, completedAt: createdAt },
      include: {
        user: { select: { id: true, name: true, email: true } },
        course: { select: { id: true, title: true } },
      },
      orderBy: { completedAt: "desc" },
      take: 500,
    }),
    prisma.watchProgress.findMany({
      where: { userId, courseId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        course: { select: { id: true, title: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return NextResponse.json({ watchEvents, quizAttempts, progress });
}
