import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Role } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const groups = await prisma.group.findMany({
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true, active: true } } },
      },
      _count: { select: { assignments: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      active: g.active,
      assignmentCount: g._count.assignments,
      members: g.members.map((m) => m.user),
    })),
  );
}

const schema = z.object({
  name: z.string().min(2),
  description: z.string().optional().default(""),
});

export async function POST(req: NextRequest) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ekip adı en az 2 karakter olmalı" }, { status: 400 });
  }

  const exists = await prisma.group.findUnique({
    where: { name: parsed.data.name },
  });
  if (exists) {
    return NextResponse.json({ error: "Bu isimde bir ekip zaten var" }, { status: 409 });
  }

  const group = await prisma.group.create({ data: parsed.data });

  await recordAudit({
    action: AuditAction.ADMIN_CREATED_GROUP,
    actor: session,
    entityType: "Group",
    entityId: group.id,
    metadata: { name: group.name },
  });

  return NextResponse.json(group, { status: 201 });
}
