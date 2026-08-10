import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readObject } from "@/lib/storage";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.CAPTAIN, Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: courseId } = await params;
  const assignment = await prisma.assignment.findUnique({
    where: { userId_courseId: { userId: session.id, courseId } },
  });
  if (!assignment && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Atama yok" }, { status: 403 });
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { video: true },
  });
  if (!course?.video) {
    return NextResponse.json({ error: "Video yok" }, { status: 404 });
  }

  try {
    const bytes = await readObject(course.video.storageKey);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": course.video.contentType || "video/mp4",
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, max-age=60",
        "Accept-Ranges": "bytes",
      },
    });
  } catch {
    return NextResponse.json({ error: "Video okunamadı" }, { status: 500 });
  }
}
