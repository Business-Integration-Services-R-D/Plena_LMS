ALTER TABLE "User" ADD COLUMN "deactivatedAt" TIMESTAMP(3);

UPDATE "User"
SET "deactivatedAt" = "deletedAt"
WHERE "deletedAt" IS NOT NULL;
