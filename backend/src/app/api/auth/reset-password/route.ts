import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
  hashPasswordResetToken,
  passwordResetTokenUsable,
} from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";

const resetSchema = z
  .object({
    token: z.string().min(20),
    password: z.string().min(8).max(128),
    passwordConfirmation: z.string().min(8).max(128),
  })
  .refine((value) => value.password === value.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "Şifreler eşleşmiyor",
  });

async function findReset(token: string) {
  return prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashPasswordResetToken(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          passwordHash: true,
          active: true,
          deletedAt: true,
        },
      },
    },
  });
}

function usable(reset: Awaited<ReturnType<typeof findReset>>) {
  return Boolean(
    reset &&
      reset.user.active &&
      !reset.user.deletedAt &&
      passwordResetTokenUsable(reset),
  );
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token") || "";
  const reset = token ? await findReset(token) : null;
  if (!usable(reset)) {
    return NextResponse.json(
      { error: "Şifre yenileme bağlantısı geçersiz veya süresi dolmuş" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, email: reset!.user.email });
}

export async function POST(req: NextRequest) {
  const parsed = resetSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Geçersiz şifre bilgisi" },
      { status: 400 },
    );
  }

  const reset = await findReset(parsed.data.token);
  if (!usable(reset)) {
    return NextResponse.json(
      { error: "Şifre yenileme bağlantısı geçersiz veya süresi dolmuş" },
      { status: 400 },
    );
  }
  if (await verifyPassword(parsed.data.password, reset!.user.passwordHash)) {
    return NextResponse.json(
      { error: "Yeni şifre önceki şifrenizden farklı olmalı" },
      { status: 400 },
    );
  }

  const now = new Date();
  const passwordHash = await hashPassword(parsed.data.password);
  try {
    const user = await prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: {
          id: reset!.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new Error("RESET_ALREADY_USED");

      const user = await tx.user.update({
        where: { id: reset!.userId, active: true, deletedAt: null },
        data: {
          passwordHash,
          sessionVersion: { increment: 1 },
        },
        select: { id: true, email: true },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      });
      return user;
    });

    await recordAudit({
      action: AuditAction.USER_RESET_PASSWORD,
      actor: user,
      entityType: "User",
      entityId: user.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Şifre yenilenemedi:", error);
    return NextResponse.json(
      { error: "Şifre yenileme bağlantısı geçersiz veya daha önce kullanılmış" },
      { status: 400 },
    );
  }
}
