-- CreateEnum
CREATE TYPE "Category" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "ToneId" AS ENUM ('FORMAL', 'BUSINESS', 'FRIENDS');

-- CreateEnum
CREATE TYPE "MemoryScope" AS ENUM ('USER', 'SENDER', 'THREAD', 'COMPANY');

-- CreateEnum
CREATE TYPE "MemorySourceType" AS ENUM ('APPROVED_REPLY', 'EDITED_REPLY', 'REJECTED_REPLY', 'SENT_EMAIL', 'THREAD_SUMMARY', 'SENDER_PROFILE');

-- CreateEnum
CREATE TYPE "SensitivityLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "EmailCard" ADD COLUMN     "aiPromptVersion" TEXT,
ADD COLUMN     "category" "Category" NOT NULL DEFAULT 'B',
ADD COLUMN     "toneApplied" "ToneId";

-- CreateTable
CREATE TABLE "ToneProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultTone" "ToneId" NOT NULL DEFAULT 'BUSINESS',
    "averageReplyLength" TEXT,
    "preferredGreetings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredSignOffs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avoidPhrases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "styleNotes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToneProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SenderProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "senderDomain" TEXT,
    "relationship" TEXT,
    "formality" TEXT,
    "usualReplyLength" TEXT,
    "preferredTone" "ToneId",
    "pinAlwaysReview" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SenderProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "MemoryScope" NOT NULL,
    "sourceType" "MemorySourceType" NOT NULL,
    "content" TEXT NOT NULL,
    "sensitivity" "SensitivityLevel" NOT NULL DEFAULT 'LOW',
    "senderEmail" TEXT,
    "threadId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ToneProfile_userId_key" ON "ToneProfile"("userId");

-- CreateIndex
CREATE INDEX "SenderProfile_userId_senderDomain_idx" ON "SenderProfile"("userId", "senderDomain");

-- CreateIndex
CREATE UNIQUE INDEX "SenderProfile_userId_senderEmail_key" ON "SenderProfile"("userId", "senderEmail");

-- CreateIndex
CREATE INDEX "MemoryItem_userId_scope_idx" ON "MemoryItem"("userId", "scope");

-- CreateIndex
CREATE INDEX "MemoryItem_userId_senderEmail_idx" ON "MemoryItem"("userId", "senderEmail");

-- AddForeignKey
ALTER TABLE "ToneProfile" ADD CONSTRAINT "ToneProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenderProfile" ADD CONSTRAINT "SenderProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
