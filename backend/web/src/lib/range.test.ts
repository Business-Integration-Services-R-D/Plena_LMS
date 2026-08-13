import { describe, expect, it } from "vitest";
import { parseRangeHeader } from "./range";

const SIZE = 1000;

describe("parseRangeHeader", () => {
  it("başlık yoksa tüm dosya istenmiş sayılır", () => {
    expect(parseRangeHeader(null, SIZE).kind).toBe("none");
    expect(parseRangeHeader(undefined, SIZE).kind).toBe("none");
  });

  it("kapalı aralığı çözer", () => {
    const result = parseRangeHeader("bytes=0-499", SIZE);

    expect(result).toEqual({ kind: "ok", range: { start: 0, end: 499 } });
  });

  it("açık uçlu aralığı dosya sonuna kadar getirir", () => {
    const result = parseRangeHeader("bytes=500-", SIZE);

    expect(result).toEqual({ kind: "ok", range: { start: 500, end: 999 } });
  });

  it("sondan N byte isteğini çözer", () => {
    const result = parseRangeHeader("bytes=-200", SIZE);

    expect(result).toEqual({ kind: "ok", range: { start: 800, end: 999 } });
  });

  it("dosyadan uzun suffix isteğini dosya başına kırpar", () => {
    const result = parseRangeHeader("bytes=-5000", SIZE);

    expect(result).toEqual({ kind: "ok", range: { start: 0, end: 999 } });
  });

  it("dosya sonunu aşan bitişi kırpar", () => {
    const result = parseRangeHeader("bytes=900-5000", SIZE);

    expect(result).toEqual({ kind: "ok", range: { start: 900, end: 999 } });
  });

  it("dosya boyutunu aşan başlangıcı reddeder", () => {
    expect(parseRangeHeader("bytes=1000-", SIZE).kind).toBe("unsatisfiable");
  });

  it("ters aralığı reddeder", () => {
    expect(parseRangeHeader("bytes=500-100", SIZE).kind).toBe("unsatisfiable");
  });

  it("boş dosyada aralık isteğini reddeder", () => {
    expect(parseRangeHeader("bytes=0-10", 0).kind).toBe("unsatisfiable");
  });

  it("desteklenmeyen biçimleri tüm dosya olarak ele alır", () => {
    expect(parseRangeHeader("bytes=0-100, 200-300", SIZE).kind).toBe("none");
    expect(parseRangeHeader("items=0-100", SIZE).kind).toBe("none");
    expect(parseRangeHeader("bytes=-", SIZE).kind).toBe("none");
  });

  it("tek byte isteğini çözer", () => {
    const result = parseRangeHeader("bytes=0-0", SIZE);

    expect(result).toEqual({ kind: "ok", range: { start: 0, end: 0 } });
  });
});
