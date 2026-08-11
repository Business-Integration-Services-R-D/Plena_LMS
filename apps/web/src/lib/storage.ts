import { createReadStream, createWriteStream } from "fs";
import { mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { ByteRange } from "./range";

function env(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

export function storageDriver(): "local" | "s3" {
  return process.env.STORAGE_DRIVER === "s3" ? "s3" : "local";
}

function localRoot() {
  return path.join(process.cwd(), "storage", "videos");
}

function localPath(key: string) {
  return path.join(localRoot(), ...key.split("/"));
}

function getS3Client() {
  const endpointHost = env("MINIO_ENDPOINT", "localhost");
  const port = env("MINIO_PORT", "9000");
  const useSsl = env("MINIO_USE_SSL", "false") === "true";
  const protocol = useSsl ? "https" : "http";

  return new S3Client({
    region: "us-east-1",
    endpoint: `${protocol}://${endpointHost}:${port}`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env("MINIO_ACCESS_KEY", "minioadmin"),
      secretAccessKey: env("MINIO_SECRET_KEY", "minioadmin"),
    },
  });
}

function bucketName() {
  return env("MINIO_BUCKET", "videos");
}

export function sanitizeStorageKeyPart(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "video.mp4";
}

export async function ensureStorage() {
  if (storageDriver() === "local") {
    await mkdir(localRoot(), { recursive: true });
    return;
  }

  const client = getS3Client();
  const bucket = bucketName();
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

export async function uploadObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
) {
  await ensureStorage();

  if (storageDriver() === "local") {
    const filePath = localPath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
    return;
  }

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Stream a browser File/Blob to storage without buffering the whole video in RAM. */
export async function uploadFileObject(
  key: string,
  file: Blob,
  contentType: string,
) {
  await ensureStorage();

  if (storageDriver() === "local") {
    const filePath = localPath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    const webStream = file.stream();
    const nodeStream = Readable.fromWeb(
      webStream as import("stream/web").ReadableStream,
    );
    await pipeline(nodeStream, createWriteStream(filePath));
    return;
  }

  const buf = Buffer.from(await file.arrayBuffer());
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: key,
      Body: buf,
      ContentType: contentType,
    }),
  );
}

export async function readObject(key: string): Promise<Buffer> {
  if (storageDriver() === "local") {
    return readFile(localPath(key));
  }

  const obj = await getS3Client().send(
    new GetObjectCommand({
      Bucket: bucketName(),
      Key: key,
    }),
  );
  if (!obj.Body) throw new Error("Video okunamadı");
  return Buffer.from(await obj.Body.transformToByteArray());
}

/** Dosyanın gerçek boyutu. Range yanıtları için gerekli. */
export async function statObject(key: string): Promise<{ size: number }> {
  if (storageDriver() === "local") {
    const info = await stat(localPath(key));
    return { size: info.size };
  }

  const head = await getS3Client().send(
    new HeadObjectCommand({ Bucket: bucketName(), Key: key }),
  );
  return { size: head.ContentLength ?? 0 };
}

/**
 * Dosyayı (veya verilen byte aralığını) akış olarak okur.
 * Tüm videoyu belleğe almadan servis edebilmek için kullanılır.
 */
export async function readObjectStream(
  key: string,
  range?: ByteRange,
): Promise<ReadableStream<Uint8Array>> {
  if (storageDriver() === "local") {
    const nodeStream = createReadStream(localPath(key), range);
    return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  }

  const obj = await getS3Client().send(
    new GetObjectCommand({
      Bucket: bucketName(),
      Key: key,
      Range: range ? `bytes=${range.start}-${range.end}` : undefined,
    }),
  );
  if (!obj.Body) throw new Error("Video okunamadı");
  return obj.Body.transformToWebStream();
}
