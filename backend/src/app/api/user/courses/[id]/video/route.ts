import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readObjectStream, statObject } from "@/lib/storage";
import { checkWindow } from "@/lib/enrollment";
import { parseRangeHeader } from "@/lib/range";

export const dynamic = "force-dynamic";

/**
 * Ana eğitim içeriğini (MP4/PDF) kimlik doğrulamalı olarak servis eder.
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

  let video = enrollment?.course.video ?? null;

  if (enrollment) {
    if (!enrollment.course.active && session.role !== Role.ADMIN) {
      return NextResponse.json(
        { error: "Bu eğitim pasif durumda" },
        { status: 403 },
      );
    }
    const window = checkWindow(enrollment);
    if (!window.open) {
      return NextResponse.json({ error: window.reason }, { status: 403 });
    }
  } else if (session.role === Role.ADMIN) {
    // Admin önizlemesi: atama şartı aranmaz.
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: { video: true },
    });
    video = course?.video ?? null;
  } else {
    return NextResponse.json({ error: "Atama yok" }, { status: 403 });
  }

  if (!video) {
    return NextResponse.json({ error: "Eğitim içeriği yok" }, { status: 404 });
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
      "X-Content-Type-Options": "nosniff",
      ...(video.pageCount
        ? { "Content-Disposition": 'inline; filename="training.pdf"' }
        : {}),
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
    console.error("Eğitim içeriği servis edilemedi:", video.storageKey, err);
    return NextResponse.json({ error: "Eğitim içeriği okunamadı" }, { status: 500 });
  }
}
