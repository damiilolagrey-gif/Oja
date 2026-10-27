-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "businessVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "cacNumber" TEXT,
ADD COLUMN     "registeredName" TEXT,
ADD COLUMN     "verificationNote" TEXT,
ADD COLUMN     "verificationRequestedAt" TIMESTAMP(3);

