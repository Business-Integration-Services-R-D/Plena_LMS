import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Prisma, Role } from "@prisma/client";
import { z } from "zod";
import {
  discardActivationToken,
  issueActivationToken,
  keepOnlyActivationToken,
} from "@/lib/activation";
import { hashPassword, requireSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { sendActivationEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

const restoreSchema = z.object({
  sendActivation: z.boolean().default(true),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = restoreSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });
  }

  const { id } = await params;
  const archived = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      deletedAt: true,
    },
  });

  if (!archived) {
    return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
  }
  if (!archived.deletedAt) {
    return NextResponse.json(
      { error: "Kullanıcı arşivlenmiş değil" },
      { status: 409 },
    );
  }

  const now = new Date();
  const passwordHash = await hashPassword(
    randomBytes(32).toString("base64url"),
  );

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      await tx.userActivationToken.updateMany({
        where: { userId: id, usedAt: null },
        data: { usedAt: now },
      });
      return tx.user.update({
        where: { id, deletedAt: { not: null } },
        data: {
          active: false,
          deletedAt: null,
          deactivatedAt: null,
          passwordHash,
          sessionVersion: { increment: 1 },
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          active: true,
          deactivatedAt: true,
          deletedAt: true,
          createdAt: true,
        },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Kullanıcı daha önce geri yüklenmiş olabilir" },
        { status: 409 },
      );
    }
    throw error;
  }

  await recordAudit({
    action: AuditAction.ADMIN_CHANGED_USER_STATUS,
    actor: session,
    entityType: "User",
    entityId: user.id,
    metadata: {
      email: user.email,
      restored: true,
      previousDeletedAt: archived.deletedAt.toISOString(),
      activationRequired: true,
    },
  });

  let activationEmailSent: boolean | null = null;
  if (parsed.data.sendActivation) {
    activationEmailSent = false;
    let credentials: Awaited<ReturnType<typeof issueActivationToken>> | null =
      null;
    try {
      credentials = await issueActivationToken(user.id);
      const delivery = await sendActivationEmail({
        to: user.email,
        name: user.name,
        code: credentials.code,
        token: credentials.token,
      });
      activationEmailSent = true;
      await keepOnlyActivationToken(user.id, credentials.activation.id).catch(
        (error) =>
          console.error("Eski aktivasyon tokenları kapatılamadı:", error),
      );
      await recordAudit({
        action: AuditAction.ADMIN_SENT_ACTIVATION,
        actor: session,
        entityType: "User",
        entityId: user.id,
        metadata: {
          email: user.email,
          deliveryId: delivery.id,
          expiresAt: credentials.expiresAt.toISOString(),
          restored: true,
        },
      });
    } catch (error) {
      console.error("Geri yüklenen kullanıcıya aktivasyon maili gönderilemedi:", error);
      if (credentials) {
        await discardActivationToken(credentials.activation.id).catch(
          (discardError) =>
            console.error(
              "Gönderilemeyen aktivasyon tokenı silinemedi:",
              discardError,
            ),
        );
      }
    }
  }

  return NextResponse.json({
    ...user,
    activationSent: activationEmailSent === true,
    activationEmailSent,
    ...(activationEmailSent === false
      ? {
          activationEmailError:
            "Kullanıcı geri yüklendi ancak aktivasyon maili gönderilemedi",
        }
      : {}),
  });
}
