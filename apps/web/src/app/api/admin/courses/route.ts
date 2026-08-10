import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeStorageKeyPart, uploadFileObject } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const courses = await prisma.course.findMany({
    include: {
      video: true,
      questions: { include: { choices: true }, orderBy: { sortOrder: "asc" } },
      _count: { select: { assignments: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(courses);
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession([Role.ADMIN]);
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const form = await req.formData();
    const title = String(form.get("title") || "").trim();
    const description = String(form.get("description") || "").trim();
    const passPercent = Number(form.get("passPercent") || 80);
    const durationSec = Number(form.get("durationSec") || 0);
    const file = form.get("video");

    if (!title || !description || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Başlık, açıklama ve video zorunlu" },
        { status: 400 },
      );
    }
    if (!durationSec || durationSec < 1) {
      return NextResponse.json(
        { error: "Video süresi (saniye) gerekli" },
        { status: 400 },
      );
    }

    const originalName =
      file instanceof File && file.name ? file.name : "video.mp4";
    const safeName = sanitizeStorageKeyPart(originalName);
    const storageKey = `courses/${Date.now()}-${safeName}`;
    const contentType = file.type || "video/mp4";

    await uploadFileObject(storageKey, file, contentType);

    const course = await prisma.course.create({
      data: {
        title,
        description,
        passPercent,
        video: {
          create: {
            storageKey,
            fileName: originalName,
            contentType,
            durationSec,
            sizeBytes: file.size,
          },
        },
      },
      include: { video: true },
    });

    return NextResponse.json(course, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/courses failed:", err);
    const message =
      err instanceof Error ? err.message : "Eğitim oluşturulamadı";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
