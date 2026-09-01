import { NextRequest, NextResponse } from "next/server";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(300).optional(),
  })
  .refine((data) => data.name !== undefined || data.description !== undefined);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz kategori verisi" }, { status: 400 });
  }

  const category = await prisma.questionCategory.findUnique({ where: { id } });
  if (!category) {
    return NextResponse.json({ error: "Soru kategorisi bulunamadı" }, { status: 404 });
  }
  if (category.name === "Genel" && parsed.data.name && parsed.data.name !== "Genel") {
    return NextResponse.json(
      { error: "Genel kategorisinin adı değiştirilemez" },
      { status: 400 },
    );
  }

  try {
    const updated = await prisma.questionCategory.update({
      where: { id },
      data: parsed.data,
    });
    return NextResponse.json(updated);
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

const deleteModeSchema = z.enum(["move_to_general", "delete_questions"]);

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const mode = deleteModeSchema.safeParse(req.nextUrl.searchParams.get("mode"));
  if (!mode.success) {
    return NextResponse.json({ error: "Silme yöntemi seçilmedi" }, { status: 400 });
  }

  const category = await prisma.questionCategory.findUnique({ where: { id } });
  if (!category) {
    return NextResponse.json({ error: "Soru kategorisi bulunamadı" }, { status: 404 });
  }
  if (category.name === "Genel") {
    return NextResponse.json({ error: "Genel kategorisi silinemez" }, { status: 400 });
  }

  if (mode.data === "move_to_general") {
    const general = await prisma.questionCategory.upsert({
      where: { name: "Genel" },
      update: {},
      create: {
        name: "Genel",
        description: "Belirli bir konu başlığına bağlı olmayan genel sorular.",
      },
    });
    const [, deleted] = await prisma.$transaction([
      prisma.question.updateMany({
        where: { categoryId: category.id },
        data: { categoryId: general.id },
      }),
      prisma.questionCategory.delete({ where: { id: category.id } }),
    ]);
    return NextResponse.json({ deletedCategoryId: deleted.id, mode: mode.data });
  }

  const [, deleted] = await prisma.$transaction([
    prisma.question.deleteMany({ where: { categoryId: category.id } }),
    prisma.questionCategory.delete({ where: { id: category.id } }),
  ]);
  return NextResponse.json({ deletedCategoryId: deleted.id, mode: mode.data });
}
