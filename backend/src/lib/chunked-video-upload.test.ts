import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assembleVideoUpload,
  createVideoUpload,
  finishVideoUpload,
  readVideoUploadManifest,
  VIDEO_UPLOAD_MAX_BYTES,
  writeVideoUploadChunk,
} from "./chunked-video-upload";
import { localObjectPath } from "./storage";

let testRoot: string | null = null;

async function useLocalStorage() {
  testRoot = await mkdtemp(path.join(tmpdir(), "plena-upload-test-"));
  process.env.STORAGE_DRIVER = "local";
  process.env.LOCAL_STORAGE_ROOT = testRoot;
}

afterEach(async () => {
  if (testRoot) await rm(testRoot, { recursive: true, force: true });
  testRoot = null;
  delete process.env.LOCAL_STORAGE_ROOT;
  delete process.env.STORAGE_DRIVER;
});

describe("chunked video upload", () => {
  it("assembles uploaded chunks into the final shared-volume object", async () => {
    await useLocalStorage();
    const bytes = new TextEncoder().encode("parcali-video-icerigi");
    const manifest = await createVideoUpload({
      courseId: "course-1",
      ownerId: "admin-1",
      fileName: "egitim.mp4",
      totalBytes: bytes.length,
      durationSec: 42,
    });

    await writeVideoUploadChunk(manifest, 0, new Blob([bytes]).stream(), bytes.length);
    const assembled = await assembleVideoUpload(manifest);
    const destination = localObjectPath(assembled.storageKey);

    expect(destination).toBeTruthy();
    expect(await readFile(destination!)).toEqual(Buffer.from(bytes));

    await finishVideoUpload(manifest.id, "QUEUED");
    const published = await readVideoUploadManifest(manifest.id);
    expect(published.publishedAt).toBeTruthy();
    expect(published.processingStatus).toBe("QUEUED");
  });

  it("rejects videos larger than the 2 GB business limit", async () => {
    await useLocalStorage();
    await expect(
      createVideoUpload({
        courseId: "course-1",
        ownerId: "admin-1",
        fileName: "buyuk.mp4",
        totalBytes: VIDEO_UPLOAD_MAX_BYTES + 1,
        durationSec: 42,
      }),
    ).rejects.toMatchObject({ status: 413 });
  });

  it("preserves WebM content type until the worker creates an MP4", async () => {
    await useLocalStorage();
    const manifest = await createVideoUpload({
      courseId: "course-1",
      ownerId: "admin-1",
      fileName: "egitim.webm",
      totalBytes: 10,
      durationSec: 42,
    });

    expect(manifest.contentType).toBe("video/webm");
    expect(manifest.storageKey).toMatch(/\.webm$/);
  });

  it("stops a chunk stream that exceeds its declared session size", async () => {
    await useLocalStorage();
    const manifest = await createVideoUpload({
      courseId: "course-1",
      ownerId: "admin-1",
      fileName: "egitim.mp4",
      totalBytes: 3,
      durationSec: 42,
    });

    await expect(
      writeVideoUploadChunk(
        manifest,
        0,
        new Blob([new Uint8Array([1, 2, 3, 4])]).stream(),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
