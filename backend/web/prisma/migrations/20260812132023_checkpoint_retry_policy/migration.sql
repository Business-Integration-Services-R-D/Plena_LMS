-- AlterEnum
ALTER TYPE "CheckpointOnFail" ADD VALUE 'RETRY';

-- AlterTable
ALTER TABLE "Checkpoint" ADD COLUMN     "maxAttempts" INTEGER;
