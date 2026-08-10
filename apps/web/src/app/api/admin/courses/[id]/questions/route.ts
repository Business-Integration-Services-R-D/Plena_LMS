import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  prompt: z.string().min(3),
  choices: z
    .array(
      z.object({
        text: z.string().min(1),
        isCorrect: z.boolean(),
      }),
    )
    .min(2),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: courseId } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !parsed.data.choices.some((c) => c.isCorrect)) {
    return NextResponse.json(
      { error: "En az 2 şık ve 1 doğru cevap gerekli" },
      { status: 400 },
    );
  }

  const count = await prisma.question.count({ where: { courseId } });
  const question = await prisma.question.create({
    data: {
      courseId,
      prompt: parsed.data.prompt,
      sortOrder: count,
      choices: { create: parsed.data.choices },
    },
    include: { choices: true },
  });
  return NextResponse.json(question, { status: 201 });
}
