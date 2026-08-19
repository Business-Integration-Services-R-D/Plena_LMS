import { describe, expect, it } from "vitest";
import {
  MAX_FORWARD_JUMP_SEC,
  computePageProgress,
  computeProgress,
  type ProgressState,
} from "./progress";

const DURATION = 600;

function state(overrides: Partial<ProgressState> = {}): ProgressState {
  return {
    positionSec: 0,
    maxReachedSec: 0,
    totalWatchedSec: 0,
    videoCompleted: false,
    ...overrides,
  };
}

describe("computeProgress — ileri sarma engeli", () => {
  it("normal heartbeat ilerlemesini olduğu gibi kabul eder", () => {
    const result = computeProgress(state({ maxReachedSec: 100 }), 102, DURATION);

    expect(result.positionSec).toBe(102);
    expect(result.maxReachedSec).toBe(100 + 2);
    expect(result.accepted).toBe(true);
  });

  it("izlenmemiş bölgeye atlamayı kırpar ve accepted=false döner", () => {
    const result = computeProgress(state({ maxReachedSec: 100 }), 500, DURATION);

    expect(result.positionSec).toBe(100 + MAX_FORWARD_JUMP_SEC);
    expect(result.maxReachedSec).toBe(100 + MAX_FORWARD_JUMP_SEC);
    expect(result.accepted).toBe(false);
  });

  it("videonun sonuna atlayarak tamamlandı işaretlenemez", () => {
    const result = computeProgress(state({ maxReachedSec: 5 }), DURATION, DURATION);

    expect(result.videoCompleted).toBe(false);
    expect(result.watchedPercent).toBeLessThan(5);
  });

  it("tek atlamayla sınıra dayanmak izleme süresini şişirmez", () => {
    const result = computeProgress(state({ maxReachedSec: 100 }), 9999, DURATION);

    expect(result.totalWatchedSec).toBe(MAX_FORWARD_JUMP_SEC);
  });
});

describe("computeProgress — geri sarma ve devam etme", () => {
  it("izlenmiş bölgeye geri dönmeye izin verir", () => {
    const result = computeProgress(state({ maxReachedSec: 300 }), 120, DURATION);

    expect(result.positionSec).toBe(120);
    expect(result.accepted).toBe(true);
  });

  it("geri sarma en uzak noktayı ve izlenen süreyi geriletmez", () => {
    const result = computeProgress(
      state({ maxReachedSec: 300, totalWatchedSec: 300 }),
      120,
      DURATION,
    );

    expect(result.maxReachedSec).toBe(300);
    expect(result.totalWatchedSec).toBe(300);
  });

  it("aynı bölgeyi tekrar izlemek toplam süreyi iki kez saymaz", () => {
    const rewound = computeProgress(
      state({ maxReachedSec: 300, totalWatchedSec: 300 }),
      120,
      DURATION,
    );
    const rewatched = computeProgress(rewound, 130, DURATION);

    expect(rewatched.totalWatchedSec).toBe(300);
  });
});

describe("computeProgress — tamamlanma", () => {
  it("videonun sonuna izleyerek gelindiğinde tamamlanır", () => {
    const result = computeProgress(
      state({ maxReachedSec: DURATION - 2 }),
      DURATION - 0.5,
      DURATION,
    );

    expect(result.videoCompleted).toBe(true);
    expect(result.watchedPercent).toBeGreaterThan(99);
  });

  it("bir kez tamamlanan video geri sarınca tamamlanmamışa dönmez", () => {
    const result = computeProgress(
      state({ maxReachedSec: DURATION, videoCompleted: true }),
      10,
      DURATION,
    );

    expect(result.videoCompleted).toBe(true);
  });

  it("en uzak nokta video süresini aşamaz", () => {
    const result = computeProgress(
      state({ maxReachedSec: DURATION }),
      DURATION + 30,
      DURATION,
    );

    expect(result.maxReachedSec).toBe(DURATION);
    expect(result.watchedPercent).toBe(100);
  });

  it("süresi bilinmeyen videoda sıfıra bölme yapmaz", () => {
    const result = computeProgress(state(), 0, 0);

    expect(Number.isFinite(result.watchedPercent)).toBe(true);
  });
});

describe("computePageProgress — PDF sayfa sırası", () => {
  it("sıradaki sayfayı kabul eder", () => {
    const result = computePageProgress(state({ maxReachedSec: 3 }), 4, 10);
    expect(result.accepted).toBe(true);
    expect(result.maxReachedSec).toBe(4);
    expect(result.watchedPercent).toBe(40);
  });

  it("sayfa atlamayı engeller", () => {
    const result = computePageProgress(state({ maxReachedSec: 3 }), 9, 10);
    expect(result.accepted).toBe(false);
    expect(result.maxReachedSec).toBe(4);
    expect(result.videoCompleted).toBe(false);
  });

  it("yalnızca son sayfaya sırayla gelince tamamlar", () => {
    const result = computePageProgress(state({ maxReachedSec: 9 }), 10, 10);
    expect(result.accepted).toBe(true);
    expect(result.videoCompleted).toBe(true);
    expect(result.watchedPercent).toBe(100);
  });
});
