CREATE TYPE "NotificationKind" AS ENUM (
    'WELCOME',
    'TRAINING_STARTED',
    'DUE_REMINDER'
);

ALTER TABLE "Assignment"
ADD COLUMN "reminderDays" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Enrollment"
ADD COLUMN "reminderDays" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "UserNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserNotification_userId_dedupeKey_key"
ON "UserNotification"("userId", "dedupeKey");

CREATE INDEX "UserNotification_userId_readAt_occurredAt_idx"
ON "UserNotification"("userId", "readAt", "occurredAt");

ALTER TABLE "UserNotification"
ADD CONSTRAINT "UserNotification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
