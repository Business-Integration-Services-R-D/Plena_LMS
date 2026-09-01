import { NextRequest, NextResponse } from "next/server";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const categories = await prisma.questionCategory.findMany({
    include: {
      questions: {
        where: { active: true },
        select: { pool: { select: { name: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      isDefault: category.name === "Genel",
      questionCount: category.questions.filter(
        (question) => !question.pool.name.startsWith("[Kurs] "),
      ).length,
    })),
  );
}

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional().default(""),
});

export async function POST(req: NextRequest) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Kategori adı 2-80 karakter arasında olmalı" },
      { status: 400 },
    );
  }

  try {
    const category = await prisma.questionCategory.create({ data: parsed.data });
    return NextResponse.json(
      { ...category, questionCount: 0 },
      { status: 201 },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Bu isimde bir soru kategorisi zaten var" },
        { status: 409 },
      );
    }
    throw error;
  }
}
