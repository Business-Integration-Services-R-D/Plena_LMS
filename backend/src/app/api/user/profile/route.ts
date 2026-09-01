import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { z } from "zod";
import { createSession, requireSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
});

const profileSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  sessionVersion: true,
  createdAt: true,
} as const;

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: profileSelect,
  });
  if (!user) return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
  return NextResponse.json(user);
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Geçersiz profil bilgisi" },
      { status: 400 },
    );
  }

  const user = await prisma.user.update({
    where: { id: session.id },
    data: parsed.data,
    select: profileSelect,
  });
  await createSession({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    sessionVersion: user.sessionVersion,
  });
  await recordAudit({
    action: AuditAction.USER_UPDATED_PROFILE,
    actor: user,
    entityType: "User",
    entityId: user.id,
    metadata: {
      nameChanged: true,
    },
  });
  return NextResponse.json(user);
}
