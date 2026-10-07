import { createReadStream, createWriteStream } from "fs";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import {
  ensureStorage,
  localObjectPath,
  localUploadPath,
  sanitizeStorageKeyPart,
  storageDriver,
} from "./storage";

export const VIDEO_UPLOAD_MAX_BYTES = 2_000_000_000;
export const VIDEO_UPLOAD_CHUNK_BYTES = 16 * 1024 * 1024;
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

export type VideoUploadManifest = {
  id: string;
  courseId: string;
  ownerId: string;
  fileName: string;
  contentType: "video/mp4" | "video/webm";
  durationSec: number;
  totalBytes: number;
  chunkSize: number;
  totalChunks: number;
  storageKey: string;
  createdAt: string;
  assembledAt?: string;
  publishedAt?: string;
  processingStatus?: string;
};

export class VideoUploadError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = "VIDEO_UPLOAD_ERROR",
  ) {
    super(message);
  }
}

function assertUploadId(uploadId: string) {
  if (!/^[0-9a-f-]{36}$/.test(uploadId)) {
    throw new VideoUploadError("Geçersiz yükleme kimliği", 400);
  }
}

function manifestPath(uploadId: string) {
  assertUploadId(uploadId);
  return localUploadPath(uploadId, "manifest.json");
}

function chunkPath(uploadId: string, index: number) {
  return localUploadPath(uploadId, "chunks", `${String(index).padStart(5, "0")}.part`);
}

export function expectedChunkBytes(manifest: VideoUploadManifest, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= manifest.totalChunks) {
    throw new VideoUploadError("Geçersiz video parçası", 400);
  }
  const offset = index * manifest.chunkSize;
  return Math.min(manifest.chunkSize, manifest.totalBytes - offset);
}

export async function readVideoUploadManifest(uploadId: string) {
  if (storageDriver() !== "local") {
    throw new VideoUploadError(
      "Bu ortamda parçalı video yükleme etkin değil",
      501,
      "CHUNKED_UPLOAD_UNAVAILABLE",
    );
  }
  try {
    return JSON.parse(
      await readFile(manifestPath(uploadId), "utf8"),
    ) as VideoUploadManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new VideoUploadError("Yükleme oturumu bulunamadı", 404);
    }
    throw error;
  }
}

export function assertVideoUploadOwner(
  manifest: VideoUploadManifest,
  courseId: string,
  ownerId: string,
) {
  if (manifest.courseId !== courseId || manifest.ownerId !== ownerId) {
    throw new VideoUploadError("Bu yükleme oturumuna erişemezsiniz", 403);
  }
}

export async function cleanupStaleVideoUploads(now = Date.now()) {
  if (storageDriver() !== "local") return;
  let entries;
  try {
    entries = await readdir(localUploadPath(), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          const manifest = await readVideoUploadManifest(entry.name);
          const referenceTime = new Date(
            manifest.publishedAt || manifest.createdAt,
          ).getTime();
          const ttl = manifest.publishedAt ? 60 * 60 * 1000 : UPLOAD_TTL_MS;
          if (now - referenceTime <= ttl) return;
          await rm(localUploadPath(entry.name), { recursive: true, force: true });
        } catch {
          const info = await stat(localUploadPath(entry.name)).catch(() => null);
          if (info && now - info.mtimeMs > UPLOAD_TTL_MS) {
            await rm(localUploadPath(entry.name), { recursive: true, force: true });
          }
        }
      }),
  );
}

export async function createVideoUpload(input: {
  courseId: string;
  ownerId: string;
  fileName: string;
  totalBytes: number;
  durationSec: number;
}) {
  if (storageDriver() !== "local") {
    throw new VideoUploadError(
      "Bu ortamda parçalı video yükleme etkin değil",
      501,
      "CHUNKED_UPLOAD_UNAVAILABLE",
    );
  }
  const lowerName = input.fileName.toLowerCase();
  const contentType = lowerName.endsWith(".webm") ? "video/webm" : "video/mp4";
  if (!lowerName.endsWith(".mp4") && !lowerName.endsWith(".webm")) {
    throw new VideoUploadError("Yalnızca MP4 veya WebM video yükleyebilirsiniz");
  }
  if (!Number.isInteger(input.totalBytes) || input.totalBytes < 1) {
    throw new VideoUploadError("Video boyutu geçersiz");
  }
  if (input.totalBytes > VIDEO_UPLOAD_MAX_BYTES) {
    throw new VideoUploadError("Video 2 GB sınırını aşıyor", 413);
  }
  if (!Number.isInteger(input.durationSec) || input.durationSec < 1) {
    throw new VideoUploadError("Video süresi gerekli");
  }

  await ensureStorage();
  cleanupStaleVideoUploads().catch(() => undefined);

  const id = randomUUID();
  const safeName = sanitizeStorageKeyPart(input.fileName);
  const manifest: VideoUploadManifest = {
    id,
    courseId: input.courseId,
    ownerId: input.ownerId,
    fileName: input.fileName,
    contentType,
    durationSec: input.durationSec,
    totalBytes: input.totalBytes,
    chunkSize: VIDEO_UPLOAD_CHUNK_BYTES,
    totalChunks: Math.ceil(input.totalBytes / VIDEO_UPLOAD_CHUNK_BYTES),
    storageKey: `courses/${Date.now()}-${id.slice(0, 8)}-${safeName}`,
    createdAt: new Date().toISOString(),
  };
  await mkdir(localUploadPath(id, "chunks"), { recursive: true });
  await writeFile(manifestPath(id), JSON.stringify(manifest), { flag: "wx" });
  return manifest;
}

export async function writeVideoUploadChunk(
  manifest: VideoUploadManifest,
  index: number,
  body: ReadableStream<Uint8Array> | null,
  declaredBytes?: number,
) {
  if (!body) throw new VideoUploadError("Video parçası gerekli");
  const expectedBytes = expectedChunkBytes(manifest, index);
  if (declaredBytes != null && declaredBytes !== expectedBytes) {
    throw new VideoUploadError("Video parçasının boyutu geçersiz");
  }

  const destination = chunkPath(manifest.id, index);
  const existing = await stat(destination).catch(() => null);
  if (existing?.size === expectedBytes) return { size: existing.size, existed: true };

  const temporary = `${destination}.${randomUUID()}.tmp`;
  let receivedBytes = 0;
  const sizeGuard = new Transform({
    transform(chunk, _encoding, callback) {
      receivedBytes += chunk.length;
      if (receivedBytes > expectedBytes) {
        callback(new VideoUploadError("Video parçasının boyutu geçersiz"));
        return;
      }
      callback(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(body as import("stream/web").ReadableStream),
      sizeGuard,
      createWriteStream(temporary, { flags: "wx" }),
    );
    const info = await stat(temporary);
    if (info.size !== expectedBytes) {
      throw new VideoUploadError("Video parçası eksik ulaştı");
    }
    await rename(temporary, destination);
    return { size: info.size, existed: false };
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function* readChunks(manifest: VideoUploadManifest) {
  for (let index = 0; index < manifest.totalChunks; index += 1) {
    const source = chunkPath(manifest.id, index);
    const info = await stat(source).catch(() => null);
    if (!info || info.size !== expectedChunkBytes(manifest, index)) {
      throw new VideoUploadError(`Video parçası eksik: ${index + 1}`, 409);
    }
    for await (const chunk of createReadStream(source)) yield chunk;
  }
}

export async function assembleVideoUpload(manifest: VideoUploadManifest) {
  if (manifest.assembledAt) {
    const existingPath = localObjectPath(manifest.storageKey);
    const existing = existingPath ? await stat(existingPath).catch(() => null) : null;
    if (existing?.size === manifest.totalBytes) return manifest;
  }

  const lockPath = localUploadPath(manifest.id, "complete.lock");
  let lock;
  try {
    lock = await open(lockPath, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new VideoUploadError("Video zaten birleştiriliyor", 409);
    }
    throw error;
  }

  const destination = localObjectPath(manifest.storageKey);
  if (!destination) throw new VideoUploadError("Local depolama etkin değil", 500);
  const temporary = `${destination}.${manifest.id}.assembling`;
  try {
    await mkdir(path.dirname(destination), { recursive: true });
    await pipeline(
      Readable.from(readChunks(manifest)),
      createWriteStream(temporary, { flags: "wx" }),
    );
    const info = await stat(temporary);
    if (info.size !== manifest.totalBytes) {
      throw new VideoUploadError("Birleştirilen videonun boyutu doğrulanamadı", 409);
    }
    await rename(temporary, destination);
    const assembled = { ...manifest, assembledAt: new Date().toISOString() };
    await writeFile(manifestPath(manifest.id), JSON.stringify(assembled));
    return assembled;
  } finally {
    await lock.close();
    await rm(lockPath, { force: true }).catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function finishVideoUpload(uploadId: string, processingStatus = "QUEUED") {
  const chunks = localUploadPath(uploadId, "chunks");
  await rm(chunks, { recursive: true, force: true });
  const manifest = await readVideoUploadManifest(uploadId);
  await writeFile(
    manifestPath(uploadId),
    JSON.stringify({
      ...manifest,
      publishedAt: new Date().toISOString(),
      processingStatus,
    }),
  );
}
