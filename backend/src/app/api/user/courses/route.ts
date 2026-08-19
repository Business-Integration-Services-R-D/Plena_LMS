import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshOverdue, visibleEnrollmentWhere } from "@/lib/enrollment";
import { effectiveQuestionCount, resolveExamSettings } from "@/lib/exam";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession([Role.USER, Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await refreshOverdue({ userId: session.id });

  const enrollments = await prisma.enrollment.findMany({
    where: visibleEnrollmentWhere(session.id),
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
          _count: { select: { checkpoints: true } },
        },
      },
      quizAttempts: { orderBy: { completedAt: "desc" }, take: 1 },
    },
    orderBy: [{ dueAt: "asc" }, { assignedAt: "desc" }],
  });

  return NextResponse.json(
    enrollments.map((e) => {
      const settings = resolveExamSettings(e.course, e.course.exam);
      const poolTotal =
        e.course.exam?.questionPool?._count.questions ??
        e.course.questionPool?._count.questions ??
        0;

      return {
        enrollmentId: e.id,
        status: e.status,
        startsAt: e.startsAt,
        dueAt: e.dueAt,
        assignedAt: e.assignedAt,
        positionSec: e.positionSec,
        watchedPercent: e.watchedPercent,
        totalWatchedSec: e.totalWatchedSec,
        videoCompleted: e.videoCompleted,
        passed: e.passed,
        attemptCount: e.attemptCount,
        completedAt: e.completedAt,
        course: {
          id: e.course.id,
          title: e.course.title,
          description: e.course.description,
          passPercent: settings.passPercent,
          maxAttempts: settings.maxAttempts,
          durationSec: e.course.video?.durationSec ?? 0,
          contentType: e.course.video?.contentType ?? null,
          pageCount: e.course.video?.pageCount ?? null,
          questionCount: effectiveQuestionCount(settings, poolTotal),
          checkpointCount: e.course._count.checkpoints,
        },
        latestAttempt: e.quizAttempts[0] ?? null,
      };
    }),
  );
}
