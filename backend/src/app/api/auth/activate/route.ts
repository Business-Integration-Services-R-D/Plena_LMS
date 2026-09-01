import { NextRequest, NextResponse } from "next/server";
import { AuditAction, NotificationKind } from "@prisma/client";
import { z } from "zod";
import {
  ACTIVATION_MAX_ATTEMPTS,
  hashActivationToken,
  isActivationCodeValid,
} from "@/lib/activation";
import { createSession, hashPassword } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const activateSchema = z
  .object({
    token: z.string().min(32),
    code: z.string().regex(/^\d{6}$/),
    password: z.string().min(6),
    passwordConfirmation: z.string().min(6),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "Şifreler eşleşmiyor",
  });

const invalidLink = () =>
  NextResponse.json(
    { error: "Aktivasyon bağlantısı geçersiz veya süresi dolmuş" },
    { status: 400 },
  );

async function findCurrentActivation(token: string) {
  const activation = await prisma.userActivationToken.findUnique({
    where: { tokenHash: hashActivationToken(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          sessionVersion: true,
          active: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!activation) return null;
  const latest = await prisma.userActivationToken.findFirst({
    where: { userId: activation.userId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  return latest?.id === activation.id ? activation : null;
}

function isUsable(
  activation: Awaited<ReturnType<typeof findCurrentActivation>>,
) {
  return Boolean(
    activation &&
      !activation.usedAt &&
      activation.expiresAt.getTime() > Date.now() &&
      activation.failedAttempts < ACTIVATION_MAX_ATTEMPTS &&
      !activation.user.active &&
      !activation.user.deletedAt,
  );
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token || token.length < 32) return invalidLink();

  const activation = await findCurrentActivation(token);
  if (!isUsable(activation)) return invalidLink();

  return NextResponse.json({
    valid: true,
    name: activation!.user.name,
    expiresAt: activation!.expiresAt.toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const parsed = activateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const passwordMismatch = parsed.error.issues.some(
      (issue) => issue.path[0] === "passwordConfirmation",
    );
    return NextResponse.json(
      { error: passwordMismatch ? "Şifreler eşleşmiyor" : "Geçersiz veri" },
      { status: 400 },
    );
  }

  const activation = await findCurrentActivation(parsed.data.token);
  if (!isUsable(activation)) return invalidLink();

  if (
    !isActivationCodeValid(
      parsed.data.token,
      parsed.data.code,
      activation!.codeHash,
    )
  ) {
    const bumped = await prisma.userActivationToken.updateMany({
      where: {
        id: activation!.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
        failedAttempts: { lt: ACTIVATION_MAX_ATTEMPTS },
      },
      data: { failedAttempts: { increment: 1 } },
    });
    if (bumped.count !== 1) return invalidLink();

    const updated = await prisma.userActivationToken.findUnique({
      where: { id: activation!.id },
      select: { failedAttempts: true },
    });
    return NextResponse.json(
      {
        error:
          (updated?.failedAttempts ?? ACTIVATION_MAX_ATTEMPTS) >=
          ACTIVATION_MAX_ATTEMPTS
            ? "Çok fazla hatalı deneme yapıldı. Yeni aktivasyon maili isteyin."
            : "Doğrulama kodu hatalı",
      },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const now = new Date();
  try {
    const user = await prisma.$transaction(async (tx) => {
      const consumed = await tx.userActivationToken.updateMany({
        where: {
          id: activation!.id,
          usedAt: null,
          expiresAt: { gt: now },
          failedAttempts: { lt: ACTIVATION_MAX_ATTEMPTS },
        },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new Error("ACTIVATION_ALREADY_USED");

      const user = await tx.user.update({
        where: {
          id: activation!.userId,
          active: false,
          deletedAt: null,
        },
        data: {
          passwordHash,
          active: true,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          sessionVersion: true,
          active: true,
        },
      });

      await tx.userNotification.upsert({
        where: {
          userId_dedupeKey: {
            userId: user.id,
            dedupeKey: "welcome",
          },
        },
        update: {},
        create: {
          userId: user.id,
          kind: NotificationKind.WELCOME,
          dedupeKey: "welcome",
          title: "Plena LMS'e hoş geldiniz",
          body:
            "Hesabınız başarıyla aktive edildi. Size atanan eğitimleri Eğitimlerim ekranından takip edebilirsiniz.",
          link: "/trainings",
          occurredAt: now,
        },
      });

      return user;
    });

    await createSession(user);
    await recordAudit({
      action: AuditAction.USER_ACTIVATED_ACCOUNT,
      actor: user,
      entityType: "User",
      entityId: user.id,
      metadata: { email: user.email },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("Hesap aktive edilemedi:", error);
    return invalidLink();
  }
}
