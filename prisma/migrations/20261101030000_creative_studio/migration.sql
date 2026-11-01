-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "brandColor" TEXT,
ADD COLUMN     "brandVoice" TEXT;

-- CreateTable
CREATE TABLE "AdCreative" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT,
    "angle" TEXT NOT NULL,
    "copy" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdCreative_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdCreative_shopId_createdAt_idx" ON "AdCreative"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "AdCreative_productId_idx" ON "AdCreative"("productId");

-- AddForeignKey
ALTER TABLE "AdCreative" ADD CONSTRAINT "AdCreative_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCreative" ADD CONSTRAINT "AdCreative_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

