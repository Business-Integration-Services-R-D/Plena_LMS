"use server";

import { revalidatePath } from "next/cache";
import { AuditAction, RetakePolicy, Role } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { sanitizeStorageKeyPart, uploadFileObject } from "@/lib/storage";

function parseRetakePolicy(value: FormDataEntryValue | null): RetakePolicy {
  return value === RetakePolicy.VIDEO_AND_TEST
    ? RetakePolicy.VIDEO_AND_TEST
    : RetakePolicy.TEST_ONLY;
}

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
    const maxAttempts = Number(formData.get("maxAttempts") || 0);
    const durationSec = Number(formData.get("durationSec") || 0);
    const questionPoolId = String(formData.get("questionPoolId") || "").trim();
    const questionCount = Number(formData.get("questionCount") || 0);
    const categoryId = String(formData.get("categoryId") || "").trim();
    const durationMinutes = Number(formData.get("durationMinutes") || 0);
    const retakePolicy = parseRetakePolicy(formData.get("retakePolicy"));
    const file = formData.get("video");

    if (!title || !description || !(file instanceof Blob) || file.size < 1) {
      return { ok: false, error: "Başlık, açıklama ve video zorunlu" };
    }
    if (!durationSec || durationSec < 1) {
      return { ok: false, error: "Video süresi gerekli" };
    }
    if (!Number.isFinite(passPercent) || passPercent < 0 || passPercent > 100) {
      return { ok: false, error: "Geçme barajı 0-100 arasında olmalı" };
    }
    if (file.size > 1024 * 1024 * 1024) {
      return {
        ok: false,
        error: "Video çok büyük (max 1GB). Daha kısa bir dosya deneyin.",
      };
    }

    const originalName =
      file instanceof File && file.name ? file.name : "video.mp4";
    const safeName = sanitizeStorageKeyPart(originalName);
    const storageKey = `courses/${Date.now()}-${safeName}`;
    const contentType = file.type || "video/mp4";

    await uploadFileObject(storageKey, file, contentType);

    const safeMaxAttempts = Number.isFinite(maxAttempts) ? maxAttempts : 0;
    const safeQuestionCount = Number.isFinite(questionCount) ? questionCount : 0;

    const course = await prisma.course.create({
      data: {
        title,
        description,
        categoryId: categoryId || null,
        // Sınav ayarlarının kaynağı Exam'dir; Course üzerindeki eski alanlar
        // geriye dönük uyumluluk için aynı değerlerle yazılır.
        passPercent,
        maxAttempts: safeMaxAttempts,
        questionPoolId: questionPoolId || null,
        questionCount: safeQuestionCount,
        video: {
          create: {
            storageKey,
            fileName: originalName,
            contentType,
            durationSec,
            sizeBytes: file.size,
          },
        },
        exam: {
          create: {
            passPercent,
            maxAttempts: safeMaxAttempts,
            questionPoolId: questionPoolId || null,
            questionCount: safeQuestionCount,
            durationMinutes: durationMinutes > 0 ? durationMinutes : null,
            retakePolicy,
          },
        },
      },
    });

    await recordAudit({
      action: AuditAction.ADMIN_CREATED_COURSE,
      actor: session,
      entityType: "Course",
      entityId: course.id,
      metadata: { title, storageKey, passPercent, retakePolicy },
    });

    revalidatePath("/admin/courses");
    return { ok: true, id: course.id };
  } catch (err) {
    console.error("createCourseAction failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Eğitim oluşturulamadı",
    };
  }
}

export type SimpleResult = { ok: true } | { ok: false; error: string };

export async function createPoolAction(input: {
  name: string;
  description: string;
}): Promise<SimpleResult> {
  try {
    const session = await requireSession([Role.ADMIN]);
    if (!session) return { ok: false, error: "Oturum gerekli" };

    const name = input.name.trim();
    if (name.length < 2) return { ok: false, error: "Havuz adı çok kısa" };

    const exists = await prisma.questionPool.findUnique({ where: { name } });
    if (exists) return { ok: false, error: "Bu isimde bir havuz zaten var" };

    const pool = await prisma.questionPool.create({
      data: { name, description: input.description.trim() },
    });

    await recordAudit({
      action: AuditAction.ADMIN_CREATED_QUESTION_POOL,
      actor: session,
      entityType: "QuestionPool",
      entityId: pool.id,
      metadata: { name },
    });

    revalidatePath("/admin/courses");
    return { ok: true };
  } catch (err) {
    console.error("createPoolAction failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Havuz oluşturulamadı",
    };
  }
}

export async function addQuestionAction(input: {
  poolId: string;
  categoryId?: string;
  prompt: string;
  choices: { text: string; isCorrect: boolean }[];
}): Promise<SimpleResult> {
  try {
    const session = await requireSession([Role.ADMIN]);
    if (!session) return { ok: false, error: "Oturum gerekli" };

    const prompt = input.prompt.trim();
    const choices = input.choices.filter((c) => c.text.trim().length > 0);

    if (!input.poolId) return { ok: false, error: "Soru havuzu seçin" };
    if (prompt.length < 3) return { ok: false, error: "Soru metni çok kısa" };
    if (choices.length < 2) return { ok: false, error: "En az 2 şık gerekli" };
    if (choices.filter((c) => c.isCorrect).length !== 1) {
      return { ok: false, error: "Tam olarak 1 doğru cevap işaretleyin" };
    }

    const [pool, category] = await Promise.all([
      prisma.questionPool.findUnique({ where: { id: input.poolId } }),
      input.categoryId
        ? prisma.questionCategory.findUnique({ where: { id: input.categoryId } })
        : prisma.questionCategory.upsert({
            where: { name: "Genel" },
            update: {},
            create: {
              name: "Genel",
              description: "Belirli bir konu başlığına bağlı olmayan genel sorular.",
            },
          }),
    ]);
    if (!pool) return { ok: false, error: "Soru havuzu bulunamadı" };
    if (!category) return { ok: false, error: "Soru kategorisi bulunamadı" };

    const sortOrder = await prisma.question.count({
      where: { poolId: input.poolId },
    });

    await prisma.question.create({
      data: {
        poolId: input.poolId,
        categoryId: category.id,
        prompt,
        sortOrder,
        choices: {
          create: choices.map((c) => ({
            text: c.text.trim(),
            isCorrect: c.isCorrect,
          })),
        },
      },
    });

    revalidatePath("/admin/courses");
    return { ok: true };
  } catch (err) {
    console.error("addQuestionAction failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Soru eklenemedi",
    };
  }
}
