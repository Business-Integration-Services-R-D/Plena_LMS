import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveExamSettings } from "@/lib/exam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Eğitim oluşturma createCourseAction (server action) üzerinden yapılır;
// büyük video yüklemeleri route handler gövde limitine takılıyordu.
export async function GET() {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const poolSelect = {
    id: true,
    name: true,
    _count: { select: { questions: true } },
  } as const;

  const courses = await prisma.course.findMany({
    include: {
      video: true,
      category: { select: { id: true, name: true } },
      questionPool: { select: poolSelect },
      exam: { include: { questionPool: { select: poolSelect } } },
      _count: { select: { assignments: true, enrollments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    courses.map((c) => {
      const settings = resolveExamSettings(c, c.exam);
      const pool = c.exam?.questionPool ?? c.questionPool;

      return {
        id: c.id,
        title: c.title,
        description: c.description,
        active: c.active,
        category: c.category,
        passPercent: settings.passPercent,
        maxAttempts: settings.maxAttempts,
        questionCount: settings.questionCount,
        durationMinutes: settings.durationMinutes,
        retakePolicy: settings.retakePolicy,
        pool: pool
          ? { id: pool.id, name: pool.name, total: pool._count.questions }
          : null,
        video: c.video,
        assignmentCount: c._count.assignments,
        enrollmentCount: c._count.enrollments,
        createdAt: c.createdAt,
      };
    }),
  );
}
