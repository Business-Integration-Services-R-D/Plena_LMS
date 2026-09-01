import { NextRequest, NextResponse } from "next/server";
import { QuestionType, Role } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const questionSchema = z.object({
  prompt: z.string().trim().min(3),
  categoryId: z.string().min(1).optional(),
  type: z.nativeEnum(QuestionType).default(QuestionType.MULTIPLE_CHOICE),
  points: z.number().int().min(1).max(100).default(1),
  choices: z
    .array(z.object({ text: z.string().trim().min(1), isCorrect: z.boolean() }))
    .default([]),
});

const schema = z.object({
  questions: z.array(questionSchema).min(1).max(50),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: poolId } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "1-50 arasında geçerli soru gönderin" },
      { status: 400 },
    );
  }

  for (const [index, question] of parsed.data.questions.entries()) {
    if (question.type === QuestionType.MULTIPLE_CHOICE) {
      if (question.choices.length < 2) {
        return NextResponse.json(
          { error: `${index + 1}. soru için en az 2 seçenek girin` },
          { status: 400 },
        );
      }
      if (question.choices.filter((choice) => choice.isCorrect).length !== 1) {
        return NextResponse.json(
          { error: `${index + 1}. soru için tam olarak 1 doğru cevap işaretleyin` },
          { status: 400 },
        );
      }
    }
  }

  const pool = await prisma.questionPool.findUnique({ where: { id: poolId } });
  if (!pool) {
    return NextResponse.json({ error: "Soru havuzu bulunamadı" }, { status: 404 });
  }

  const general = parsed.data.questions.some((question) => !question.categoryId)
    ? await prisma.questionCategory.upsert({
        where: { name: "Genel" },
        update: {},
        create: {
          name: "Genel",
          description: "Belirli bir konu başlığına bağlı olmayan genel sorular.",
        },
      })
    : null;

  const requestedCategoryIds = [
    ...new Set(
      parsed.data.questions
        .map((question) => question.categoryId)
        .filter((categoryId): categoryId is string => Boolean(categoryId)),
    ),
  ];
  const existingCategories = await prisma.questionCategory.findMany({
    where: { id: { in: requestedCategoryIds } },
    select: { id: true },
  });
  if (existingCategories.length !== requestedCategoryIds.length) {
    return NextResponse.json(
      { error: "Sorulardan biri için seçilen kategori bulunamadı" },
      { status: 404 },
    );
  }

  const sortOrderStart = await prisma.question.count({ where: { poolId } });
  const created = await prisma.$transaction(
    parsed.data.questions.map((question, index) =>
      prisma.question.create({
        data: {
          poolId,
          categoryId: question.categoryId || general!.id,
          prompt: question.prompt,
          type: question.type,
          points: question.points,
          sortOrder: sortOrderStart + index,
          ...(question.type === QuestionType.MULTIPLE_CHOICE
            ? {
                choices: {
                  create: question.choices.map((choice) => ({
                    text: choice.text,
                    isCorrect: choice.isCorrect,
                  })),
                },
              }
            : {}),
        },
        include: {
          choices: true,
          questionCategory: { select: { id: true, name: true } },
        },
      }),
    ),
  );

  return NextResponse.json(created, { status: 201 });
}
