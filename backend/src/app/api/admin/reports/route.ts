import { NextRequest, NextResponse } from "next/server";
import { EnrollmentStatus, Prisma, Role, WatchEventType } from "@prisma/client";
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

  // Kontrol noktası istatistikleri: kurs başına toplam, kayıt başına geçilen
  // (tekil) ve başarısız deneme sayısı.
  const courseIds = [...new Set(enrollments.map((e) => e.course.id))];
  const checkpointTotals = new Map<string, number>();
  if (courseIds.length > 0) {
    const grouped = await prisma.checkpoint.groupBy({
      by: ["courseId"],
      where: { courseId: { in: courseIds } },
      _count: { _all: true },
    });
    for (const g of grouped) checkpointTotals.set(g.courseId, g._count._all);
  }

  const enrollmentIds = enrollments.map((e) => e.id);
  const passedByEnrollment = new Map<string, Set<string>>();
  const failsByEnrollment = new Map<string, number>();
  if (enrollmentIds.length > 0) {
    const cpEvents = await prisma.watchEvent.findMany({
      where: {
        enrollmentId: { in: enrollmentIds },
        eventType: {
          in: [WatchEventType.CHECKPOINT_PASSED, WatchEventType.CHECKPOINT_FAILED],
        },
      },
      select: { enrollmentId: true, eventType: true, metadata: true },
    });
    for (const ev of cpEvents) {
      if (ev.eventType === WatchEventType.CHECKPOINT_FAILED) {
        failsByEnrollment.set(
          ev.enrollmentId,
          (failsByEnrollment.get(ev.enrollmentId) ?? 0) + 1,
        );
      } else {
        const cpId = (ev.metadata as { checkpointId?: string } | null)?.checkpointId;
        if (!cpId) continue;
        if (!passedByEnrollment.has(ev.enrollmentId)) {
          passedByEnrollment.set(ev.enrollmentId, new Set());
        }
        passedByEnrollment.get(ev.enrollmentId)!.add(cpId);
      }
    }
  }

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
      reminderDays: e.reminderDays,
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
      checkpointsTotal: checkpointTotals.get(e.course.id) ?? 0,
      checkpointsPassed: passedByEnrollment.get(e.id)?.size ?? 0,
      checkpointFails: failsByEnrollment.get(e.id) ?? 0,
    })),
  });
}
