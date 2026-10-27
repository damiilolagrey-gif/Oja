import "server-only";
import type { Order, OrderStatus, Prisma, Shop } from "@prisma/client";
import { db } from "../db";
import { escrowConfig, fromStatuses, releaseDue, releaseTime, shopPayoutKobo } from "../escrow";
import { paystackConfigured, refund as paystackRefund, transfer } from "../paystack";
import { sendOrderUpdateTemplate } from "../meta";

export const trackingLink = (o: Pick<Order, "buyerToken">) => `${process.env.APP_URL ?? ""}/o/${o.buyerToken}`;

async function notifyBuyer(shop: Shop, o: Order, update: string) {
  await sendOrderUpdateTemplate(shop, o.buyerPhone, [shop.name, update, trackingLink(o)]);
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
  if (paid.productId) {
    await db.product.updateMany({ where: { id: paid.productId, stock: { gte: paid.quantity } }, data: { stock: { decrement: paid.quantity } } });
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
