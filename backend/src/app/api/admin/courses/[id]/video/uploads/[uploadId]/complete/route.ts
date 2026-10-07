import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  assembleVideoUpload,
  assertVideoUploadOwner,
  finishVideoUpload,
  readVideoUploadManifest,
  VideoUploadError,
} from "@/lib/chunked-video-upload";
import {
  CourseContentUploadError,
  publishCourseContent,
} from "@/lib/course-content-upload";
import { prisma } from "@/lib/prisma";
import { assertStorageQuotaAvailable, QuotaExceededError } from "@/lib/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof VideoUploadError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof CourseContentUploadError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  console.error("Parçalı video yüklemesi tamamlanamadı", error);
  return NextResponse.json({ error: "Video yüklemesi tamamlanamadı" }, { status: 500 });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; uploadId: string }> },
) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: courseId, uploadId } = await params;
  try {
    let manifest = await readVideoUploadManifest(uploadId);
    assertVideoUploadOwner(manifest, courseId, session.id);
    if (manifest.publishedAt) {
      return NextResponse.json({
        ok: true,
        size: manifest.totalBytes,
        processingStatus: manifest.processingStatus || "QUEUED",
      });
    }

    manifest = await assembleVideoUpload(manifest);
    const existing = await prisma.video.findUnique({
      where: { courseId },
      select: { id: true, storageKey: true, processingStatus: true },
    });
    let processingStatus = existing?.processingStatus;
    if (existing?.storageKey !== manifest.storageKey) {
      await assertStorageQuotaAvailable(manifest.totalBytes, existing?.id);
      const video = await publishCourseContent({
        actor: session,
        courseId,
        storageKey: manifest.storageKey,
        fileName: manifest.fileName,
        contentType: manifest.contentType,
        durationSec: manifest.durationSec,
        pageCount: null,
        sizeBytes: manifest.totalBytes,
      });
      processingStatus = video.processingStatus;
    }
    await finishVideoUpload(uploadId, processingStatus || "QUEUED");

    return NextResponse.json({
      ok: true,
      size: manifest.totalBytes,
      processingStatus: processingStatus || "QUEUED",
    });
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    return errorResponse(error);
  }
}
