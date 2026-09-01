import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const pools = await prisma.questionPool.findMany({
    include: {
      questions: {
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        include: {
          choices: true,
          questionCategory: { select: { id: true, name: true } },
        },
      },
      _count: { select: { courses: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    pools.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      courseCount: p._count.courses,
      questionCount: p.questions.length,
      questions: p.questions,
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
    return NextResponse.json(
      { error: "Havuz adı en az 2 karakter olmalı" },
      { status: 400 },
    );
  }

  const exists = await prisma.questionPool.findUnique({
    where: { name: parsed.data.name },
  });
  if (exists) {
    return NextResponse.json(
      { error: "Bu isimde bir soru havuzu zaten var" },
      { status: 409 },
    );
  }

  const pool = await prisma.questionPool.create({ data: parsed.data });
  return NextResponse.json(pool, { status: 201 });
}
