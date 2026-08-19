import { NextRequest, NextResponse } from "next/server";
import { AuditAction, CheckpointOnFail, Role } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const schema = z.object({
  checkpoints: z.array(
    z.object({
      timeSec: z.number().int().min(0),
      questionId: z.string().min(1),
      /// null = süre sınırı yok.
      timeoutSeconds: z.number().int().min(5).max(600).nullable().default(60),
      onFail: z.nativeEnum(CheckpointOnFail).default(CheckpointOnFail.START),
      /// RETRY politikalarında: null = sınırsız deneme.
      maxAttempts: z.number().int().min(1).max(20).nullable().default(null),
    }),
  ),
});

/** Kursun kontrol noktalarını komple değiştirir (replace-all). */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.ADMIN]);
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
  if (!course) {
    return NextResponse.json({ error: "Eğitim bulunamadı" }, { status: 404 });
  }

  const items = parsed.data.checkpoints;

  if (course.video?.pageCount) {
    const beyond = items.find(
      (cp) => cp.timeSec < 1 || cp.timeSec > course.video!.pageCount!,
    );
    if (beyond) {
      return NextResponse.json(
        { error: "Kontrol noktası PDF sayfa aralığında olmalı" },
        { status: 400 },
      );
    }
  } else if (course.video) {
    const beyond = items.find((cp) => cp.timeSec >= course.video!.durationSec);
    if (beyond) {
      return NextResponse.json(
        { error: "Kontrol noktası video süresini aşamaz" },
        { status: 400 },
      );
    }
  }

  const questionIds = [...new Set(items.map((cp) => cp.questionId))];
  if (questionIds.length > 0) {
    const found = await prisma.question.count({
      where: { id: { in: questionIds } },
    });
    if (found !== questionIds.length) {
      return NextResponse.json({ error: "Soru bulunamadı" }, { status: 404 });
    }
  }

  const checkpoints = await prisma.$transaction(async (tx) => {
    await tx.checkpoint.deleteMany({ where: { courseId } });
    if (items.length > 0) {
      await tx.checkpoint.createMany({
        data: items.map((cp) => ({ ...cp, courseId })),
      });
    }
    return tx.checkpoint.findMany({
      where: { courseId },
      orderBy: { timeSec: "asc" },
    });
  });

  await recordAudit({
    action: AuditAction.ADMIN_UPDATED_COURSE,
    actor: session,
    entityType: "Course",
    entityId: courseId,
    metadata: { title: course.title, checkpointCount: checkpoints.length },
  });

  return NextResponse.json(
    checkpoints.map((cp) => ({
      id: cp.id,
      timeSec: cp.timeSec,
      questionId: cp.questionId,
      timeoutSeconds: cp.timeoutSeconds,
      onFail: cp.onFail,
      maxAttempts: cp.maxAttempts,
    })),
  );
}
