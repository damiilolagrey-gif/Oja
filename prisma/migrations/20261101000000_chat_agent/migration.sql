-- AI sales agent, in-chat checkout and stock alerts
ALTER TYPE "Author" ADD VALUE 'AGENT';

CREATE TYPE "AgentMode" AS ENUM ('OFF', 'DRAFT', 'AUTO');

-- Shops that exist today keep today's behaviour (AI drafts for reps); new shops get the agent answering on its own.
ALTER TABLE "Shop" ADD COLUMN "agentMode" "AgentMode" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "agentNotes" TEXT,
ADD COLUMN "alertPhone" TEXT;
ALTER TABLE "Shop" ALTER COLUMN "agentMode" SET DEFAULT 'AUTO';

ALTER TABLE "Product" ADD COLUMN "description" TEXT,
ADD COLUMN "lowStockAt" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "stockAlert" TEXT;

ALTER TABLE "Conversation" ADD COLUMN "agentPaused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "handoverNote" TEXT;

ALTER TABLE "Order" ADD COLUMN "conversationId" TEXT,
ADD COLUMN "payUrl" TEXT;
ALTER TABLE "Order" ADD CONSTRAINT "Order_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Order_conversationId_idx" ON "Order"("conversationId");
