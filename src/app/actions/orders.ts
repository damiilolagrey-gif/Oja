"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { normalizeNigerianPhone } from "@/lib/phone";
import { requireAdmin, requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/services/activity";
import { naira } from "@/lib/format";
import { can, dispatchOverdue, DISPUTE_REASONS, escrowConfig } from "@/lib/escrow";
import { createOrder, markDelivered, markShipped, refundOrder, release, reportProblem, startPayment } from "@/lib/services/orders";
import { book, quote } from "@/lib/services/delivery";
import { PACKAGE_SIZES, type PackageSize } from "@/lib/shipbubble";
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

  const order = await createOrder(shop, product, quantity, { name: buyerName, phone: buyerPhone, email, address, city });
  const pay = await startPayment({ ...order, shop });
  if ("error" in pay) {
    await db.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    return { error: pay.error };
  }
  redirect(pay.url);
}

/** "Pay now" on the tracking page, for orders made in a chat. */
export async function payNow(_: FormState, data: FormData): Promise<FormState> {
  const o = await db.order.findUnique({ where: { buyerToken: str(data, "token") }, include: { shop: true } });
  if (!o) return { error: "Order not found." };
  if (o.status !== "PENDING") return { error: "This order is already paid or closed." };
  if (o.productId) {
    const p = await db.product.findUnique({ where: { id: o.productId } });
    if (!p || p.archived || p.stock < o.quantity) return { error: "Sorry, this item sold out before payment. Ask the shop in the chat to join the restock list." };
  }
  const pay = await startPayment(o);
  if ("error" in pay) return { error: pay.error };
  redirect(pay.url);
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
  const user = await requirePermission("orders");
  return db.order.findFirst({ where: { id, shopId: user.shopId } });
}

async function logOrder(action: string, summary: string, orderId: string) {
  await logActivity(await requirePermission("orders"), action, summary, { type: "order", id: orderId });
}

export async function shipOrder(_: FormState, data: FormData): Promise<FormState> {
  const o = await shopOrder(str(data, "id"));
  if (!o) return { error: "Order not found." };
  const courier = str(data, "courier");
  if (!courier) return { error: "Say who is delivering it, for example GIG Logistics or your own rider." };
  if (!(await markShipped(o.id, courier, str(data, "tracking")))) return { error: "This order can't be marked dispatched now." };
  await logOrder("order.ship", `Marked ${o.itemName} for ${o.buyerName} dispatched with ${courier}`, o.id);
  revalidatePath("/app/orders", "layout");
  return { ok: "Marked dispatched. The buyer can follow it from their tracking link." };
}

export async function quoteDelivery(_: FormState, data: FormData): Promise<FormState> {
  const o = await shopOrder(str(data, "id"));
  if (!o) return { error: "Order not found." };
  const size = str(data, "size") as PackageSize;
  if (!(size in PACKAGE_SIZES)) return { error: "Pick a package size." };
  const weightKg = Number(data.get("weight"));
  if (!(weightKg > 0 && weightKg <= 50)) return { error: "Enter the weight in kg, for example 1 or 2.5." };
  const user = await requirePermission("orders");
  const r = await quote(o, user.shop, { size, weightKg });
  revalidatePath(`/app/orders/${o.id}`);
  return r;
}

export async function bookDelivery(_: FormState, data: FormData): Promise<FormState> {
  const o = await shopOrder(str(data, "id"));
  if (!o) return { error: "Order not found." };
  const r = await book(o, str(data, "choice"));
  if (r && "ok" in r) await logOrder("order.book_rider", `Booked a rider for ${o.itemName} to ${o.buyerName}`, o.id);
  revalidatePath("/app/orders", "layout");
  return r;
}

export async function deliverOrder(data: FormData) {
  const o = await shopOrder(str(data, "id"));
  if (o && (await markDelivered(o.id))) await logOrder("order.deliver", `Marked ${o.itemName} for ${o.buyerName} (${naira(o.totalKobo)}) delivered`, o.id);
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
