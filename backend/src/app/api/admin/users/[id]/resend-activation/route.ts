import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Role } from "@prisma/client";
import {
  discardActivationToken,
  issueActivationToken,
  keepOnlyActivationToken,
} from "@/lib/activation";
import { requireSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { sendActivationEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id, deletedAt: null },
    select: { id: true, email: true, name: true, active: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
  }
  if (user.active) {
    return NextResponse.json(
      { error: "Aktif kullanıcı için aktivasyon gönderilemez" },
      { status: 400 },
    );
  }

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
        resent: true,
      },
    });

    return NextResponse.json({
      ok: true,
      expiresAt: credentials.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Aktivasyon maili tekrar gönderilemedi:", error);
    if (credentials) {
      await discardActivationToken(credentials.activation.id).catch(
        (discardError) =>
          console.error(
            "Gönderilemeyen aktivasyon tokenı silinemedi:",
            discardError,
          ),
      );
    }
    return NextResponse.json(
      { error: "Aktivasyon maili gönderilemedi" },
      { status: 502 },
    );
  }
}
