import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { AuditAction, Role } from "@prisma/client";
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

export async function GET() {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      deactivatedAt: true,
      createdAt: true,
      activationTokens: {
        select: { id: true },
        take: 1,
      },
    },
  });
  return NextResponse.json(
    users.map(({ activationTokens, ...user }) => ({
      ...user,
      activationSent: activationTokens.length > 0,
    })),
  );
}

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(6).optional(),
  role: z.enum(["ADMIN", "USER"]).default("USER"),
  sendActivation: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });
  }

  const hasInitialPassword = Boolean(parsed.data.password);
  const passwordHash = await hashPassword(
    parsed.data.password || randomBytes(32).toString("base64url"),
  );
  try {
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email.toLowerCase(),
        name: parsed.data.name,
        passwordHash,
        role: parsed.data.role,
        active: hasInitialPassword,
      },
      select: { id: true, email: true, name: true, role: true, active: true },
    });

    await recordAudit({
      action: AuditAction.ADMIN_CREATED_USER,
      actor: session,
      entityType: "User",
      entityId: user.id,
      metadata: {
        email: user.email,
        role: user.role,
        activationRequired: !user.active,
      },
    });

    let activationEmailSent: boolean | null = null;
    if (parsed.data.sendActivation && !user.active) {
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
        await keepOnlyActivationToken(
          user.id,
          credentials.activation.id,
        ).catch((error) =>
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
          },
        });
      } catch (error) {
        console.error("Aktivasyon maili gönderilemedi:", error);
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

    return NextResponse.json(
      {
        ...user,
        activationSent: activationEmailSent === true,
        activationEmailSent,
        ...(activationEmailSent === false
          ? {
              activationEmailError:
                "Kullanıcı kaydedildi ancak aktivasyon maili gönderilemedi",
            }
          : {}),
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "E-posta zaten kayıtlı" }, { status: 409 });
  }
}
