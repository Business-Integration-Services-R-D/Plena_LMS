import { execFile, spawn } from "child_process";
import { mkdtemp, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { promisify } from "util";
import {
  VideoCompressionJob,
  VideoCompressionJobStatus,
  VideoProcessingStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  deleteObject,
  downloadObjectToPath,
  localObjectPath,
  uploadPathObject,
} from "@/lib/storage";
import {
  compressionConfig,
  durationMatches,
  ffmpegArgs,
  retryDelayMs,
  shouldUseCompressedOutput,
  type VideoProbe,
} from "@/lib/video-compression";

const execFileAsync = promisify(execFile);
const maxAttempts = 3;
const pollMs = Number(process.env.VIDEO_WORKER_POLL_MS || 5_000);
const cleanupGraceHours = Number(
  process.env.VIDEO_COMPRESSION_DELETE_GRACE_HOURS || 24,
);
const staleAfterMinutes = Number(
  process.env.VIDEO_COMPRESSION_STALE_AFTER_MINUTES || 180,
);

let stopping = false;

function log(message: string, extra?: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      service: "video-compression-worker",
      message,
      ...extra,
    }),
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 4_000) : String(error);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeVideo(filePath: string): Promise<VideoProbe> {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height:format=duration",
      "-of",
      "json",
      filePath,
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ codec_name?: string; width?: number; height?: number }>;
    format?: { duration?: string };
  };
  const stream = parsed.streams?.[0];
  const durationSec = Number(parsed.format?.duration || 0);
  if (!stream?.codec_name || !stream.width || !stream.height || !durationSec) {
    throw new Error("ffprobe geçerli bir video akışı bulamadı");
  }
  return {
    codec: stream.codec_name,
    width: stream.width,
    height: stream.height,
    durationSec,
  };
}

async function runFfmpeg(
  inputPath: string,
  outputPath: string,
  durationSec: number,
  onProgress: (percent: number) => void,
) {
  const config = compressionConfig();
  const args = ffmpegArgs(inputPath, outputPath, config);
  args.splice(args.length - 1, 0, "-progress", "pipe:1", "-nostats");

  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdoutBuffer = "";
    let stderr = "";
    let lastPercent = -1;

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || "";
      for (const line of lines) {
        const [key, rawValue] = line.split("=", 2);
        if (key === "progress" && rawValue === "end") {
          if (lastPercent !== 100) onProgress(100);
          lastPercent = 100;
          continue;
        }
        if (key !== "out_time_us" && key !== "out_time_ms") continue;
        const processedSeconds = Number(rawValue) / 1_000_000;
        if (!Number.isFinite(processedSeconds) || durationSec <= 0) continue;
        const percent = Math.max(1, Math.min(99, Math.floor((processedSeconds / durationSec) * 100)));
        if (percent > lastPercent) {
          lastPercent = percent;
          onProgress(percent);
        }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-16 * 1024);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg kod ${code}: ${stderr.trim()}`));
    });
  });
}

async function requeueStalledJobs() {
  const staleBefore = new Date(Date.now() - staleAfterMinutes * 60_000);
  const stale = await prisma.videoCompressionJob.findMany({
    where: {
      status: VideoCompressionJobStatus.PROCESSING,
      lockedAt: { lt: staleBefore },
    },
    select: { id: true, attempts: true, videoId: true, mediaVersion: true },
  });

  for (const job of stale) {
    const exhausted = job.attempts >= maxAttempts;
    await prisma.videoCompressionJob.update({
      where: { id: job.id },
      data: {
        status: exhausted
          ? VideoCompressionJobStatus.FAILED
          : VideoCompressionJobStatus.QUEUED,
        lockedAt: null,
        availableAt: new Date(),
        error: exhausted ? "Worker zaman aşımı; deneme limiti doldu" : null,
      },
    });
    if (exhausted) {
      await prisma.video.updateMany({
        where: { id: job.videoId, mediaVersion: job.mediaVersion },
        data: {
          processingStatus: VideoProcessingStatus.FAILED,
          processingError: "Video sıkıştırma worker zaman aşımına uğradı",
        },
      });
    }
  }
}

async function claimJob(): Promise<VideoCompressionJob | null> {
  const candidate = await prisma.videoCompressionJob.findFirst({
    where: {
      status: VideoCompressionJobStatus.QUEUED,
      availableAt: { lte: new Date() },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return null;

  const claimed = await prisma.videoCompressionJob.updateMany({
    where: { id: candidate.id, status: VideoCompressionJobStatus.QUEUED },
    data: {
      status: VideoCompressionJobStatus.PROCESSING,
      lockedAt: new Date(),
      attempts: { increment: 1 },
      error: null,
    },
  });
  if (claimed.count !== 1) return null;

  const job = await prisma.videoCompressionJob.findUnique({
    where: { id: candidate.id },
  });
  if (!job) return null;

  await prisma.video.updateMany({
    where: {
      id: job.videoId,
      mediaVersion: job.mediaVersion,
      storageKey: job.sourceStorageKey,
    },
    data: {
      processingStatus: VideoProcessingStatus.PROCESSING,
      processingProgress: 0,
    },
  });
  return job;
}

async function markStale(job: VideoCompressionJob, outputKey?: string) {
  if (outputKey) await deleteObject(outputKey).catch(() => undefined);
  await prisma.videoCompressionJob.update({
    where: { id: job.id },
    data: {
      status: VideoCompressionJobStatus.STALE,
      lockedAt: null,
      error: "Video bu iş çalışırken değiştirildi",
    },
  });
}

async function processJob(job: VideoCompressionJob) {
  const current = await prisma.video.findUnique({ where: { id: job.videoId } });
  if (
    !current ||
    current.mediaVersion !== job.mediaVersion ||
    current.storageKey !== job.sourceStorageKey ||
    current.pageCount !== null
  ) {
    await markStale(job);
    return;
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "plena-video-"));
  const localSourcePath = localObjectPath(job.sourceStorageKey);
  const sourceExtension = path.extname(job.sourceStorageKey).toLowerCase() === ".webm"
    ? ".webm"
    : ".mp4";
  const inputPath = localSourcePath || path.join(workDir, `source${sourceExtension}`);
  const outputPath = path.join(workDir, "optimized.mp4");
  const outputKey = `courses/${current.courseId}/optimized/${current.id}-v${job.mediaVersion}.mp4`;

  try {
    log("compression started", { jobId: job.id, videoId: current.id });
    if (!localSourcePath) {
      await downloadObjectToPath(job.sourceStorageKey, inputPath);
    }
    const sourceProbe = await probeVideo(inputPath);
    let progressWrites = Promise.resolve();
    let lastPersistedPercent = 0;
    await runFfmpeg(inputPath, outputPath, sourceProbe.durationSec, (percent) => {
      if (percent < 100 && percent - lastPersistedPercent < 2) return;
      lastPersistedPercent = percent;
      progressWrites = progressWrites.then(async () => {
        await prisma.video.updateMany({
          where: {
            id: job.videoId,
            mediaVersion: job.mediaVersion,
            storageKey: job.sourceStorageKey,
          },
          data: { processingProgress: percent },
        });
      });
    });
    await progressWrites;
    const outputProbe = await probeVideo(outputPath);
    const outputInfo = await stat(outputPath);

    if (!durationMatches(sourceProbe, outputProbe)) {
      throw new Error(
        `Süre doğrulaması başarısız: ${sourceProbe.durationSec}s -> ${outputProbe.durationSec}s`,
      );
    }

    if (!shouldUseCompressedOutput(job.sourceSizeBytes, outputInfo.size)) {
      await prisma.$transaction([
        prisma.videoCompressionJob.update({
          where: { id: job.id },
          data: {
            status: VideoCompressionJobStatus.SKIPPED,
            outputSizeBytes: outputInfo.size,
            lockedAt: null,
            error: "Sıkıştırılmış dosya en az %5 tasarruf sağlamadı",
          },
        }),
        prisma.video.updateMany({
          where: {
            id: job.videoId,
            mediaVersion: job.mediaVersion,
            storageKey: job.sourceStorageKey,
          },
          data: {
            processingStatus: VideoProcessingStatus.SKIPPED,
            processingProgress: 100,
            processingError: null,
          },
        }),
      ]);
      log("compression skipped; original is smaller", {
        jobId: job.id,
        sourceBytes: job.sourceSizeBytes,
        outputBytes: outputInfo.size,
      });
      return;
    }

    await uploadPathObject(outputKey, outputPath, "video/mp4");
    const swapped = await prisma.$transaction(async (tx) => {
      const result = await tx.video.updateMany({
        where: {
          id: job.videoId,
          mediaVersion: job.mediaVersion,
          storageKey: job.sourceStorageKey,
        },
        data: {
          storageKey: outputKey,
          contentType: "video/mp4",
          sizeBytes: outputInfo.size,
          processingStatus: VideoProcessingStatus.OPTIMIZED,
          processingProgress: 100,
          processingError: null,
        },
      });
      if (result.count !== 1) return false;

      await tx.videoCompressionJob.update({
        where: { id: job.id },
        data: {
          status: VideoCompressionJobStatus.CLEANUP_PENDING,
          outputStorageKey: outputKey,
          outputSizeBytes: outputInfo.size,
          deleteAfter: new Date(Date.now() + cleanupGraceHours * 3_600_000),
          lockedAt: null,
          error: null,
        },
      });
      return true;
    });

    if (!swapped) {
      await markStale(job, outputKey);
      return;
    }

    log("optimized video activated", {
      jobId: job.id,
      sourceBytes: job.sourceSizeBytes,
      outputBytes: outputInfo.size,
      savingsPercent: Math.round(
        (1 - outputInfo.size / job.sourceSizeBytes) * 10_000,
      ) / 100,
    });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function failJob(job: VideoCompressionJob, error: unknown) {
  const message = errorMessage(error);
  const retry = job.attempts < maxAttempts;
  await prisma.$transaction([
    prisma.videoCompressionJob.update({
      where: { id: job.id },
      data: {
        status: retry
          ? VideoCompressionJobStatus.QUEUED
          : VideoCompressionJobStatus.FAILED,
        availableAt: retry
          ? new Date(Date.now() + retryDelayMs(job.attempts))
          : new Date(),
        lockedAt: null,
        error: message,
      },
    }),
    prisma.video.updateMany({
      where: {
        id: job.videoId,
        mediaVersion: job.mediaVersion,
        storageKey: job.sourceStorageKey,
      },
      data: {
        processingStatus: retry
          ? VideoProcessingStatus.QUEUED
          : VideoProcessingStatus.FAILED,
        processingProgress: retry ? 0 : undefined,
        processingError: message,
      },
    }),
  ]);
  log(retry ? "compression will retry" : "compression failed", {
    jobId: job.id,
    attempts: job.attempts,
    error: message,
  });
}

async function cleanupOne() {
  const job = await prisma.videoCompressionJob.findFirst({
    where: {
      status: VideoCompressionJobStatus.CLEANUP_PENDING,
      deleteAfter: { lte: new Date() },
    },
    orderBy: { deleteAfter: "asc" },
  });
  if (!job) return false;

  const video = await prisma.video.findUnique({ where: { id: job.videoId } });
  if (video?.storageKey === job.sourceStorageKey) return false;

  try {
    await deleteObject(job.sourceStorageKey);
  } catch (error) {
    const message = `Orijinal video temizlenemedi: ${errorMessage(error)}`;
    await prisma.videoCompressionJob.update({
      where: { id: job.id },
      data: {
        deleteAfter: new Date(Date.now() + 60 * 60_000),
        error: message,
      },
    });
    log("original cleanup postponed", { jobId: job.id, error: message });
    return false;
  }
  await prisma.$transaction([
    prisma.videoCompressionJob.update({
      where: { id: job.id },
      data: { status: VideoCompressionJobStatus.COMPLETED, error: null },
    }),
    prisma.video.updateMany({
      where: {
        id: job.videoId,
        mediaVersion: job.mediaVersion,
        sourceStorageKey: job.sourceStorageKey,
      },
      data: { sourceStorageKey: null },
    }),
  ]);
  log("original video deleted after grace period", { jobId: job.id });
  return true;
}

async function main() {
  log("worker started", {
    pollMs,
    cleanupGraceHours,
    config: compressionConfig(),
  });
  await requeueStalledJobs();

  while (!stopping) {
    try {
      if (await cleanupOne()) continue;
      const job = await claimJob();
      if (!job) {
        await sleep(pollMs);
        continue;
      }
      try {
        await processJob(job);
      } catch (error) {
        await failJob(job, error);
      }
    } catch (error) {
      log("worker loop error", { error: errorMessage(error) });
      await sleep(pollMs);
    }
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopping = true;
    log("shutdown requested", { signal });
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
