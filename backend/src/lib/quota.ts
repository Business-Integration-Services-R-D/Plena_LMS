import { prisma } from "./prisma";

export const MAX_ACTIVE_USERS = 70;
export const MAX_STORAGE_BYTES = 30 * 1024 * 1024 * 1024;

export class QuotaExceededError extends Error {
  constructor(
    message: string,
    public readonly code: "USER_QUOTA_EXCEEDED" | "STORAGE_QUOTA_EXCEEDED",
  ) {
    super(message);
  }
}

export async function getQuotaUsage() {
  const [activeUsers, storage] = await Promise.all([
    prisma.user.count({
      where: { role: "USER", active: true, deletedAt: null },
    }),
    prisma.video.aggregate({ _sum: { sizeBytes: true } }),
  ]);

  // Müşteri kotası yalnızca kullanılmakta olan güncel içerikleri kapsar.
  // Sıkıştırma sırasında kısa süre tutulan kaynak/çıktı kopyaları platformun
  // operasyonel alanıdır ve müşterinin 30 GB hakkından düşülmez.
  const storageUsedBytes = storage._sum.sizeBytes ?? 0;
  return {
    activeUsers,
    maxUsers: MAX_ACTIVE_USERS,
    remainingUsers: Math.max(0, MAX_ACTIVE_USERS - activeUsers),
    storageUsedBytes,
    maxStorageBytes: MAX_STORAGE_BYTES,
    remainingStorageBytes: Math.max(0, MAX_STORAGE_BYTES - storageUsedBytes),
    userUsagePercent: Math.min(100, Math.round((activeUsers / MAX_ACTIVE_USERS) * 100)),
    storageUsagePercent: Math.min(
      100,
      Math.round((storageUsedBytes / MAX_STORAGE_BYTES) * 100),
    ),
  };
}

export async function assertUserQuotaAvailable() {
  const usage = await getQuotaUsage();
  if (usage.activeUsers >= MAX_ACTIVE_USERS) {
    throw new QuotaExceededError(
      `Aktif kullanıcı kotası dolu (${MAX_ACTIVE_USERS} kullanıcı)`,
      "USER_QUOTA_EXCEEDED",
    );
  }
  return usage;
}

export async function assertStorageQuotaAvailable(
  incomingBytes: number,
  replacingVideoId?: string,
) {
  const usage = await getQuotaUsage();
  let replacingBytes = 0;
  if (replacingVideoId) {
    const previous = await prisma.video.findUnique({
      where: { id: replacingVideoId },
      select: { sizeBytes: true },
    });
    replacingBytes = previous?.sizeBytes ?? 0;
  }
  const projectedBytes = usage.storageUsedBytes - replacingBytes + incomingBytes;
  if (projectedBytes > MAX_STORAGE_BYTES) {
    throw new QuotaExceededError(
      "Depolama kotası dolu; yeni içerik için yeterli alan kalmadı",
      "STORAGE_QUOTA_EXCEEDED",
    );
  }
  return { ...usage, projectedStorageBytes: projectedBytes };
}
