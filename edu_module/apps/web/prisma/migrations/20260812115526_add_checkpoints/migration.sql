-- CreateEnum
CREATE TYPE "CheckpointOnFail" AS ENUM ('START', 'PREVIOUS');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WatchEventType" ADD VALUE 'CHECKPOINT_PASSED';
ALTER TYPE "WatchEventType" ADD VALUE 'CHECKPOINT_FAILED';

-- CreateTable
CREATE TABLE "Checkpoint" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "timeSec" INTEGER NOT NULL,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 60,
    "onFail" "CheckpointOnFail" NOT NULL DEFAULT 'START',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Checkpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Checkpoint_courseId_timeSec_idx" ON "Checkpoint"("courseId", "timeSec");

-- AddForeignKey
ALTER TABLE "Checkpoint" ADD CONSTRAINT "Checkpoint_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkpoint" ADD CONSTRAINT "Checkpoint_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
