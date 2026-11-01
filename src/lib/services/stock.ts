import "server-only";
import type { Shop } from "@prisma/client";
import { db } from "../db";
import { alertText, nextAlert, stockLevel } from "../stock";
import { variantOutText } from "../stock";
import { sendStockAlertTemplate, sendWhatsAppText, type SendResult } from "../meta";

/**
 * Checks a product's stock after it changes and, when it first drops to the low-stock level or sells out,
 * messages the owner on WhatsApp. Uses the approved stock-alert template when there is one, so it arrives
 * any time; otherwise a plain message, which Meta only delivers if the owner wrote to the shop's number in
 * the last 24 hours. The alert also shows on the dashboard Home either way.
 */
export async function checkStock(shop: Shop, productId: string): Promise<SendResult | null> {
  const p = await db.product.findUnique({ where: { id: productId }, include: { variants: { where: { archived: false } } } });
  if (!p || p.shopId !== shop.id) return null;
  const level = stockLevel(p.stock, p.lowStockAt);
  // An option selling out while others are left gets its own alert, once, until it is restocked.
  const soldOut = p.variants.filter(v => v.stock <= 0 && v.stockAlert !== "out");
  const back = p.variants.filter(v => v.stock > 0 && v.stockAlert === "out");
  if (back.length) await db.productVariant.updateMany({ where: { id: { in: back.map(v => v.id) } }, data: { stockAlert: null } });
  if (soldOut.length) await db.productVariant.updateMany({ where: { id: { in: soldOut.map(v => v.id) } }, data: { stockAlert: "out" } });
  if (soldOut.length && level !== "out" && shop.alertPhone) {
    const link = `${process.env.APP_URL ?? ""}/app/products/${p.id}`;
    await sendWhatsAppText(shop, shop.alertPhone, variantOutText({ product: p.name, options: soldOut.map(v => v.label), stockLeft: p.stock, link }));
  }
  const { send, remember } = nextAlert(level, p.stockAlert);
  if (remember !== p.stockAlert) await db.product.update({ where: { id: p.id }, data: { stockAlert: remember } });
  if (!send || !shop.alertPhone) return null;

  const waiting = await db.waitlistEntry.count({ where: { productId: p.id, status: "WAITING" } });
  const link = `${process.env.APP_URL ?? ""}/app/products/${p.id}`;
  const r = await sendStockAlertTemplate(shop, shop.alertPhone, [p.name, String(p.stock), String(waiting), link]);
  if (r.status !== "simulated") return r;
  return sendWhatsAppText(shop, shop.alertPhone, alertText({ shopName: shop.name, product: p.name, stock: p.stock, waiting, level: send, link }));
}
