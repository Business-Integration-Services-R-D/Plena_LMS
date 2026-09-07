import { NextRequest, NextResponse } from "next/server";
import { CheckpointOnFail, QuestionType, Role, WatchEventType } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkWindow } from "@/lib/enrollment";

export const dynamic = "force-dynamic";

const schema = z.object({
  checkpointId: z.string().min(1),
  choiceId: z.string().optional(),
  textAnswer: z.string().optional(),
  timedOut: z.boolean().default(false),
});

/**
 * Kontrol noktası cevabı. Doğruysa geçiş kaydedilir; yanlış/süre aşımında
 * ilerleme, politikaya göre başa veya önceki geçilen noktaya sarılır.
 * Serbest metin sorularda doğru cevap yoktur: boş olmayan cevap geçer,
 * metin denetim kaydında saklanır.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession([Role.USER, Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: courseId } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz veri" }, { status: 400 });
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: session.id, courseId } },
    include: { course: { include: { video: true } } },
  });
  if (!enrollment?.course.video) {
    return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
  }

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

  const checkpoint = await prisma.checkpoint.findUnique({
    where: { id: parsed.data.checkpointId },
    include: { question: { include: { choices: true } } },
  });
  if (!checkpoint || checkpoint.courseId !== courseId) {
    return NextResponse.json({ error: "Kontrol noktası bulunamadı" }, { status: 404 });
  }
  if (
    enrollment.course.video.pageCount &&
    enrollment.maxReachedSec < checkpoint.timeSec
  ) {
    return NextResponse.json(
      { error: "Bu kontrol noktasının bulunduğu sayfa henüz görüntülenmedi" },
      { status: 403 },
    );
  }

  const isFreeText = checkpoint.question.type === QuestionType.FREE_TEXT;
  const textAnswer = parsed.data.textAnswer?.trim() || null;
  const chosen = parsed.data.choiceId
    ? checkpoint.question.choices.find((c) => c.id === parsed.data.choiceId)
    : null;
  const passed =
    !parsed.data.timedOut &&
    (isFreeText ? Boolean(textAnswer) : Boolean(chosen?.isCorrect));

  if (passed) {
    await prisma.watchEvent.create({
      data: {
        enrollmentId: enrollment.id,
        userId: session.id,
        courseId,
        videoId: enrollment.course.video.id,
        eventType: WatchEventType.CHECKPOINT_PASSED,
        positionSec: checkpoint.timeSec,
        metadata: {
          checkpointId: checkpoint.id,
          ...(isFreeText ? { textAnswer } : {}),
        },
      },
    });
    return NextResponse.json({ passed: true, rewindTo: null });
  }

  const isRetryPolicy =
    checkpoint.onFail === CheckpointOnFail.RETRY ||
    checkpoint.onFail === CheckpointOnFail.RETRY_PREVIOUS;

  // Başarısız + deneme politikası: haklar bitene kadar video sarılmaz.
  if (isRetryPolicy) {
    // Deneme sayısı: son "haklar bitti" olayından bu yana yapılan hatalar.
    let failsSinceReset = 0;
    if (checkpoint.maxAttempts != null) {
      const failEvents = await prisma.watchEvent.findMany({
        where: {
          enrollmentId: enrollment.id,
          eventType: WatchEventType.CHECKPOINT_FAILED,
        },
        orderBy: { createdAt: "desc" },
        select: { metadata: true },
      });
      for (const ev of failEvents) {
        const meta = ev.metadata as { checkpointId?: string; exhausted?: boolean } | null;
        if (meta?.checkpointId !== checkpoint.id) continue;
        if (meta?.exhausted) break;
        failsSinceReset += 1;
      }
    }

    const exhausted =
      checkpoint.maxAttempts != null && failsSinceReset + 1 >= checkpoint.maxAttempts;

    if (!exhausted) {
      await prisma.watchEvent.create({
        data: {
          enrollmentId: enrollment.id,
          userId: session.id,
          courseId,
          videoId: enrollment.course.video.id,
          eventType: WatchEventType.CHECKPOINT_FAILED,
          positionSec: checkpoint.timeSec,
          metadata: {
            checkpointId: checkpoint.id,
            timedOut: parsed.data.timedOut,
            retry: true,
            ...(isFreeText ? { textAnswer } : {}),
          },
        },
      });
      const remaining =
        checkpoint.maxAttempts != null
          ? checkpoint.maxAttempts - failsSinceReset - 1
          : null;
      return NextResponse.json({ passed: false, retry: true, remaining, rewindTo: null });
    }
    // Haklar bitti: aşağıdaki akış seçilen hedefe sarar.
  }

  // Başarısız: video için saniye, PDF için sayfa hedefini hesapla.
  const isPdf = Boolean(enrollment.course.video.pageCount);
  let rewindTo = isPdf ? 1 : 0;
  if (
    checkpoint.onFail === CheckpointOnFail.PREVIOUS ||
    checkpoint.onFail === CheckpointOnFail.RETRY_PREVIOUS
  ) {
    const earlier = await prisma.checkpoint.findMany({
      where: { courseId, timeSec: { lt: checkpoint.timeSec } },
      orderBy: { timeSec: "desc" },
    });
    if (earlier.length > 0) {
      const passedEvents = await prisma.watchEvent.findMany({
        where: {
          enrollmentId: enrollment.id,
          eventType: WatchEventType.CHECKPOINT_PASSED,
        },
        select: { metadata: true },
      });
      const passedIds = new Set(
        passedEvents
          .map((e) => (e.metadata as { checkpointId?: string } | null)?.checkpointId)
          .filter(Boolean),
      );
      const prev = earlier.find((cp) => passedIds.has(cp.id));
      if (prev) rewindTo = prev.timeSec;
    }
  }

  const duration = enrollment.course.video.durationSec;
  // PDF başa dönerken ilk sayfanın yeniden görülmesi için erişilen sınır sıfırlanır.
  const progressRewind = isPdf && rewindTo === 1 ? 0 : rewindTo;
  const newMax = Math.min(enrollment.maxReachedSec, progressRewind);
  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      positionSec: rewindTo,
      maxReachedSec: newMax,
      watchedPercent: duration > 0 ? (newMax / duration) * 100 : 0,
      lastActivityAt: new Date(),
    },
  });

  await prisma.watchEvent.create({
    data: {
      enrollmentId: enrollment.id,
      userId: session.id,
      courseId,
      videoId: enrollment.course.video.id,
      eventType: WatchEventType.CHECKPOINT_FAILED,
      positionSec: checkpoint.timeSec,
      metadata: {
        checkpointId: checkpoint.id,
        timedOut: parsed.data.timedOut,
        rewindTo,
        ...(isFreeText ? { textAnswer } : {}),
        // Deneme politikasında hak bittiğinde sayaç sıfırlansın diye işaretlenir.
        ...(isRetryPolicy ? { exhausted: true } : {}),
      },
    },
  });

  return NextResponse.json({ passed: false, retry: false, rewindTo });
}
