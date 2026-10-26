-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'DISPUTED', 'RELEASED', 'REFUNDED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "payoutAccountName" TEXT,
ADD COLUMN     "payoutAccountNumber" TEXT,
ADD COLUMN     "payoutBankCode" TEXT,
ADD COLUMN     "payoutBankName" TEXT,
ADD COLUMN     "paystackRecipient" TEXT;

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT,
    "reference" TEXT NOT NULL,
    "buyerToken" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerPhone" TEXT NOT NULL,
    "buyerEmail" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "feeKobo" INTEGER NOT NULL,
    "totalKobo" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "courier" TEXT,
    "trackingNote" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "releaseAt" TIMESTAMP(3),
    "disputedAt" TIMESTAMP(3),
    "disputeReason" TEXT,
    "disputeDetail" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "payoutStatus" TEXT,
    "payoutKobo" INTEGER,
    "payoutRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Order_buyerToken_key" ON "Order"("buyerToken");

-- CreateIndex
CREATE UNIQUE INDEX "Order_payoutRef_key" ON "Order"("payoutRef");

-- CreateIndex
CREATE INDEX "Order_shopId_status_idx" ON "Order"("shopId", "status");

-- CreateIndex
CREATE INDEX "Order_status_releaseAt_idx" ON "Order"("status", "releaseAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

