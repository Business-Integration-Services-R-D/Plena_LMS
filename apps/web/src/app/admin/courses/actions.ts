"use server";

import { Role } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeStorageKeyPart, uploadFileObject } from "@/lib/storage";

export type CreateCourseResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createCourseAction(
  formData: FormData,
): Promise<CreateCourseResult> {
  try {
    const session = await requireSession([Role.ADMIN]);
    if (!session) return { ok: false, error: "Oturum gerekli" };

    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const passPercent = Number(formData.get("passPercent") || 80);
    const durationSec = Number(formData.get("durationSec") || 0);
    const file = formData.get("video");

    if (!title || !description || !(file instanceof Blob) || file.size < 1) {
      return { ok: false, error: "Başlık, açıklama ve video zorunlu" };
    }
    if (!durationSec || durationSec < 1) {
      return { ok: false, error: "Video süresi gerekli" };
    }

    // ~450MB soft guard for PoC local uploads
    if (file.size > 450 * 1024 * 1024) {
      return {
        ok: false,
        error: "Video çok büyük (max ~450MB). Daha kısa bir dosya deneyin.",
      };
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
    });

    return { ok: true, id: course.id };
  } catch (err) {
    console.error("createCourseAction failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Eğitim oluşturulamadı",
    };
  }
}

export type AddQuestionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function addQuestionAction(input: {
  courseId: string;
  prompt: string;
  choices: { text: string; isCorrect: boolean }[];
}): Promise<AddQuestionResult> {
  try {
    const session = await requireSession([Role.ADMIN]);
    if (!session) return { ok: false, error: "Oturum gerekli" };

    const prompt = input.prompt.trim();
    const choices = input.choices.filter((c) => c.text.trim().length > 0);

    if (!input.courseId) return { ok: false, error: "Eğitim seçin" };
    if (prompt.length < 3) return { ok: false, error: "Soru metni çok kısa" };
    if (choices.length < 2) {
      return { ok: false, error: "En az 2 şık gerekli" };
    }
    if (!choices.some((c) => c.isCorrect)) {
      return { ok: false, error: "En az 1 doğru cevap işaretleyin (şık|1)" };
    }

    const course = await prisma.course.findUnique({
      where: { id: input.courseId },
    });
    if (!course) return { ok: false, error: "Eğitim bulunamadı" };

    const count = await prisma.question.count({
      where: { courseId: input.courseId },
    });

    await prisma.question.create({
      data: {
        courseId: input.courseId,
        prompt,
        sortOrder: count,
        choices: {
          create: choices.map((c) => ({
            text: c.text.trim(),
            isCorrect: c.isCorrect,
          })),
        },
      },
    });

    return { ok: true };
  } catch (err) {
    console.error("addQuestionAction failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Soru eklenemedi",
    };
  }
}
