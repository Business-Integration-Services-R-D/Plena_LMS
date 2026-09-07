import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Role, ScoringMode } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { syncEnrollmentsForAssignment } from "@/lib/enrollment";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional(),
  active: z.boolean().optional(),
  passPercent: z.number().min(0).max(100).optional(),
  questionPoolId: z.string().min(1).optional(),
  scoringMode: z.nativeEnum(ScoringMode).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });
  }

  const course = await prisma.course.findUnique({
    where: { id },
    include: { exam: true },
  });
  if (!course) {
    return NextResponse.json({ error: "Eğitim bulunamadı" }, { status: 404 });
  }

  const { passPercent, questionPoolId, scoringMode, ...courseData } = parsed.data;

  if (questionPoolId) {
    const pool = await prisma.questionPool.findUnique({
      where: { id: questionPoolId },
    });
    if (!pool) {
      return NextResponse.json({ error: "Soru havuzu bulunamadı" }, { status: 404 });
    }
  }

  const updated = await prisma.course.update({
    where: { id },
    data: {
      ...courseData,
      // Geriye dönük uyumluluk: baraj/havuz Course üzerindeki eski alanlara da yazılır.
      ...(passPercent !== undefined ? { passPercent } : {}),
      ...(questionPoolId ? { questionPoolId } : {}),
    },
  });

  const examData = {
    ...(passPercent !== undefined ? { passPercent } : {}),
    ...(questionPoolId ? { questionPoolId } : {}),
    ...(scoringMode !== undefined ? { scoringMode } : {}),
  };

  if (Object.keys(examData).length > 0) {
    if (course.exam) {
      await prisma.exam.update({ where: { id: course.exam.id }, data: examData });
    } else if (scoringMode !== undefined) {
      // Puanlama modu yalnızca Exam üzerinde tutulur; eski kurslarda kayıt açılır.
      await prisma.exam.create({
        data: {
          courseId: id,
          questionPoolId: updated.questionPoolId,
          questionCount: updated.questionCount,
          passPercent: updated.passPercent,
          maxAttempts: updated.maxAttempts,
          scoringMode,
        },
      });
    }
  }

  // Eğitim yeniden açılırken, pasif olduğu sırada değişen grup üyeliklerini
  // mevcut atamalarla tekrar eşitle. Geçmiş ilerleme kayıtları upsert ile korunur.
  if (parsed.data.active === true && course.active === false) {
    const assignments = await prisma.assignment.findMany({
      where: { courseId: id },
      select: { id: true },
    });
    for (const assignment of assignments) {
      await syncEnrollmentsForAssignment(assignment.id);
    }
  }

  const activeChanged =
    parsed.data.active !== undefined && parsed.data.active !== course.active;
  const auditAction = activeChanged
    ? parsed.data.active
      ? AuditAction.ADMIN_REACTIVATED_COURSE
      : AuditAction.ADMIN_DEACTIVATED_COURSE
    : AuditAction.ADMIN_UPDATED_COURSE;

  await recordAudit({
    action: auditAction,
    actor: session,
    entityType: "Course",
    entityId: updated.id,
    metadata: {
      title: updated.title,
      ...(parsed.data.active !== undefined
        ? { from: course.active, to: updated.active }
        : {}),
      ...(passPercent !== undefined ? { passPercent } : {}),
    },
  });

  return NextResponse.json({
    id: updated.id,
    title: updated.title,
    description: updated.description,
    active: updated.active,
    passPercent: updated.passPercent,
  });
}
