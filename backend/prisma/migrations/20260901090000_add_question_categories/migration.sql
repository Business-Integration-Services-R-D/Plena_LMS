-- Soru kategorileri, sınavlarda kullanılan teknik soru havuzlarından bağımsızdır.
CREATE TABLE "QuestionCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuestionCategory_name_key" ON "QuestionCategory"("name");

-- Mevcut soruların tamamına güvenli bir varsayılan kategori ata.
INSERT INTO "QuestionCategory" ("id", "name", "description", "updatedAt")
VALUES (
    'question-category-general',
    'Genel',
    'Belirli bir konu başlığına bağlı olmayan genel sorular.',
    CURRENT_TIMESTAMP
);

ALTER TABLE "Question" ADD COLUMN "categoryId" TEXT;

UPDATE "Question"
SET "categoryId" = 'question-category-general'
WHERE "categoryId" IS NULL;

ALTER TABLE "Question" ALTER COLUMN "categoryId" SET NOT NULL;

CREATE INDEX "Question_categoryId_active_idx" ON "Question"("categoryId", "active");

ALTER TABLE "Question"
ADD CONSTRAINT "Question_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "QuestionCategory"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
