-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE 'FREE_TEXT';

-- AlterTable
ALTER TABLE "QuizAnswer" ADD COLUMN     "textAnswer" TEXT;
