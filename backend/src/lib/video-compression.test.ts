import { describe, expect, it } from "vitest";
import {
  compressionConfig,
  durationMatches,
  ffmpegArgs,
  retryDelayMs,
  shouldUseCompressedOutput,
} from "./video-compression";

describe("video compression", () => {
  it("uses the balanced production defaults", () => {
    const config = compressionConfig({});
    expect(config).toMatchObject({
      crf: 25,
      preset: "medium",
      maxWidth: 1280,
      maxHeight: 720,
      threads: 1,
    });
  });

  it("builds an H.264 command that never upscales", () => {
    const args = ffmpegArgs("in.mp4", "out.mp4", compressionConfig({}));
    expect(args).toContain("libx264");
    expect(args).toContain("scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2");
    expect(args.at(-1)).toBe("out.mp4");
  });

  it("requires a meaningful size saving", () => {
    expect(shouldUseCompressedOutput(1000, 949)).toBe(true);
    expect(shouldUseCompressedOutput(1000, 951)).toBe(false);
    expect(shouldUseCompressedOutput(1000, 1000)).toBe(false);
  });

  it("accepts small duration drift and rejects damaged output", () => {
    const source = { durationSec: 100, width: 1920, height: 1080, codec: "h264" };
    expect(durationMatches(source, { ...source, durationSec: 101.9 })).toBe(true);
    expect(durationMatches(source, { ...source, durationSec: 103 })).toBe(false);
  });

  it("backs retries off with a cap", () => {
    expect(retryDelayMs(1)).toBe(5 * 60_000);
    expect(retryDelayMs(3)).toBe(15 * 60_000);
    expect(retryDelayMs(20)).toBe(30 * 60_000);
  });
});
