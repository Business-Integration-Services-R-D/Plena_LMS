/**
 * HTTP Range başlığı ayrıştırma. Saf fonksiyon.
 *
 * Video oynatıcılar kaldığı yerden devam ederken tüm dosyayı indirmek yerine
 * byte aralığı ister; bu yüzden 206 Partial Content desteği gerekir.
 */

export type ByteRange = {
  /** Dahil. */
  start: number;
  /** Dahil. */
  end: number;
};

export type RangeParseResult =
  | { kind: "none" }
  | { kind: "ok"; range: ByteRange }
  | { kind: "unsatisfiable" };

/**
 * Tek aralıklı `bytes=` isteklerini çözer.
 *
 * Desteklenenler: `bytes=0-499`, `bytes=500-` ve son N byte için `bytes=-500`.
 * Çoklu aralık istekleri tam dosya ile yanıtlanır (kind: "none").
 */
export function parseRangeHeader(
  header: string | null | undefined,
  size: number,
): RangeParseResult {
  if (!header) return { kind: "none" };

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return { kind: "none" };

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return { kind: "none" };

  if (size <= 0) return { kind: "unsatisfiable" };

  let start: number;
  let end: number;

  if (rawStart === "") {
    // Sondan N byte.
    const suffixLength = Number(rawEnd);
    if (suffixLength <= 0) return { kind: "unsatisfiable" };
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
  }

  if (start >= size) return { kind: "unsatisfiable" };

  // Dosya sonunu aşan istek dosya sonuna kırpılır.
  end = Math.min(end, size - 1);
  if (end < start) return { kind: "unsatisfiable" };

  return { kind: "ok", range: { start, end } };
}
