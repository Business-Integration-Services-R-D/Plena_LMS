export type VideoProbe = {
  durationSec: number;
  width: number;
  height: number;
  codec: string;
};

export type CompressionConfig = {
  crf: number;
  preset: string;
  maxWidth: number;
  maxHeight: number;
  maxRate: string;
  bufferSize: string;
  audioBitrate: string;
  threads: number;
};

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function compressionConfig(
  env: NodeJS.ProcessEnv = process.env,
): CompressionConfig {
  return {
    crf: positiveInt(env.VIDEO_COMPRESSION_CRF, 25),
    preset: env.VIDEO_COMPRESSION_PRESET || "medium",
    maxWidth: positiveInt(env.VIDEO_COMPRESSION_MAX_WIDTH, 1280),
    maxHeight: positiveInt(env.VIDEO_COMPRESSION_MAX_HEIGHT, 720),
    maxRate: env.VIDEO_COMPRESSION_MAX_RATE || "4M",
    bufferSize: env.VIDEO_COMPRESSION_BUFFER_SIZE || "8M",
    audioBitrate: env.VIDEO_COMPRESSION_AUDIO_BITRATE || "96k",
    threads: positiveInt(env.VIDEO_COMPRESSION_THREADS, 1),
  };
}

export function ffmpegArgs(
  inputPath: string,
  outputPath: string,
  config: CompressionConfig,
) {
  const scale = [
    `'min(${config.maxWidth},iw)'`,
    `'min(${config.maxHeight},ih)'`,
    "force_original_aspect_ratio=decrease",
    "force_divisible_by=2",
  ].join(":");

  return [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-y",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-vf",
    `scale=${scale}`,
    "-c:v",
    "libx264",
    "-preset",
    config.preset,
    "-crf",
    String(config.crf),
    "-maxrate",
    config.maxRate,
    "-bufsize",
    config.bufferSize,
    "-pix_fmt",
    "yuv420p",
    "-threads",
    String(config.threads),
    "-c:a",
    "aac",
    "-b:a",
    config.audioBitrate,
    "-movflags",
    "+faststart",
    outputPath,
  ];
}

export function durationMatches(source: VideoProbe, output: VideoProbe) {
  const tolerance = Math.max(2, source.durationSec * 0.02);
  return (
    output.durationSec > 0 &&
    Math.abs(source.durationSec - output.durationSec) <= tolerance
  );
}

export function shouldUseCompressedOutput(
  sourceBytes: number,
  outputBytes: number,
  minimumSavingsPercent = 5,
) {
  if (sourceBytes <= 0 || outputBytes <= 0) return false;
  const threshold = sourceBytes * (1 - minimumSavingsPercent / 100);
  return outputBytes < threshold;
}

export function retryDelayMs(attempt: number) {
  return Math.min(30, Math.max(1, attempt) * 5) * 60_000;
}
