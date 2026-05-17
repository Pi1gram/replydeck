-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('OUTLOOK', 'GMAIL');

-- AlterTable
ALTER TABLE "EmailCard" ADD COLUMN "provider" "EmailProvider";
ALTER TABLE "EmailCard" ADD COLUMN "providerMessageId" TEXT;
ALTER TABLE "EmailCard" ADD COLUMN "internetMessageId" TEXT;
ALTER TABLE "EmailCard" ADD COLUMN "hasAttachments" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ConnectedEmailAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "EmailProvider" NOT NULL,
    "providerUserId" TEXT,
    "email" TEXT NOT NULL,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectedEmailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConnectedEmailAccount_userId_idx" ON "ConnectedEmailAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedEmailAccount_userId_provider_key" ON "ConnectedEmailAccount"("userId", "provider");

-- AddForeignKey
ALTER TABLE "ConnectedEmailAccount" ADD CONSTRAINT "ConnectedEmailAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex (EmailCard providerMessageId uniqueness — NULLs are distinct in Postgres)
CREATE UNIQUE INDEX "EmailCard_userId_provider_providerMessageId_key" ON "EmailCard"("userId", "provider", "providerMessageId");
