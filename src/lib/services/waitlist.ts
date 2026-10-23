import "server-only";
import type { Shop, WaitlistSource } from "@prisma/client";
import { db } from "../db";
import { pickWave } from "../waves";
import { naira } from "../format";
import { sendRestockTemplate } from "../meta";

export const consentText = (shopName: string) =>
  `${shopName} can message me on WhatsApp when this item is back in stock. I can reply STOP at any time.`;

export async function joinWaitlist(shop: Shop, productId: string, name: string, waPhone: string, source: WaitlistSource) {
  const product = await db.product.findFirstOrThrow({ where: { id: productId, shopId: shop.id } });
  const contact = await db.contact.upsert({
    where: { shopId_waPhone: { shopId: shop.id, waPhone } },
    create: { shopId: shop.id, waPhone, name },
    update: { waOptedOut: false },
  });
  return db.waitlistEntry.upsert({
    where: { productId_contactId: { productId: product.id, contactId: contact.id } },
    create: { productId: product.id, contactId: contact.id, source, consentText: consentText(shop.name) },
    update: { status: "WAITING", source, consentText: consentText(shop.name), consentAt: new Date(), alertedAt: null },
  });
}

export type RestockResult = { units: number; alerted: number; simulated: number; failed: number; stillWaiting: number };

/** Adds stock, then sends the restock alert to the first wave of the waitlist. */
export async function restock(shop: Shop, productId: string, units: number): Promise<RestockResult> {
  const product = await db.product.update({
    where: { id: productId, shopId: shop.id },
    data: { stock: { increment: units } },
  });
  const waiting = await db.waitlistEntry.findMany({
    where: { productId, status: "WAITING", contact: { waOptedOut: false, waPhone: { not: null } } },
    include: { contact: true },
  });
  const wave = pickWave(waiting, units);
  const result: RestockResult = { units, alerted: 0, simulated: 0, failed: 0, stillWaiting: waiting.length - wave.length };

  for (const entry of wave) {
    const r = await sendRestockTemplate(shop, entry.contact.waPhone!, [
      product.name,
      shop.name,
      String(product.stock),
      naira(product.priceKobo),
    ]);
    if (r.status === "failed") {
      result.failed++;
      continue;
    }
    if (r.status === "simulated") result.simulated++;
    result.alerted++;
    await db.waitlistEntry.update({ where: { id: entry.id }, data: { status: "ALERTED", alertedAt: new Date() } });
  }
  return result;
}
