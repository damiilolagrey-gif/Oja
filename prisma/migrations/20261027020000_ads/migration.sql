-- CreateEnum
CREATE TYPE "AdStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED', 'FAILED');

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "metaAdAccountId" TEXT,
ADD COLUMN     "metaAdsTokenEnc" TEXT,
ADD COLUMN     "metaIgUserId" TEXT,
ADD COLUMN     "metaPageId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "adCampaignId" TEXT;

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "platforms" TEXT[],
    "area" TEXT NOT NULL,
    "dailyKobo" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "status" "AdStatus" NOT NULL DEFAULT 'ACTIVE',
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "metaCampaignId" TEXT,
    "metaAdSetId" TEXT,
    "metaAdId" TEXT,
    "spendKobo" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdCampaign_shopId_createdAt_idx" ON "AdCampaign"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "AdCampaign_status_endAt_idx" ON "AdCampaign"("status", "endAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_adCampaignId_fkey" FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

