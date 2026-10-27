-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "igMediaId" TEXT,
ADD COLUMN     "needsPrice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nudgedFor" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastProductId" TEXT,
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "ProductImage" (
    "productId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("productId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_shopId_igMediaId_key" ON "Product"("shopId", "igMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "User_shopId_phone_key" ON "User"("shopId", "phone");

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

