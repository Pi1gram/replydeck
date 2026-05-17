-- CreateEnum
CREATE TYPE "EmailCardStatus" AS ENUM ('PENDING', 'SENT', 'REJECTED', 'LATER', 'EDITED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "FeedbackAction" AS ENUM ('APPROVED', 'EDITED', 'REJECTED', 'REGENERATED', 'SAVED_LATER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "senderIntent" TEXT NOT NULL,
    "contextUsed" JSONB NOT NULL,
    "draftReply" TEXT NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "riskReason" TEXT NOT NULL,
    "status" "EmailCardStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailCardId" TEXT NOT NULL,
    "action" "FeedbackAction" NOT NULL,
    "beforeText" TEXT,
    "afterText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailCardId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "EmailCard_userId_status_idx" ON "EmailCard"("userId", "status");

-- CreateIndex
CREATE INDEX "FeedbackEvent_userId_idx" ON "FeedbackEvent"("userId");

-- CreateIndex
CREATE INDEX "FeedbackEvent_emailCardId_idx" ON "FeedbackEvent"("emailCardId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- AddForeignKey
ALTER TABLE "EmailCard" ADD CONSTRAINT "EmailCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackEvent" ADD CONSTRAINT "FeedbackEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackEvent" ADD CONSTRAINT "FeedbackEvent_emailCardId_fkey" FOREIGN KEY ("emailCardId") REFERENCES "EmailCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_emailCardId_fkey" FOREIGN KEY ("emailCardId") REFERENCES "EmailCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
