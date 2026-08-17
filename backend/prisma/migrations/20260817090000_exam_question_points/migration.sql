-- CreateEnum
CREATE TYPE "ScoringMode" AS ENUM ('AUTO', 'PER_QUESTION');

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "points" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "scoringMode" "ScoringMode" NOT NULL DEFAULT 'AUTO';
