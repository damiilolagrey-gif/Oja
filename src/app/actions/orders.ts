"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { normalizeNigerianPhone } from "@/lib/phone";
import { requireAdmin, requireUser } from "@/lib/session";
import { can, dispatchOverdue, DISPUTE_REASONS, escrowConfig, orderTotals } from "@/lib/escrow";
import { initializeTransaction, paystackConfigured } from "@/lib/paystack";
import { markDelivered, markPaid, markShipped, refundOrder, release, reportProblem } from "@/lib/services/orders";
import type { FormState } from "@/components/ActionForm";

const str = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

// ---------- Buyer ----------

export async function startCheckout(_: FormState, data: FormData): Promise<FormState> {
  const shop = await db.shop.findUnique({ where: { slug: str(data, "slug") } });
  const product = shop && (await db.product.findFirst({ where: { id: str(data, "productId"), shopId: shop.id, archived: false } }));
  if (!shop || !product) return { error: "This item is no longer available." };
  const quantity = Math.max(1, Math.min(20, Number(data.get("quantity")) || 1));
  if (product.stock < quantity) return { error: product.stock ? `Only ${product.stock} left.` : "Sorry, this just sold out." };
  const buyerName = str(data, "name");
  const buyerPhone = normalizeNigerianPhone(str(data, "phone"));
  const email = str(data, "email").toLowerCase();
  const address = str(data, "address");
  const city = str(data, "city");
  if (!buyerName) return { error: "Add your name so the shop knows who it's for." };
  if (!buyerPhone) return { error: "Enter a Nigerian phone number like 0803 123 4567 for the rider." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email address doesn't look right." };
  if (address.length < 8 || !city) return { error: "Add your full delivery address and city." };

  const totals = orderTotals(product.priceKobo, quantity, escrowConfig());
  const order = await db.order.create({
    data: {
      shopId: shop.id,
      productId: product.id,
      reference: "oja_" + randomBytes(8).toString("hex"),
      buyerToken: randomBytes(18).toString("base64url"),
      buyerName,
      buyerPhone,
      buyerEmail: email || null,
      address,
      city,
      itemName: product.name,
      quantity,
      ...totals,
    },
  });

  if (!paystackConfigured()) {
    // Test mode: no real money. The order behaves exactly as if it had been paid.
    await markPaid(order.reference, order.totalKobo, true);
    redirect(`/o/${order.buyerToken}`);
  }
  const init = await initializeTransaction({
    // Paystack needs an email; buyers who skip it get a per-order placeholder so receipts go nowhere.
    email: email || `${buyerPhone}@buyers.${new URL(process.env.APP_URL || "https://oja.app").hostname}`,
    amountKobo: order.totalKobo,
    reference: order.reference,
    callbackUrl: `${process.env.APP_URL}/o/${order.buyerToken}`,
    metadata: { shop: shop.name, item: product.name, quantity },
  });
  if (!init.ok) {
    await db.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    return { error: "We couldn't open the payment page. Please try again in a minute." };
  }
  redirect(init.data.authorization_url);
}

async function buyerOrder(data: FormData) {
  return db.order.findUnique({ where: { buyerToken: str(data, "token") } });
}

export async function confirmReceived(data: FormData) {
  const o = await buyerOrder(data);
  if (o && can(o.status, "confirm")) await release(o.id, ["SHIPPED", "DELIVERED"], "Buyer confirmed delivery");
  if (o) revalidatePath(`/o/${o.buyerToken}`);
}

export async function buyerReport(_: FormState, data: FormData): Promise<FormState> {
  const o = await buyerOrder(data);
  if (!o) return { error: "Order not found." };
  const reason = str(data, "reason");
  if (!(DISPUTE_REASONS as readonly string[]).includes(reason)) return { error: "Pick what went wrong." };
  if (!can(o.status, "dispute")) return { error: "This order can no longer be disputed." };
  await reportProblem(o.id, reason, str(data, "detail").slice(0, 1000));
  revalidatePath(`/o/${o.buyerToken}`);
  return { ok: "Reported. Your payment is frozen and the Oja team will contact you within 24 hours." };
}

export async function buyerCancel(data: FormData) {
  const o = await buyerOrder(data);
  if (o && dispatchOverdue(o, new Date(), escrowConfig())) {
    const r = await refundOrder(o.id, ["PAID"], "Buyer cancelled: shop didn't dispatch in time");
    if (r.error) console.error("buyer cancel refund", o.reference, r.error);
  }
  if (o) revalidatePath(`/o/${o.buyerToken}`);
}

// ---------- Shop ----------

async function shopOrder(id: string) {
  const user = await requireUser();
  return db.order.findFirst({ where: { id, shopId: user.shopId } });
}

export async function shipOrder(_: FormState, data: FormData): Promise<FormState> {
  const o = await shopOrder(str(data, "id"));
  if (!o) return { error: "Order not found." };
  const courier = str(data, "courier");
  if (!courier) return { error: "Say who is delivering it, for example GIG Logistics or your own rider." };
  if (!(await markShipped(o.id, courier, str(data, "tracking")))) return { error: "This order can't be marked dispatched now." };
  revalidatePath("/app/orders", "layout");
  return { ok: "Marked dispatched. The buyer can follow it from their tracking link." };
}

export async function deliverOrder(data: FormData) {
  const o = await shopOrder(str(data, "id"));
  if (o) await markDelivered(o.id);
  revalidatePath("/app/orders", "layout");
}

// ---------- Oja admin ----------

export async function adminResolve(_: FormState, data: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(data, "id");
  const note = str(data, "note");
  if (!note) return { error: "Write a short note on why, so the buyer and shop can see it." };
  if (data.get("decision") === "refund") {
    const r = await refundOrder(id, ["DISPUTED", "PAID"], note);
    revalidatePath("/app/admin");
    return r.error ? { error: r.error } : { ok: "Refunded to the buyer." };
  }
  const o = await release(id, ["DISPUTED"], note);
  revalidatePath("/app/admin");
  return o ? { ok: "Released to the shop." } : { error: "This order is no longer in dispute." };
}
