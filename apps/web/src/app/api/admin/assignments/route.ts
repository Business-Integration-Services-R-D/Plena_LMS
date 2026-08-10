import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const assignments = await prisma.assignment.findMany({
    include: {
      user: { select: { id: true, name: true, email: true } },
      course: { select: { id: true, title: true } },
    },
    orderBy: { assignedAt: "desc" },
  });
  return NextResponse.json(assignments);
}

const schema = z.object({
  userId: z.string().min(1),
  courseId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });
  }

  const assignment = await prisma.assignment.upsert({
    where: {
      userId_courseId: {
        userId: parsed.data.userId,
        courseId: parsed.data.courseId,
      },
    },
    update: {},
    create: {
      userId: parsed.data.userId,
      courseId: parsed.data.courseId,
    },
  });

  await prisma.watchProgress.upsert({
    where: {
      userId_courseId: {
        userId: parsed.data.userId,
        courseId: parsed.data.courseId,
      },
    },
    update: {},
    create: {
      userId: parsed.data.userId,
      courseId: parsed.data.courseId,
    },
  });

  return NextResponse.json(assignment, { status: 201 });
}
