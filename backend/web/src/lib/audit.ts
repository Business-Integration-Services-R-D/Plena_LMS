import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Genel sistem denetim kaydı.
 *
 * Video oynatıcı aktiviteleri buraya yazılmaz; onların yeri WatchEvent'tir.
 * Burası kullanıcı yönetimi, atama, içerik ve export gibi eylemler içindir.
 */
export type AuditActor = {
  id: string;
  email: string;
} | null;

export type AuditInput = {
  action: AuditAction;
  actor: AuditActor;
  /** Etkilenen kaydın türü, ör. "User", "Course". */
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Denetim kaydını yazar.
 *
 * Denetim yazımı asıl işlemi geri almaz: log yazılamazsa hata konsola
 * düşer ama kullanıcının işlemi başarısız olmaz.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        actorId: input.actor?.id ?? null,
        actorEmail: input.actor?.email ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadata: input.metadata,
      },
    });
  } catch (err) {
    console.error("Denetim kaydı yazılamadı:", input.action, err);
  }
}
