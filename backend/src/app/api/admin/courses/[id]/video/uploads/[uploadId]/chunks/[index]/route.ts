import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  assertVideoUploadOwner,
  readVideoUploadManifest,
  VideoUploadError,
  writeVideoUploadChunk,
} from "@/lib/chunked-video-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof VideoUploadError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Video parçası yüklenemedi", error);
  return NextResponse.json({ error: "Video parçası yüklenemedi" }, { status: 500 });
}

export async function PUT(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; uploadId: string; index: string }>;
  },
) {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: courseId, uploadId, index: rawIndex } = await params;
  try {
    const manifest = await readVideoUploadManifest(uploadId);
    assertVideoUploadOwner(manifest, courseId, session.id);
    const declared = req.headers.get("content-length");
    const result = await writeVideoUploadChunk(
      manifest,
      Number(rawIndex),
      req.body,
      declared == null ? undefined : Number(declared),
    );
    return NextResponse.json({ ok: true, size: result.size });
  } catch (error) {
    return errorResponse(error);
  }
}
