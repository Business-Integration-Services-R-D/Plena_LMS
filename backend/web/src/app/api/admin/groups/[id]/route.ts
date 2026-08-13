import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Role } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });
  }

  const group = await prisma.group.findUnique({ where: { id } });
  if (!group) {
    return NextResponse.json({ error: "Ekip bulunamadı" }, { status: 404 });
  }

  if (parsed.data.name && parsed.data.name !== group.name) {
    const exists = await prisma.group.findUnique({
      where: { name: parsed.data.name },
    });
    if (exists) {
      return NextResponse.json(
        { error: "Bu isimde bir ekip zaten var" },
        { status: 409 },
      );
    }
  }

  const updated = await prisma.group.update({
    where: { id },
    data: parsed.data,
  });

  await recordAudit({
    action: AuditAction.ADMIN_UPDATED_GROUP,
    actor: session,
    entityType: "Group",
    entityId: updated.id,
    metadata: {
      name: updated.name,
      ...(parsed.data.active !== undefined
        ? { from: group.active, to: updated.active }
        : {}),
    },
  });

  return NextResponse.json(updated);
}
