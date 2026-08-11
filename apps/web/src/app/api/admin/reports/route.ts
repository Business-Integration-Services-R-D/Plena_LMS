import { NextRequest, NextResponse } from "next/server";
import { EnrollmentStatus, Prisma, Role } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshOverdue } from "@/lib/enrollment";

export const dynamic = "force-dynamic";

/**
 * Admin raporu: kullanıcı x eğitim kırılımında atama tarihi, izleme süresi,
 * doğru/yanlış sayısı, tamamlama durumu ve bitirme tarihi.
 */
export async function GET(req: NextRequest) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") || undefined;
  const courseId = searchParams.get("courseId") || undefined;
  const groupId = searchParams.get("groupId") || undefined;
  const statusParam = searchParams.get("status");

  const status =
    statusParam && statusParam in EnrollmentStatus
      ? (statusParam as EnrollmentStatus)
      : undefined;

  const where: Prisma.EnrollmentWhereInput = {
    userId,
    courseId,
    status,
    ...(groupId ? { user: { memberships: { some: { groupId } } } } : {}),
  };

  await refreshOverdue(where);

  const enrollments = await prisma.enrollment.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true, active: true } },
      course: {
        select: {
          id: true,
          title: true,
          passPercent: true,
          category: { select: { id: true, name: true } },
          exam: { select: { passPercent: true } },
        },
      },
      assignment: {
        select: { target: true, group: { select: { id: true, name: true } } },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 1000,
  });

  const summary = {
    total: enrollments.length,
    notStarted: 0,
    inProgress: 0,
    completed: 0,
    failed: 0,
    overdue: 0,
  };
  for (const e of enrollments) {
    if (e.status === "NOT_STARTED") summary.notStarted += 1;
    else if (e.status === "IN_PROGRESS") summary.inProgress += 1;
    else if (e.status === "COMPLETED") summary.completed += 1;
    else if (e.status === "FAILED") summary.failed += 1;
    else if (e.status === "OVERDUE") summary.overdue += 1;
  }

  return NextResponse.json({
    summary,
    rows: enrollments.map((e) => ({
      enrollmentId: e.id,
      user: e.user,
      course: {
        id: e.course.id,
        title: e.course.title,
        passPercent: e.course.exam?.passPercent ?? e.course.passPercent,
        category: e.course.category,
      },
      group: e.assignment?.group ?? null,
      assignedVia: e.assignment?.target ?? null,
      status: e.status,
      assignedAt: e.assignedAt,
      startsAt: e.startsAt,
      dueAt: e.dueAt,
      firstStartedAt: e.firstStartedAt,
      completedAt: e.completedAt,
      totalWatchedSec: e.totalWatchedSec,
      watchedPercent: Math.round(e.watchedPercent),
      videoCompleted: e.videoCompleted,
      attemptCount: e.attemptCount,
      correctCount: e.lastCorrectCount,
      wrongCount: e.lastWrongCount,
      bestScorePercent: e.bestScorePercent,
      passed: e.passed,
    })),
  });
}
