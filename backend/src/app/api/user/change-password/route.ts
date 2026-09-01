import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { z } from "zod";
import {
  createSession,
  hashPassword,
  requireSession,
  verifyPassword,
} from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const schema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128),
    newPasswordConfirmation: z.string().min(8).max(128),
  })
  .refine((value) => value.newPassword === value.newPasswordConfirmation, {
    path: ["newPasswordConfirmation"],
    message: "Yeni şifreler eşleşmiyor",
  });

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Geçersiz şifre bilgisi" },
      { status: 400 },
    );
  }

  const current = await prisma.user.findUnique({ where: { id: session.id } });
  if (!current || !(await verifyPassword(parsed.data.currentPassword, current.passwordHash))) {
    return NextResponse.json({ error: "Mevcut şifre hatalı" }, { status: 400 });
  }
  if (await verifyPassword(parsed.data.newPassword, current.passwordHash)) {
    return NextResponse.json(
      { error: "Yeni şifre mevcut şifreden farklı olmalı" },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  const now = new Date();
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: current.id },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        sessionVersion: true,
      },
    });
    await tx.passwordResetToken.updateMany({
      where: { userId: current.id, usedAt: null },
      data: { usedAt: now },
    });
    return updated;
  });
  await createSession(user);
  await recordAudit({
    action: AuditAction.USER_CHANGED_PASSWORD,
    actor: user,
    entityType: "User",
    entityId: user.id,
  });
  return NextResponse.json({ ok: true });
}
