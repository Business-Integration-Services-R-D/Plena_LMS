import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  createVideoUpload,
  VideoUploadError,
} from "@/lib/chunked-video-upload";
import { prisma } from "@/lib/prisma";
import { assertStorageQuotaAvailable, QuotaExceededError } from "@/lib/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof VideoUploadError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  console.error("Parçalı video yüklemesi başlatılamadı", error);
  return NextResponse.json({ error: "Video yüklemesi başlatılamadı" }, { status: 500 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: courseId } = await params;
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true },
  });
  if (!course) return NextResponse.json({ error: "Eğitim bulunamadı" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.fileName !== "string" || body.fileName.length > 255) {
    return NextResponse.json({ error: "Video dosya adı gerekli" }, { status: 400 });
  }

  try {
    const existing = await prisma.video.findUnique({
      where: { courseId },
      select: { id: true },
    });
    await assertStorageQuotaAvailable(Number(body.fileSize), existing?.id);
    const upload = await createVideoUpload({
      courseId,
      ownerId: session.id,
      fileName: body.fileName,
      totalBytes: Number(body.fileSize),
      durationSec: Math.round(Number(body.durationSec)),
    });
    return NextResponse.json({
      uploadId: upload.id,
      chunkSize: upload.chunkSize,
      totalChunks: upload.totalChunks,
      maxBytes: 2_000_000_000,
    });
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    return errorResponse(error);
  }
}
