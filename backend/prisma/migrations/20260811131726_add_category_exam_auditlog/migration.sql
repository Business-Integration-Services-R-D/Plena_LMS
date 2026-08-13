-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE');

-- CreateEnum
CREATE TYPE "RetakePolicy" AS ENUM ('TEST_ONLY', 'VIDEO_AND_TEST');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('ADMIN_CREATED_USER', 'ADMIN_UPDATED_USER', 'ADMIN_CHANGED_USER_STATUS', 'ADMIN_CREATED_COURSE', 'ADMIN_CREATED_GROUP', 'ADMIN_ADDED_GROUP_MEMBER', 'ADMIN_REMOVED_GROUP_MEMBER', 'ADMIN_ASSIGNED_COURSE', 'ADMIN_CREATED_QUESTION_POOL', 'ADMIN_EXPORTED_REPORT', 'USER_LOGGED_IN', 'USER_LOGGED_OUT');

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "categoryId" TEXT;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "type" "QuestionType" NOT NULL DEFAULT 'MULTIPLE_CHOICE';

-- AlterTable
ALTER TABLE "QuizAttempt" ADD COLUMN     "examId" TEXT;

-- AlterTable
ALTER TABLE "WatchEvent" ADD COLUMN     "metadata" JSONB;

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "questionPoolId" TEXT,
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "passPercent" INTEGER NOT NULL DEFAULT 80,
    "maxAttempts" INTEGER NOT NULL DEFAULT 0,
    "durationMinutes" INTEGER,
    "retakePolicy" "RetakePolicy" NOT NULL DEFAULT 'TEST_ONLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_courseId_key" ON "Exam"("courseId");

-- CreateIndex
CREATE INDEX "Exam_questionPoolId_idx" ON "Exam"("questionPoolId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Course_categoryId_idx" ON "Course"("categoryId");

-- CreateIndex
CREATE INDEX "QuizAttempt_examId_idx" ON "QuizAttempt"("examId");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_questionPoolId_fkey" FOREIGN KEY ("questionPoolId") REFERENCES "QuestionPool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: her mevcut eğitim için Course üzerindeki sınav ayarlarından bir Exam üret.
-- Course'taki eski kolonlar bilerek korunuyor; bu migration veri kaybettirmez.
INSERT INTO "Exam" (
    "id", "courseId", "questionPoolId", "questionCount",
    "passPercent", "maxAttempts", "createdAt", "updatedAt"
)
SELECT
    md5(random()::text || clock_timestamp()::text || c."id"),
    c."id",
    c."questionPoolId",
    c."questionCount",
    c."passPercent",
    c."maxAttempts",
    c."createdAt",
    CURRENT_TIMESTAMP
FROM "Course" c
WHERE NOT EXISTS (SELECT 1 FROM "Exam" e WHERE e."courseId" = c."id");

-- Backfill: geçmiş sınav denemelerini yeni Exam kayıtlarına bağla.
UPDATE "QuizAttempt" qa
SET "examId" = e."id"
FROM "Exam" e
WHERE e."courseId" = qa."courseId" AND qa."examId" IS NULL;

-- Bir atama ya kullanıcıya ya ekibe yapılır; ikisi birden ya da ikisi de boş olamaz.
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_target_check" CHECK (
    ("userId" IS NOT NULL AND "groupId" IS NULL)
    OR ("userId" IS NULL AND "groupId" IS NOT NULL)
);

-- Sınav ayarları için değer aralıkları.
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_passPercent_check"
    CHECK ("passPercent" BETWEEN 0 AND 100);
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_questionCount_check"
    CHECK ("questionCount" >= 0);
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_maxAttempts_check"
    CHECK ("maxAttempts" >= 0);
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_durationMinutes_check"
    CHECK ("durationMinutes" IS NULL OR "durationMinutes" > 0);
