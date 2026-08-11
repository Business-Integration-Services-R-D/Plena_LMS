import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readObjectStream, statObject } from "@/lib/storage";
import { checkWindow } from "@/lib/enrollment";
import { parseRangeHeader } from "@/lib/range";

export const dynamic = "force-dynamic";

/**
 * Videoyu kimlik doğrulamalı olarak servis eder.
 *
 * Range destekli: oynatıcı kaldığı yerden devam ederken tüm dosyayı indirmek
 * zorunda kalmaz. Bu bir ileri sarma açığı yaratmaz; izleme ilerlemesi
 * sunucu tarafında /progress üzerinden maxReachedSec ile doğrulanır.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.USER, Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: courseId } = await params;

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: session.id, courseId } },
    include: { course: { include: { video: true } } },
  });
  if (!enrollment) {
    return NextResponse.json({ error: "Atama yok" }, { status: 403 });
  }

  const window = checkWindow(enrollment);
  if (!window.open) {
    return NextResponse.json({ error: window.reason }, { status: 403 });
  }

  const video = enrollment.course.video;
  if (!video) {
    return NextResponse.json({ error: "Video yok" }, { status: 404 });
  }

  const contentType = video.contentType || "video/mp4";

  try {
    const { size } = await statObject(video.storageKey);
    const parsed = parseRangeHeader(req.headers.get("range"), size);

    if (parsed.kind === "unsatisfiable") {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }

    const baseHeaders = {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=60",
    };

    if (parsed.kind === "ok") {
      const { start, end } = parsed.range;
      const stream = await readObjectStream(video.storageKey, parsed.range);

      return new NextResponse(stream, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Length": String(end - start + 1),
        },
      });
    }

    const stream = await readObjectStream(video.storageKey);
    return new NextResponse(stream, {
      headers: { ...baseHeaders, "Content-Length": String(size) },
    });
  } catch (err) {
    console.error("Video servis edilemedi:", video.storageKey, err);
    return NextResponse.json({ error: "Video okunamadı" }, { status: 500 });
  }
}
