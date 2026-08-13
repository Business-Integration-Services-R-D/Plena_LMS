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

  const data: {
    active?: boolean;
    name?: string;
    passwordHash?: string;
  } = {};
  if (parsed.data.active !== undefined) data.active = parsed.data.active;
  if (parsed.data.name) data.name = parsed.data.name;
  if (parsed.data.password) data.passwordHash = await hashPassword(parsed.data.password);

  const before = await prisma.user.findUnique({
    where: { id },
    select: { active: true, name: true },
  });
  if (!before) {
    return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, email: true, name: true, role: true, active: true },
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
