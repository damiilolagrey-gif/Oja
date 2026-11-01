import "server-only";
import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { newCode, results, type Results } from "../ads";

/** Orders that brought in money (paid, on the way, delivered or paid out). Unpaid, cancelled and refunded don't count. */
const SOLD: Prisma.OrderWhereInput["status"] = { in: ["PAID", "SHIPPED", "DELIVERED", "DISPUTED", "RELEASED"] };

/** A campaign code nobody else has. Codes are short, so a clash is possible but rare: try again. */
export async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = newCode(randomInt);
    if (!(await db.campaign.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new Error("Couldn't make a campaign code");
}

/**
 * Chats, orders and revenue for several campaigns in three queries. An order is a paid checkout, or a chat the
 * team marked as sold without a checkout (so a sale closed by bank transfer still counts).
 */
export async function campaignResults(campaigns: { id: string; spendKobo: number }[]): Promise<Map<string, Results>> {
  const ids = campaigns.map(c => c.id);
  const [chats, orders, wonChats, chatOrders] = await Promise.all([
    db.conversation.groupBy({ by: ["campaignId"], where: { campaignId: { in: ids } }, _count: true }),
    db.order.groupBy({ by: ["campaignId"], where: { campaignId: { in: ids }, status: SOLD }, _count: true, _sum: { amountKobo: true } }),
    db.conversation.groupBy({
      by: ["campaignId"],
      where: { campaignId: { in: ids }, status: "WON", orders: { none: { status: SOLD } } },
      _count: true,
      _sum: { amountKobo: true },
    }),
    db.order.groupBy({ by: ["campaignId"], where: { campaignId: { in: ids }, status: SOLD, conversationId: { not: null } }, _count: true }),
  ]);
  const get = <T extends { campaignId: string | null }>(rows: T[], id: string) => rows.find(r => r.campaignId === id);
  return new Map(
    campaigns.map(c => {
      const o = get(orders, c.id);
      const w = get(wonChats, c.id);
      return [
        c.id,
        results({
          chats: get(chats, c.id)?._count ?? 0,
          orders: (o?._count ?? 0) + (w?._count ?? 0),
          revenueKobo: (o?._sum.amountKobo ?? 0) + (w?._sum.amountKobo ?? 0),
          spendKobo: c.spendKobo,
          chatOrders: (get(chatOrders, c.id)?._count ?? 0) + (w?._count ?? 0),
        }),
      ];
    }),
  );
}
