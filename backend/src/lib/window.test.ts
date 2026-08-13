import { describe, expect, it } from "vitest";
import { checkWindow } from "./window";

const NOW = new Date("2026-06-15T12:00:00Z");
const YESTERDAY = new Date("2026-06-14T12:00:00Z");
const TOMORROW = new Date("2026-06-16T12:00:00Z");

describe("checkWindow", () => {
  it("başlangıç tarihi gelmemiş eğitimi kapalı tutar", () => {
    const result = checkWindow(
      { startsAt: TOMORROW, dueAt: null, passed: false },
      NOW,
    );

    expect(result.open).toBe(false);
  });

  it("başlangıç tarihi gelmiş ve son tarihi olmayan eğitimi açar", () => {
    const result = checkWindow(
      { startsAt: YESTERDAY, dueAt: null, passed: false },
      NOW,
    );

    expect(result.open).toBe(true);
  });

  it("son tarihi gelecekte olan eğitimi açık tutar", () => {
    const result = checkWindow(
      { startsAt: YESTERDAY, dueAt: TOMORROW, passed: false },
      NOW,
    );

    expect(result.open).toBe(true);
  });

  it("süresi geçmiş ve tamamlanmamış eğitimi kapatır", () => {
    const result = checkWindow(
      { startsAt: new Date("2026-06-01T00:00:00Z"), dueAt: YESTERDAY, passed: false },
      NOW,
    );

    expect(result.open).toBe(false);
    if (!result.open) expect(result.reason).toContain("Son tamamlama tarihi");
  });

  it("süresi geçmiş olsa da başarıyla tamamlayan kullanıcıya erişim bırakır", () => {
    const result = checkWindow(
      { startsAt: new Date("2026-06-01T00:00:00Z"), dueAt: YESTERDAY, passed: true },
      NOW,
    );

    expect(result.open).toBe(true);
  });
});
