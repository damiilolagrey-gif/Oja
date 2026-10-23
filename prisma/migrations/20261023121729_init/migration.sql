-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'REP');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('INSTAGRAM', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "WaitlistSource" AS ENUM ('IG_DM', 'IG_COMMENT', 'STOREFRONT', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'ALERTED', 'REPLIED', 'BOUGHT', 'STOPPED');

-- CreateEnum
CREATE TYPE "ConversationSource" AS ENUM ('ORGANIC', 'ALERT');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "Author" AS ENUM ('BUYER', 'REP', 'SYSTEM');

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "igHandle" TEXT,
    "whatsappNumber" TEXT,
    "missLimitMinutes" INTEGER NOT NULL DEFAULT 60,
    "bankDetails" TEXT,
    "waPhoneNumberId" TEXT,
    "waTokenEnc" TEXT,
    "igAccountId" TEXT,
    "igTokenEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'REP',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceKobo" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "waPhone" TEXT,
    "igUserId" TEXT,
    "igUsername" TEXT,
    "waOptedOut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "source" "WaitlistSource" NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "consentText" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "repId" TEXT,
    "productId" TEXT,
    "source" "ConversationSource" NOT NULL DEFAULT 'ORGANIC',
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstReplyAt" TIMESTAMP(3),
    "lastBuyerAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amountKobo" INTEGER,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "author" "Author" NOT NULL,
    "repId" TEXT,
    "text" TEXT NOT NULL,
    "externalId" TEXT,
    "deliveryStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_slug_key" ON "Shop"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_waPhoneNumberId_key" ON "Shop"("waPhoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_igAccountId_key" ON "Shop"("igAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Product_shopId_idx" ON "Product"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_shopId_waPhone_key" ON "Contact"("shopId", "waPhone");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_shopId_igUserId_key" ON "Contact"("shopId", "igUserId");

-- CreateIndex
CREATE INDEX "WaitlistEntry_productId_status_createdAt_idx" ON "WaitlistEntry"("productId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_productId_contactId_key" ON "WaitlistEntry"("productId", "contactId");

-- CreateIndex
CREATE INDEX "Conversation_shopId_status_idx" ON "Conversation"("shopId", "status");

-- CreateIndex
CREATE INDEX "Conversation_shopId_startedAt_idx" ON "Conversation"("shopId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_externalId_key" ON "Message"("externalId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
