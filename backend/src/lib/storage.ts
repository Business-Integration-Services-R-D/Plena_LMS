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
  const endpointHost = process.env.S3_ENDPOINT || process.env.MINIO_ENDPOINT;
  const endpointPort = process.env.S3_ENDPOINT_PORT || process.env.MINIO_PORT;
  const useSsl =
    (process.env.S3_USE_SSL || process.env.MINIO_USE_SSL || "false") === "true";
  const protocol = useSsl ? "https" : "http";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.MINIO_ACCESS_KEY;
  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY || process.env.MINIO_SECRET_KEY;

  const endpoint = endpointHost
    ? `${protocol}://${endpointHost}${endpointPort ? `:${endpointPort}` : ""}`
    : undefined;

  return new S3Client({
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1",
    endpoint,
    forcePathStyle: endpoint
      ? (process.env.S3_FORCE_PATH_STYLE || "true") === "true"
      : false,
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
  });
}

function bucketName() {
  return env("S3_BUCKET", process.env.MINIO_BUCKET);
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
    const isMinio = Boolean(process.env.MINIO_ENDPOINT || process.env.S3_ENDPOINT);
    if (process.env.S3_AUTO_CREATE_BUCKET === "true" || isMinio) {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
      return;
    }
    throw new Error(`S3 bucket erişilemiyor veya mevcut değil: ${bucket}`);
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

  const body = Readable.fromWeb(
    file.stream() as import("stream/web").ReadableStream,
  );
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: key,
      Body: body,
      ContentLength: file.size,
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
 * Node akışını web akışına çevirir.
 *
 * `Readable.toWeb` yerine elle sarmalanır: oynatıcı isteği yarıda kestiğinde
 * (sarma, sekme kapatma) controller kapanır ve `toWeb` kapalı controller'a
 * yazmayı deneyip route'un try/catch'ine düşmeyen ERR_INVALID_STATE atar.
 * Burada controller durumu takip edilir, iptalde dosya tanıtıcısı kapatılır.
 */
function nodeStreamToWeb(nodeStream: Readable): ReadableStream<Uint8Array> {
  let settled = false;

  const settle = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    err?: unknown,
  ) => {
    if (settled) return;
    settled = true;
    if (err) controller.error(err);
    else controller.close();
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        if (settled) return;
        controller.enqueue(new Uint8Array(chunk));
        // Tüketici yetişemiyorsa dosyadan okumayı beklet (backpressure).
        if ((controller.desiredSize ?? 1) <= 0) nodeStream.pause();
      });
      nodeStream.on("end", () => settle(controller));
      nodeStream.on("error", (err) => settle(controller, err));
    },
    pull() {
      nodeStream.resume();
    },
    cancel() {
      settled = true;
      nodeStream.destroy();
    },
  });
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
    return nodeStreamToWeb(createReadStream(localPath(key), range));
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
