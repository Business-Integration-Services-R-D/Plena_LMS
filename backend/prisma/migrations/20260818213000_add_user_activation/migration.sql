ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_SENT_ACTIVATION';
ALTER TYPE "AuditAction" ADD VALUE 'USER_ACTIVATED_ACCOUNT';

ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE TABLE "UserActivationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserActivationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserActivationToken_tokenHash_key"
ON "UserActivationToken"("tokenHash");

CREATE INDEX "UserActivationToken_userId_createdAt_idx"
ON "UserActivationToken"("userId", "createdAt");

CREATE INDEX "UserActivationToken_expiresAt_idx"
ON "UserActivationToken"("expiresAt");

CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

ALTER TABLE "UserActivationToken"
ADD CONSTRAINT "UserActivationToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
