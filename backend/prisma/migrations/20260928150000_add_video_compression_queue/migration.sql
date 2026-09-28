-- CreateEnum
CREATE TYPE "VideoProcessingStatus" AS ENUM (
  'READY',
  'QUEUED',
  'PROCESSING',
  'OPTIMIZED',
  'FAILED',
  'SKIPPED'
);

-- CreateEnum
CREATE TYPE "VideoCompressionJobStatus" AS ENUM (
  'QUEUED',
  'PROCESSING',
  'CLEANUP_PENDING',
  'COMPLETED',
  'SKIPPED',
  'FAILED',
  'STALE'
);

-- AlterTable
ALTER TABLE "Video"
  ADD COLUMN "sourceStorageKey" TEXT,
  ADD COLUMN "sourceSizeBytes" INTEGER,
  ADD COLUMN "processingStatus" "VideoProcessingStatus" NOT NULL DEFAULT 'READY',
  ADD COLUMN "processingError" TEXT,
  ADD COLUMN "mediaVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing videos are already active and require no background job.
UPDATE "Video"
SET
  "sourceStorageKey" = "storageKey",
  "sourceSizeBytes" = "sizeBytes";

-- CreateTable
CREATE TABLE "VideoCompressionJob" (
  "id" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "sourceStorageKey" TEXT NOT NULL,
  "sourceSizeBytes" INTEGER NOT NULL,
  "mediaVersion" INTEGER NOT NULL,
  "status" "VideoCompressionJobStatus" NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "outputStorageKey" TEXT,
  "outputSizeBytes" INTEGER,
  "deleteAfter" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VideoCompressionJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VideoCompressionJob_videoId_mediaVersion_key"
  ON "VideoCompressionJob"("videoId", "mediaVersion");
CREATE INDEX "VideoCompressionJob_status_availableAt_idx"
  ON "VideoCompressionJob"("status", "availableAt");
CREATE INDEX "VideoCompressionJob_status_deleteAfter_idx"
  ON "VideoCompressionJob"("status", "deleteAfter");

ALTER TABLE "VideoCompressionJob"
  ADD CONSTRAINT "VideoCompressionJob_videoId_fkey"
  FOREIGN KEY ("videoId") REFERENCES "Video"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
