import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Role } from "@prisma/client";
import { z } from "zod";
import { hashPassword, requireSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  active: z.boolean().optional(),
  name: z.string().min(2).optional(),
  password: z.string().min(6).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });
  }
  if (id === session.id && parsed.data.active === false) {
    return NextResponse.json(
      { error: "Kendi hesabınızı pasife alamazsınız" },
      { status: 400 },
    );
  }

  const data: {
    active?: boolean;
    deactivatedAt?: Date | null;
    name?: string;
    passwordHash?: string;
    sessionVersion?: { increment: number };
  } = {};
  if (parsed.data.active !== undefined) {
    data.active = parsed.data.active;
    data.deactivatedAt = parsed.data.active ? null : new Date();
    if (!parsed.data.active) data.sessionVersion = { increment: 1 };
  }
  if (parsed.data.name) data.name = parsed.data.name;
  if (parsed.data.password) {
    data.passwordHash = await hashPassword(parsed.data.password);
    data.sessionVersion = { increment: 1 };
  }

  const before = await prisma.user.findUnique({
    where: { id, deletedAt: null },
    select: { active: true, deactivatedAt: true, name: true },
  });
  if (!before) {
    return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
  }
  if (
    parsed.data.active === true &&
    !before.active &&
    before.deactivatedAt === null
  ) {
    return NextResponse.json(
      { error: "Aktivasyon bekleyen hesap doğrudan aktifleştirilemez" },
      { status: 400 },
    );
  }

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id, deletedAt: null },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        deactivatedAt: true,
      },
    });
    if (data.passwordHash) {
      await tx.passwordResetToken.updateMany({
        where: { userId: id, usedAt: null },
        data: { usedAt: new Date() },
      });
    }
    return updated;
  });

  // Aktiflik değişimi ayrı bir denetim eylemi; raporlarda ayrı filtrelenebilsin.
  const statusChanged =
    data.active !== undefined && data.active !== before.active;

  await recordAudit({
    action: statusChanged
      ? AuditAction.ADMIN_CHANGED_USER_STATUS
      : AuditAction.ADMIN_UPDATED_USER,
    actor: session,
    entityType: "User",
    entityId: user.id,
    metadata: {
      email: user.email,
      ...(statusChanged ? { from: before.active, to: user.active } : {}),
      ...(data.name ? { nameChanged: true } : {}),
      ...(data.passwordHash ? { passwordChanged: true } : {}),
    },
  });

  return NextResponse.json(user);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (id === session.id) {
    return NextResponse.json(
      { error: "Kendi hesabınızı silemezsiniz" },
      { status: 400 },
    );
  }

  const before = await prisma.user.findUnique({
    where: { id, deletedAt: null },
    select: { id: true, email: true, active: true },
  });
  if (!before) {
    return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.userActivationToken.updateMany({
      where: { userId: id, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.user.update({
      where: { id, deletedAt: null },
      data: {
        active: false,
        deactivatedAt: now,
        deletedAt: now,
        sessionVersion: { increment: 1 },
      },
    }),
  ]);

  await recordAudit({
    action: AuditAction.ADMIN_CHANGED_USER_STATUS,
    actor: session,
    entityType: "User",
    entityId: id,
    metadata: {
      email: before.email,
      from: before.active,
      to: false,
      deleted: true,
    },
  });

  return NextResponse.json({ ok: true });
}
