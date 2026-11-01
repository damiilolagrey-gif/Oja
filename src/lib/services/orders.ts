import "server-only";
import { randomBytes } from "node:crypto";
import type { Order, OrderStatus, Prisma, Product, Shop } from "@prisma/client";
import { db } from "../db";
import { escrowConfig, fromStatuses, orderTotals, releaseDue, releaseTime, shopPayoutKobo } from "../escrow";
import { initializeTransaction, paystackConfigured, refund as paystackRefund, transfer } from "../paystack";
import { sendOrderUpdateTemplate, sendWhatsAppText } from "../meta";
import { checkStock } from "./stock";
import { syncStock } from "./variants";
import { itemName, unitPrice, type Variant } from "../variants";

export const trackingLink = (o: Pick<Order, "buyerToken">) => `${process.env.APP_URL ?? ""}/o/${o.buyerToken}`;

const DAY_MS = 24 * 3600_000;

/**
 * Tells the buyer about their order on WhatsApp. Uses the approved order-update template when there is one
 * (it arrives at any time); otherwise, for an order made in a WhatsApp chat that is still inside Meta's
 * 24-hour window, a plain message. The update is also written into that chat so reps see what the buyer saw.
 */
async function notifyBuyer(shop: Shop, o: Order, update: string) {
  const convo = o.conversationId
    ? await db.conversation.findUnique({ where: { id: o.conversationId }, include: { contact: true } })
    : null;
  const text = `${update} Track your order: ${trackingLink(o)}`;
  let r = await sendOrderUpdateTemplate(shop, o.buyerPhone, [shop.name, update, trackingLink(o)]);
  if (r.status === "simulated" && convo?.channel === "WHATSAPP" && Date.now() - convo.lastBuyerAt.getTime() < DAY_MS) {
    r = await sendWhatsAppText(shop, convo.contact.waPhone ?? o.buyerPhone, text);
  }
  if (convo) {
    await db.message.create({
      data: { conversationId: convo.id, direction: "OUT", author: "SYSTEM", text, externalId: r.externalId, deliveryStatus: r.status },
    });
  }
}

export type Buyer = { name: string; phone: string; email?: string | null; address: string; city: string };

/** Creates an unpaid order for one product. The caller checks stock and validates the buyer's details. */
/**
 * A new unpaid order. It is credited to an ad campaign when the chat it came from was started by one, or when
 * the buyer arrived on the checkout page through a campaign's link (`campaignCode`).
 */
export async function createOrder(
  shop: Shop,
  product: Product,
  quantity: number,
  buyer: Buyer,
  conversationId?: string,
  variant?: Variant | null,
  campaignCode?: string | null,
) {
  const totals = orderTotals(unitPrice(product.priceKobo, variant), quantity, escrowConfig());
  const fromChat = conversationId ? await db.conversation.findUnique({ where: { id: conversationId }, select: { campaignId: true } }) : null;
  const fromLink = !fromChat?.campaignId && campaignCode ? await db.campaign.findFirst({ where: { code: campaignCode, shopId: shop.id }, select: { id: true } }) : null;
  return db.order.create({
    data: {
      shopId: shop.id,
      productId: product.id,
      variantId: variant?.id ?? null,
      conversationId: conversationId ?? null,
      campaignId: fromChat?.campaignId ?? fromLink?.id ?? null,
      reference: "oja_" + randomBytes(8).toString("hex"),
      buyerToken: randomBytes(18).toString("base64url"),
      buyerName: buyer.name,
      buyerPhone: buyer.phone,
      buyerEmail: buyer.email || null,
      address: buyer.address,
      city: buyer.city,
      itemName: itemName(product.name, variant),
      quantity,
      ...totals,
    },
  });
}

/**
 * Where to send the buyer to pay. In test mode (no Paystack key) the order is marked paid straight away and
 * the buyer goes to their tracking page. The Paystack page is created once and reused, because Paystack
 * refuses a second checkout with the same reference.
 */
export async function startPayment(o: Order & { shop: Shop }): Promise<{ url: string } | { error: string }> {
  if (o.status !== "PENDING") return { url: trackingLink(o) };
  if (!paystackConfigured()) {
    await markPaid(o.reference, o.totalKobo, true);
    return { url: trackingLink(o) };
  }
  if (o.payUrl) return { url: o.payUrl };
  const init = await initializeTransaction({
    // Paystack needs an email; buyers who skip it get a per-order placeholder so receipts go nowhere.
    email: o.buyerEmail || `${o.buyerPhone}@buyers.${new URL(process.env.APP_URL || "https://oja.app").hostname}`,
    amountKobo: o.totalKobo,
    reference: o.reference,
    callbackUrl: trackingLink(o),
    metadata: { shop: o.shop.name, item: o.itemName, quantity: o.quantity },
  });
  if (!init.ok) return { error: "We couldn't open the payment page. Please try again in a minute." };
  await db.order.update({ where: { id: o.id }, data: { payUrl: init.data.authorization_url } });
  return { url: init.data.authorization_url };
}

/**
 * Moves an order from one of `from` to `to` only if it is still in one of those statuses. Returns the
 * updated order, or null when another request got there first. This is what stops a double payout or refund.
 */
async function transition(id: string, from: OrderStatus[], to: OrderStatus, data: Prisma.OrderUncheckedUpdateManyInput = {}) {
  const res = await db.order.updateMany({ where: { id, status: { in: from } }, data: { ...data, status: to } });
  return res.count ? db.order.findUniqueOrThrow({ where: { id }, include: { shop: true } }) : null;
}

/** Called from the Paystack webhook, the callback page, or straight away in test mode. Safe to call twice. */
export async function markPaid(reference: string, paidKobo: number, simulated = false) {
  const o = await db.order.findUnique({ where: { reference } });
  if (!o || o.status !== "PENDING") return o;
  if (paidKobo < o.totalKobo) return o; // underpaid: leave it pending for an admin to look at
  const paid = await transition(o.id, ["PENDING"], "PAID", { paidAt: new Date(), simulated });
  if (!paid) return db.order.findUnique({ where: { reference } });
  if (paid.productId && paid.variantId) {
    await db.productVariant.updateMany({ where: { id: paid.variantId, stock: { gte: paid.quantity } }, data: { stock: { decrement: paid.quantity } } });
    await syncStock(paid.productId);
    await checkStock(paid.shop, paid.productId);
  } else if (paid.productId) {
    await db.product.updateMany({ where: { id: paid.productId, stock: { gte: paid.quantity } }, data: { stock: { decrement: paid.quantity } } });
    await checkStock(paid.shop, paid.productId);
  }
  await notifyBuyer(paid.shop, paid, `Your payment for ${paid.itemName} is held safely. ${paid.shop.name} has been told to dispatch it.`);
  return paid;
}

export async function markShipped(id: string, courier: string, trackingNote: string, extra: Prisma.OrderUncheckedUpdateManyInput = {}) {
  const o = await transition(id, fromStatuses("ship"), "SHIPPED", { ...extra, shippedAt: new Date(), courier, trackingNote: trackingNote || null });
  if (o) await notifyBuyer(o.shop, o, `${o.itemName} is on its way with ${courier}.`);
  return o;
}

export async function markDelivered(id: string) {
  const now = new Date();
  const o = await transition(id, fromStatuses("deliver"), "DELIVERED", { deliveredAt: now, releaseAt: releaseTime(now, escrowConfig()) });
  if (o) {
    await notifyBuyer(o.shop, o, `${o.itemName} was marked delivered. Check it, then confirm or report a problem within ${escrowConfig().releaseHours} hours.`);
  }
  return o;
}

export async function reportProblem(id: string, reason: string, detail: string) {
  return transition(id, fromStatuses("dispute"), "DISPUTED", { disputedAt: new Date(), disputeReason: reason, disputeDetail: detail || null });
}

/** Pays the shop: item amount minus commission and any delivery booked through Oja. Without a payout account the money waits for one. */
export async function release(id: string, from: OrderStatus[] = fromStatuses("release"), note?: string) {
  const cfg = escrowConfig();
  const current = await db.order.findUnique({ where: { id } });
  if (!current) return null;
  const amount = shopPayoutKobo(current.amountKobo, current.shippingKobo, cfg);
  const ref = `payout_${current.reference}`;
  const o = await transition(id, from, "RELEASED", {
    payoutKobo: amount,
    payoutRef: ref,
    resolvedAt: current.status === "DISPUTED" ? new Date() : null,
    resolutionNote: note ?? null,
  });
  if (!o) return null;
  return sendPayout(o, o.shop);
}

/** Starts (or retries) the transfer for a released order. */
export async function sendPayout(o: Order, shop: Shop) {
  let payoutStatus: string;
  if (o.simulated || !paystackConfigured()) payoutStatus = "simulated";
  else if (!shop.paystackRecipient) payoutStatus = "awaiting_account";
  else {
    const t = await transfer({ amountKobo: o.payoutKobo!, recipient: shop.paystackRecipient, reference: o.payoutRef!, reason: `Oja order ${o.reference}` });
    payoutStatus = t.ok ? (t.data.status === "success" ? "success" : "pending") : "failed";
    if (!t.ok) console.error("payout failed", o.reference, t.error);
  }
  return db.order.update({ where: { id: o.id }, data: { payoutStatus } });
}

export async function refundOrder(id: string, from: OrderStatus[] = fromStatuses("refund"), note?: string) {
  const o = await transition(id, from, "REFUNDED", { resolvedAt: new Date(), resolutionNote: note ?? null });
  if (!o) return { order: null, error: "This order can no longer be refunded." };
  if (!o.simulated && paystackConfigured()) {
    const r = await paystackRefund(o.reference);
    if (!r.ok) return { order: o, error: `Marked refunded, but Paystack said: ${r.error}. Refund it from the Paystack dashboard.` };
  }
  if (o.productId) await db.product.update({ where: { id: o.productId }, data: { stock: { increment: o.quantity } } });
  return { order: o, error: null };
}

/** Run by the cron: releases delivered orders whose buyers didn't report a problem, and drops stale checkouts. */
export async function sweep(now = new Date()) {
  const due = await db.order.findMany({ where: { status: "DELIVERED", releaseAt: { lte: now } } });
  let released = 0;
  for (const o of due) if (releaseDue(o, now) && (await release(o.id, ["DELIVERED"], "Released automatically: no problem reported"))) released++;
  const retried = await db.order.findMany({ where: { status: "RELEASED", payoutStatus: { in: ["failed", "awaiting_account"] } }, include: { shop: true } });
  for (const o of retried) if (o.payoutStatus === "failed" || o.shop.paystackRecipient) await sendPayout(o, o.shop);
  const cancelled = await db.order.updateMany({
    where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - 24 * 3600_000) } },
    data: { status: "CANCELLED" },
  });
  return { released, retried: retried.length, cancelled: cancelled.count };
}
