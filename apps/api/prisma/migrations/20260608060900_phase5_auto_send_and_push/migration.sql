-- CreateEnum
CREATE TYPE "PushPlatform" AS ENUM ('IOS', 'ANDROID');

-- AlterTable
ALTER TABLE "SenderProfile" ADD COLUMN     "autoSendAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoSendDenied" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ToneProfile" ADD COLUMN     "autoSendEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "PushPlatform" NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "expirationDateTime" TIMESTAMP(3) NOT NULL,
    "clientState" TEXT NOT NULL,
    "renewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GraphSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GraphSubscription_subscriptionId_key" ON "GraphSubscription"("subscriptionId");

-- CreateIndex
CREATE INDEX "GraphSubscription_userId_idx" ON "GraphSubscription"("userId");

-- CreateIndex
CREATE INDEX "GraphSubscription_expirationDateTime_idx" ON "GraphSubscription"("expirationDateTime");

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphSubscription" ADD CONSTRAINT "GraphSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
