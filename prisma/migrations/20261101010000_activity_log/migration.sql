-- Manager role and the staff activity log
ALTER TYPE "Role" ADD VALUE 'MANAGER';

CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "device" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Activity_shopId_createdAt_idx" ON "Activity"("shopId", "createdAt");
CREATE INDEX "Activity_shopId_userId_createdAt_idx" ON "Activity"("shopId", "userId", "createdAt");

ALTER TABLE "Activity" ADD CONSTRAINT "Activity_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
