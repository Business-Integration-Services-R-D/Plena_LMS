import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function env(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

export function getS3Client(publicFacing = false) {
  const endpointHost = publicFacing
    ? env("MINIO_PUBLIC_ENDPOINT", process.env.MINIO_ENDPOINT || "localhost")
    : env("MINIO_ENDPOINT", "localhost");
  const port = publicFacing
    ? env("MINIO_PUBLIC_PORT", process.env.MINIO_PORT || "9000")
    : env("MINIO_PORT", "9000");
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

export function bucketName() {
  return env("MINIO_BUCKET", "videos");
}

export async function ensureBucket() {
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
  await ensureBucket();
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getPresignedGetUrl(key: string, expiresIn = 3600) {
  const command = new GetObjectCommand({
    Bucket: bucketName(),
    Key: key,
  });
  return getSignedUrl(getS3Client(true), command, { expiresIn });
}
