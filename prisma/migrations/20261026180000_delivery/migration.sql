-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "pickupAddress" TEXT,
ADD COLUMN     "pickupAddressCode" INTEGER,
ADD COLUMN     "pickupCity" TEXT,
ADD COLUMN     "pickupPhone" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "buyerAddressCode" INTEGER,
ADD COLUMN     "deliveryQuote" JSONB,
ADD COLUMN     "shipmentId" TEXT,
ADD COLUMN     "shipmentStatus" TEXT,
ADD COLUMN     "shippingKobo" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trackingUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_shipmentId_key" ON "Order"("shipmentId");

