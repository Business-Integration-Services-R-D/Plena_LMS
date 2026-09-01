import { NextRequest, NextResponse } from "next/server";
import { QuestionType, Role } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const schema = z.object({
  prompt: z.string().min(3),
  categoryId: z.string().min(1).optional(),
  type: z.nativeEnum(QuestionType).default(QuestionType.MULTIPLE_CHOICE),
  /// Yalnızca PER_QUESTION puanlamasında kullanılır.
  points: z.number().int().min(1).max(100).default(1),
  choices: z
    .array(z.object({ text: z.string().min(1), isCorrect: z.boolean() }))
    .default([]),
});

/** Havuza soru ekleme (harici UI akışı; addQuestionAction'ın API karşılığı). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: poolId } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz soru verisi" }, { status: 400 });
  }

  // Serbest metin sorularının şıkkı ve doğru cevabı olmaz.
  if (parsed.data.type === QuestionType.MULTIPLE_CHOICE) {
    if (parsed.data.choices.length < 2) {
      return NextResponse.json(
        { error: "En az 2 seçenek girin" },
        { status: 400 },
      );
    }
    if (parsed.data.choices.filter((c) => c.isCorrect).length !== 1) {
      return NextResponse.json(
        { error: "Tam olarak 1 doğru cevap işaretleyin" },
        { status: 400 },
      );
    }
  }

  const pool = await prisma.questionPool.findUnique({ where: { id: poolId } });
  if (!pool) {
    return NextResponse.json({ error: "Soru havuzu bulunamadı" }, { status: 404 });
  }

  const category = parsed.data.categoryId
    ? await prisma.questionCategory.findUnique({
        where: { id: parsed.data.categoryId },
      })
    : await prisma.questionCategory.upsert({
        where: { name: "Genel" },
        update: {},
        create: {
          name: "Genel",
          description: "Belirli bir konu başlığına bağlı olmayan genel sorular.",
        },
      });
  if (!category) {
    return NextResponse.json({ error: "Soru kategorisi bulunamadı" }, { status: 404 });
  }

  const sortOrder = await prisma.question.count({ where: { poolId } });

  const question = await prisma.question.create({
    data: {
      poolId,
      categoryId: category.id,
      prompt: parsed.data.prompt.trim(),
      type: parsed.data.type,
      points: parsed.data.points,
      sortOrder,
      ...(parsed.data.type === QuestionType.MULTIPLE_CHOICE
        ? {
            choices: {
              create: parsed.data.choices.map((c) => ({
                text: c.text.trim(),
                isCorrect: c.isCorrect,
              })),
            },
          }
        : {}),
    },
    include: {
      choices: true,
      questionCategory: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(question, { status: 201 });
}
