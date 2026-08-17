import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Role } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
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
      checkpoints: { orderBy: { timeSec: "asc" } },
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
        scoringMode: settings.scoringMode,
        pool: pool
          ? { id: pool.id, name: pool.name, total: pool._count.questions }
          : null,
        video: c.video,
        checkpoints: c.checkpoints.map((cp) => ({
          id: cp.id,
          timeSec: cp.timeSec,
          questionId: cp.questionId,
          timeoutSeconds: cp.timeoutSeconds,
          onFail: cp.onFail,
          maxAttempts: cp.maxAttempts,
        })),
        assignmentCount: c._count.assignments,
        enrollmentCount: c._count.enrollments,
        createdAt: c.createdAt,
      };
    }),
  );
}

const createSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional().default(""),
});

/**
 * Videosuz kurs oluşturma (harici UI akışı: önce kurs, sonra video yüklenir).
 * Kursa özel bir soru havuzu açılır; sınav soruları bu havuz üzerinden yönetilir.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Başlık en az 2 karakter olmalı" }, { status: 400 });
  }

  const course = await prisma.course.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      passPercent: 80,
      maxAttempts: 0,
      questionCount: 0,
    },
  });

  const pool = await prisma.questionPool.create({
    data: {
      name: `[Kurs] ${course.id}`,
      description: `"${course.title}" eğitiminin sınav soruları`,
    },
  });

  await prisma.exam.create({
    data: {
      courseId: course.id,
      questionPoolId: pool.id,
      passPercent: 80,
      maxAttempts: 0,
      questionCount: 0,
    },
  });

  await prisma.course.update({
    where: { id: course.id },
    data: { questionPoolId: pool.id },
  });

  await recordAudit({
    action: AuditAction.ADMIN_CREATED_COURSE,
    actor: session,
    entityType: "Course",
    entityId: course.id,
    metadata: { title: course.title, poolId: pool.id },
  });

  return NextResponse.json({ id: course.id, title: course.title }, { status: 201 });
}
