import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { sendPasswordResetEmail } from "@/lib/email";
import {
  discardPasswordResetToken,
  issuePasswordResetToken,
  PASSWORD_RESET_COOLDOWN_SECONDS,
} from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";

const schema = z.object({ email: z.string().trim().email() });
const response = {
  ok: true,
  message: "Bu e-posta ile eşleşen aktif bir hesap varsa şifre yenileme bağlantısı gönderildi.",
};

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(response);

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    select: { id: true, email: true, name: true, active: true, deletedAt: true },
  });
  if (!user || !user.active || user.deletedAt) return NextResponse.json(response);

  const cooldownStart = new Date(
    Date.now() - PASSWORD_RESET_COOLDOWN_SECONDS * 1000,
  );
  const recent = await prisma.passwordResetToken.findFirst({
    where: {
      userId: user.id,
      usedAt: null,
      createdAt: { gt: cooldownStart },
    },
  });
  if (recent) return NextResponse.json(response);

  const credentials = await issuePasswordResetToken(user.id);
  try {
    const delivery = await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      token: credentials.token,
    });
    await recordAudit({
      action: AuditAction.USER_REQUESTED_PASSWORD_RESET,
      actor: user,
      entityType: "User",
      entityId: user.id,
      metadata: {
        deliveryId: delivery.id,
        expiresAt: credentials.expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Şifre yenileme e-postası gönderilemedi:", error);
    await discardPasswordResetToken(credentials.reset.id).catch(() => {});
  }

  return NextResponse.json(response);
}
