import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Role } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { syncEnrollmentsForGroupMember } from "@/lib/enrollment";

export const dynamic = "force-dynamic";

const schema = z.object({ userId: z.string().min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: groupId } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Kullanıcı seçin" }, { status: 400 });
  }

  await prisma.groupMember.upsert({
    where: { groupId_userId: { groupId, userId: parsed.data.userId } },
    update: {},
    create: { groupId, userId: parsed.data.userId },
  });

  // Ekibin mevcut atamaları yeni üyeye de yayılır.
  const synced = await syncEnrollmentsForGroupMember(groupId, parsed.data.userId);

  await recordAudit({
    action: AuditAction.ADMIN_ADDED_GROUP_MEMBER,
    actor: session,
    entityType: "Group",
    entityId: groupId,
    metadata: { userId: parsed.data.userId, syncedEnrollments: synced },
  });

  return NextResponse.json({ ok: true, synced }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: groupId } = await params;
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId gerekli" }, { status: 400 });
  }

  await prisma.groupMember.deleteMany({ where: { groupId, userId } });

  await recordAudit({
    action: AuditAction.ADMIN_REMOVED_GROUP_MEMBER,
    actor: session,
    entityType: "Group",
    entityId: groupId,
    metadata: { userId },
  });

  // Kayıtlar denetim geçmişi için silinmez; sadece üyelik kalkar.
  return NextResponse.json({ ok: true });
}
