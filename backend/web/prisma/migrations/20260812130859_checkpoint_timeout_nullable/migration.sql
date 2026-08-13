-- AlterTable
ALTER TABLE "Checkpoint" ALTER COLUMN "timeoutSeconds" DROP NOT NULL,
ALTER COLUMN "timeoutSeconds" DROP DEFAULT;
