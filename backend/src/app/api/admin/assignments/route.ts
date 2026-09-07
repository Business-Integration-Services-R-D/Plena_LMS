import { NextRequest, NextResponse } from "next/server";
import { AssignmentTarget, AuditAction, Role } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { syncEnrollmentsForAssignment } from "@/lib/enrollment";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const assignments = await prisma.assignment.findMany({
    include: {
      user: { select: { id: true, name: true, email: true } },
      group: { select: { id: true, name: true } },
      course: { select: { id: true, title: true } },
      _count: { select: { enrollments: true } },
    },
    orderBy: { assignedAt: "desc" },
  });

  return NextResponse.json(
    assignments.map((a) => ({
      id: a.id,
      target: a.target,
      course: a.course,
      user: a.user,
      group: a.group,
      startsAt: a.startsAt,
      dueAt: a.dueAt,
      reminderDays: a.reminderDays,
      assignedAt: a.assignedAt,
      enrollmentCount: a._count.enrollments,
    })),
  );
}

const schema = z
  .object({
    courseId: z.string().min(1),
    target: z.nativeEnum(AssignmentTarget),
    userId: z.string().min(1).optional(),
    groupId: z.string().min(1).optional(),
    startsAt: z.string().min(1).optional().nullable(),
    dueAt: z.string().optional().nullable(),
    reminderDays: z.number().int().min(0).max(365).default(0),
  })
  .refine((v) => (v.target === "USER" ? Boolean(v.userId) : Boolean(v.groupId)), {
    message: "Hedef seçilmedi",
  })
  .refine((v) => v.reminderDays === 0 || Boolean(v.dueAt), {
    message: "Hatırlatma için son tarih gerekli",
    path: ["reminderDays"],
  });

export async function POST(req: NextRequest) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Geçersiz veri" },
      { status: 400 },
    );
  }

  const { courseId, target, startsAt, dueAt, reminderDays } = parsed.data;
  const userId = target === "USER" ? parsed.data.userId! : null;
  const groupId = target === "GROUP" ? parsed.data.groupId! : null;

  const startsAtDate = startsAt ? new Date(startsAt) : new Date();
  const dueAtDate = dueAt ? new Date(dueAt) : null;
  const currentMinute = new Date();
  currentMinute.setSeconds(0, 0);

  if (
    Number.isNaN(startsAtDate.getTime()) ||
    (startsAt && !/^\d{4}-/.test(startsAt))
  ) {
    return NextResponse.json({ error: "Başlangıç tarihi geçersiz" }, { status: 400 });
  }
  if (startsAt && startsAtDate < currentMinute) {
    return NextResponse.json(
      { error: "Başlangıç tarihi geçmişte olamaz" },
      { status: 400 },
    );
  }
  if (
    dueAtDate &&
    (Number.isNaN(dueAtDate.getTime()) || !/^\d{4}-/.test(dueAt!))
  ) {
    return NextResponse.json({ error: "Bitiş tarihi geçersiz" }, { status: 400 });
  }
  if (dueAtDate && dueAtDate < currentMinute) {
    return NextResponse.json(
      { error: "Bitiş tarihi geçmişte olamaz" },
      { status: 400 },
    );
  }
  if (dueAtDate && dueAtDate <= startsAtDate) {
    return NextResponse.json(
      { error: "Bitiş tarihi başlangıçtan sonra olmalı" },
      { status: 400 },
    );
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { active: true },
  });
  if (!course) {
    return NextResponse.json({ error: "Eğitim bulunamadı" }, { status: 404 });
  }
  if (!course.active) {
    return NextResponse.json(
      { error: "Pasif eğitime yeni atama yapılamaz" },
      { status: 409 },
    );
  }

  const assignment = await prisma.assignment.upsert({
    where:
      target === "USER"
        ? { courseId_userId: { courseId, userId: userId! } }
        : { courseId_groupId: { courseId, groupId: groupId! } },
    update: { startsAt: startsAtDate, dueAt: dueAtDate, reminderDays },
    create: {
      courseId,
      target,
      userId,
      groupId,
      startsAt: startsAtDate,
      dueAt: dueAtDate,
      reminderDays,
      assignedById: session.id,
    },
  });

  const enrolled = await syncEnrollmentsForAssignment(assignment.id);

  await recordAudit({
    action: AuditAction.ADMIN_ASSIGNED_COURSE,
    actor: session,
    entityType: "Assignment",
    entityId: assignment.id,
    metadata: {
      courseId,
      target,
      userId,
      groupId,
      startsAt: startsAtDate.toISOString(),
      dueAt: dueAtDate?.toISOString() ?? null,
      reminderDays,
      enrolled,
    },
  });

  return NextResponse.json({ ...assignment, enrolled }, { status: 201 });
}
