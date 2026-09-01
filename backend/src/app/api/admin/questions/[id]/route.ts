import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const schema = z.object({
  active: z.boolean().optional(),
  prompt: z.string().min(3).optional(),
  points: z.number().int().min(1).max(100).optional(),
  categoryId: z.string().min(1).optional(),
});

/**
 * Soru güncelleme / pasifleştirme. Sorular denetim geçmişi (QuizAnswer)
 * korunması için silinmez, active:false yapılır.
 */
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

  const question = await prisma.question.findUnique({ where: { id } });
  if (!question) {
    return NextResponse.json({ error: "Soru bulunamadı" }, { status: 404 });
  }

  if (parsed.data.categoryId) {
    const category = await prisma.questionCategory.findUnique({
      where: { id: parsed.data.categoryId },
    });
    if (!category) {
      return NextResponse.json(
        { error: "Soru kategorisi bulunamadı" },
        { status: 404 },
      );
    }
  }

  const updated = await prisma.question.update({
    where: { id },
    data: parsed.data,
    include: {
      choices: true,
      questionCategory: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(updated);
}
