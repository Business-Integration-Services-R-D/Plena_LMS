import { NextRequest, NextResponse } from "next/server";
import { AuditAction, Role } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { sanitizeStorageKeyPart, uploadFileObject } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Kursa video yükleme / değiştirme (multipart: file + duration). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: courseId } = await params;
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return NextResponse.json({ error: "Eğitim bulunamadı" }, { status: 404 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  const durationSec = Math.round(Number(formData?.get("duration") || 0));

  if (!(file instanceof Blob) || file.size < 1) {
    return NextResponse.json({ error: "Video dosyası gerekli" }, { status: 400 });
  }
  if (file.size > 450 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Video çok büyük (max ~450MB)" },
      { status: 413 },
    );
  }
  if (!durationSec || durationSec < 1) {
    return NextResponse.json({ error: "Video süresi gerekli" }, { status: 400 });
  }

  const originalName = file instanceof File && file.name ? file.name : "video.mp4";
  const safeName = sanitizeStorageKeyPart(originalName);
  const storageKey = `courses/${Date.now()}-${safeName}`;
  const contentType = file.type || "video/mp4";

  await uploadFileObject(storageKey, file, contentType);

  await prisma.video.upsert({
    where: { courseId },
    update: {
      storageKey,
      fileName: originalName,
      contentType,
      durationSec,
      sizeBytes: file.size,
    },
    create: {
      courseId,
      storageKey,
      fileName: originalName,
      contentType,
      durationSec,
      sizeBytes: file.size,
    },
  });

  await recordAudit({
    action: AuditAction.ADMIN_UPDATED_COURSE,
    actor: session,
    entityType: "Course",
    entityId: courseId,
    metadata: { videoUploaded: true, storageKey, sizeBytes: file.size },
  });

  return NextResponse.json({ ok: true, size: file.size });
}
