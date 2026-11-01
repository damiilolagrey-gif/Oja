import "server-only";
import type { Shop, WaitlistSource } from "@prisma/client";
import { db } from "../db";
import { pickWave } from "../waves";
import { naira } from "../format";
import { sendRestockTemplate } from "../meta";
import { checkStock } from "./stock";
import { syncStock } from "./variants";
import { itemName, restockReaches, unitPrice } from "../variants";

export const consentText = (shopName: string) =>
  `${shopName} can message me on WhatsApp when this item is back in stock. I can reply STOP at any time.`;

export async function joinWaitlist(shop: Shop, productId: string, name: string, waPhone: string, source: WaitlistSource, variantId: string | null = null) {
  const product = await db.product.findFirstOrThrow({ where: { id: productId, shopId: shop.id } });
  const contact = await db.contact.upsert({
    where: { shopId_waPhone: { shopId: shop.id, waPhone } },
    create: { shopId: shop.id, waPhone, name },
    update: { waOptedOut: false },
  });
  return db.waitlistEntry.upsert({
    where: { productId_contactId: { productId: product.id, contactId: contact.id } },
    create: { productId: product.id, variantId, contactId: contact.id, source, consentText: consentText(shop.name) },
    update: { status: "WAITING", variantId, source, consentText: consentText(shop.name), consentAt: new Date(), alertedAt: null },
  });
}

export type RestockResult = { units: number; alerted: number; simulated: number; failed: number; stillWaiting: number };

/**
 * Adds stock, then sends the restock alert to the first wave of the waitlist. With an option (variantId),
 * the stock goes to that option and only buyers who wanted it, or any option, are alerted.
 */
export async function restock(shop: Shop, productId: string, units: number, variantId: string | null = null): Promise<RestockResult> {
  let product = await db.product.findFirstOrThrow({ where: { id: productId, shopId: shop.id } });
  const variant = variantId
    ? await db.productVariant.update({ where: { id: variantId, productId }, data: { stock: { increment: units } } })
    : null;
  if (variant) await syncStock(productId);
  else await db.product.update({ where: { id: productId }, data: { stock: { increment: units } } });
  product = await db.product.findUniqueOrThrow({ where: { id: productId } });
  await checkStock(shop, productId); // clears the stock alert once it is back above the threshold
  const waiting = (
    await db.waitlistEntry.findMany({
      where: { productId, status: "WAITING", contact: { waOptedOut: false, waPhone: { not: null } } },
      include: { contact: true },
      orderBy: { createdAt: "asc" },
    })
  ).filter(w => restockReaches(w.variantId, variantId));
  const wave = pickWave(waiting, units);
  const result: RestockResult = { units, alerted: 0, simulated: 0, failed: 0, stillWaiting: waiting.length - wave.length };

  for (const entry of wave) {
    const r = await sendRestockTemplate(shop, entry.contact.waPhone!, [
      itemName(product.name, variant),
      shop.name,
      String(variant ? variant.stock : product.stock),
      naira(unitPrice(product.priceKobo, variant)),
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
