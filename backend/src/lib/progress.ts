/**
 * Video ilerleme hesabı. Saf fonksiyon: DB'ye dokunmaz, böylece anti-skip
 * kuralları izole şekilde test edilebilir.
 */

/** İki heartbeat arası kabul edilen en büyük ilerleme (saniye). */
export const MAX_FORWARD_JUMP_SEC = 8;

/** Bu yüzdeye ulaşan video tamamlanmış sayılır. */
const COMPLETE_PERCENT = 99.5;

/**
 * durationSec tam sayıya yuvarlandığı için gerçek video biraz daha kısa
 * olabilir; son bu kadar saniyelik farkı tamamlanmış sayarız.
 */
const COMPLETE_TOLERANCE_SEC = 1;

export type ProgressState = {
  positionSec: number;
  maxReachedSec: number;
  totalWatchedSec: number;
  videoCompleted: boolean;
};

export type ProgressResult = ProgressState & {
  watchedPercent: number;
  /** Bildirilen konum kırpılmadan kabul edildi mi? false ise ileri sarma engellendi. */
  accepted: boolean;
};

/**
 * PDF sayfa ilerlemesi. Yalnızca sıradaki sayfa kabul edilir; böylece istemci
 * doğrudan son sayfayı bildirerek eğitimi tamamlayamaz.
 */
export function computePageProgress(
  current: ProgressState,
  reportedPage: number,
  pageCount: number,
): ProgressResult {
  const totalPages = Math.max(1, Math.floor(pageCount));
  const reported = Math.max(1, Math.floor(reportedPage));
  const nextAllowed = Math.max(1, Math.floor(current.maxReachedSec) + 1);
  const accepted = reported <= nextAllowed;
  const positionSec = Math.min(totalPages, accepted ? reported : nextAllowed);
  const maxReachedSec = Math.min(
    totalPages,
    Math.max(current.maxReachedSec, positionSec),
  );
  const watchedPercent = (maxReachedSec / totalPages) * 100;

  return {
    positionSec,
    maxReachedSec,
    watchedPercent,
    totalWatchedSec: current.totalWatchedSec,
    videoCompleted: current.videoCompleted || maxReachedSec >= totalPages,
    accepted,
  };
}

/**
 * Oynatıcıdan gelen konumu mevcut duruma göre değerlendirir.
 *
 * Geriye sarma serbesttir (kullanıcı izlediği yeri tekrar izleyebilir), ancak
 * ileriye doğru tek seferde MAX_FORWARD_JUMP_SEC'ten fazla atlanamaz. Bu
 * sayede istemci ne gönderirse göndersin izlenmemiş bölge atlanamaz.
 */
export function computeProgress(
  current: ProgressState,
  reportedPositionSec: number,
  videoDurationSec: number,
): ProgressResult {
  const durationSec = Math.max(videoDurationSec, 1);
  const reported = Math.max(0, reportedPositionSec);

  const positionSec = Math.min(
    reported,
    current.maxReachedSec + MAX_FORWARD_JUMP_SEC,
  );
  const maxReachedSec = Math.min(
    durationSec,
    Math.max(current.maxReachedSec, positionSec),
  );
  const watchedPercent = Math.min(100, (maxReachedSec / durationSec) * 100);

  const gained = Math.max(0, maxReachedSec - current.maxReachedSec);

  return {
    positionSec,
    maxReachedSec,
    watchedPercent,
    totalWatchedSec: current.totalWatchedSec + Math.round(gained),
    videoCompleted:
      current.videoCompleted ||
      watchedPercent >= COMPLETE_PERCENT ||
      durationSec - maxReachedSec <= COMPLETE_TOLERANCE_SEC,
    accepted: positionSec >= reported - 0.01,
  };
}
