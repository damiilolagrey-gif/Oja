import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma, type Order, type Shop } from "@prisma/client";
import { db } from "../db";
import { escrowConfig, payoutKobo } from "../escrow";
import { naira } from "../format";
import {
  categoryId,
  createShipment,
  fetchRates,
  pickupDate,
  shipbubbleConfigured,
  simulatedQuote,
  validateAddress,
  type PackageSize,
  type Quote,
  type ShipbubbleEvent,
} from "../shipbubble";
import { markDelivered, markShipped } from "./orders";

type Done = { ok: string } | { error: string };

/** Placeholder email for Shipbubble's address check when the buyer didn't give one, as at checkout. */
const fallbackEmail = (phone: string) => `${phone}@buyers.${new URL(process.env.APP_URL || "https://oja.app").hostname}`;

export async function savePickup(shop: Shop, ownerEmail: string, p: { address: string; city: string; phone: string }): Promise<Done> {
  let code: number | null = null;
  if (shipbubbleConfigured()) {
    const v = await validateAddress({ name: shop.name, email: ownerEmail, phone: `+${p.phone}`, address: `${p.address}, ${p.city}, Nigeria` });
    if (!v.ok) return { error: `The courier network couldn't find that address: ${v.error}. Add a landmark or the area.` };
    code = v.data.address_code;
  }
  await db.shop.update({
    where: { id: shop.id },
    data: { pickupAddress: p.address, pickupCity: p.city, pickupPhone: p.phone, pickupAddressCode: code },
  });
  return { ok: code ? "Pickup address checked and saved." : "Saved in test mode. The address will be checked once delivery booking goes live." };
}

/** Gets prices from couriers for this order and keeps them on the order for the shop to pick from. */
export async function quote(o: Order, shop: Shop, p: { size: PackageSize; weightKg: number }): Promise<Done> {
  if (o.status !== "PAID" || o.shipmentId) return { error: "This order has already been dispatched." };
  if (!shop.pickupAddress || !shop.pickupCity) return { error: "Add your pickup address in Settings first." };

  let q: Quote;
  if (!shipbubbleConfigured()) q = simulatedQuote(shop.pickupCity, o.city);
  else {
    if (!shop.pickupAddressCode) return { error: "Save your pickup address again in Settings so it can be checked." };
    let receiver = o.buyerAddressCode;
    if (!receiver) {
      const v = await validateAddress({
        name: o.buyerName,
        email: o.buyerEmail || fallbackEmail(o.buyerPhone),
        phone: `+${o.buyerPhone}`,
        address: `${o.address}, ${o.city}, Nigeria`,
      });
      if (!v.ok) return { error: `Couriers couldn't find the buyer's address (${v.error}). Call the buyer, then book your own rider below.` };
      receiver = v.data.address_code;
      await db.order.update({ where: { id: o.id }, data: { buyerAddressCode: receiver } });
    }
    const cat = await categoryId();
    if (!cat.ok) return { error: `Couldn't get prices: ${cat.error}` };
    const r = await fetchRates({
      senderCode: shop.pickupAddressCode,
      receiverCode: receiver,
      pickupDate: pickupDate(),
      categoryId: cat.data,
      item: { name: o.itemName, valueKobo: o.amountKobo, quantity: o.quantity, weightKg: p.weightKg },
      size: p.size,
    });
    if (!r.ok) return { error: `Couldn't get prices: ${r.error}` };
    q = r.data;
  }
  const max = payoutKobo(o.amountKobo, escrowConfig());
  q.couriers = q.couriers.filter(c => c.totalKobo < max).sort((a, b) => a.totalKobo - b.totalKobo);
  if (!q.couriers.length) return { error: `Every courier costs more than this order pays you (${naira(max)}). Arrange your own rider below.` };
  await db.order.update({ where: { id: o.id }, data: { deliveryQuote: q as unknown as Prisma.InputJsonObject } });
  return { ok: `${q.couriers.length} delivery option${q.couriers.length > 1 ? "s" : ""} found.` };
}

/** Books the chosen courier, then marks the order dispatched. The fee is taken from the shop's payout on release. */
export async function book(o: Order, choice: string): Promise<Done> {
  const q = o.deliveryQuote as unknown as Quote | null;
  const c = q?.couriers.find(c => `${c.courierId}|${c.serviceCode}` === choice);
  if (!q || !c) return { error: "Pick a delivery option, or get new prices." };
  if (c.totalKobo >= payoutKobo(o.amountKobo, escrowConfig())) return { error: "That delivery costs more than this order pays you." };

  // Claim the order first so a double tap can't book two riders.
  const claimed = await db.order.updateMany({
    where: { id: o.id, status: "PAID", shipmentId: null, OR: [{ shipmentStatus: null }, { shipmentStatus: { not: "booking" } }] },
    data: { shipmentStatus: "booking" },
  });
  if (!claimed.count) return { error: "This order is already being booked." };

  let shipmentId: string;
  let trackingUrl: string | null = null;
  let trackingCode = "";
  if (q.token === "sim") shipmentId = "SIM-" + randomBytes(4).toString("hex").toUpperCase();
  else {
    const r = await createShipment({ token: q.token, courierId: c.courierId, serviceCode: c.serviceCode });
    if (!r.ok) {
      await db.order.update({ where: { id: o.id }, data: { shipmentStatus: null } });
      return { error: `${c.name} couldn't take it: ${r.error}. Prices may have expired, so get new prices and try again.` };
    }
    shipmentId = r.data.order_id;
    trackingUrl = r.data.tracking_url ?? null;
    trackingCode = r.data.courier?.tracking_code ?? "";
  }
  const shipped = await markShipped(o.id, c.name, trackingCode, {
    shipmentId,
    shipmentStatus: "pending",
    trackingUrl,
    shippingKobo: c.totalKobo,
  });
  if (!shipped) {
    // The order moved on (refunded or disputed) while booking. Leave a trail for an admin to cancel the label.
    console.error("shipment booked for an order that is no longer PAID", o.reference, shipmentId);
    await db.order.update({ where: { id: o.id }, data: { shipmentId, shipmentStatus: "pending", trackingUrl } });
    return { error: "This order changed while booking. The Oja team will sort out the delivery." };
  }
  return { ok: `Booked with ${c.name}. ${naira(c.totalKobo)} comes out of your payout.` };
}

/** Webhook updates from the courier: track progress, mark delivered, or put the order back if cancelled. */
export async function onShipmentEvent(ev: Extract<ShipbubbleEvent, { kind: "shipment" }>) {
  const o = await db.order.findUnique({ where: { shipmentId: ev.shipmentId } });
  if (!o) return;
  const update = {
    shipmentStatus: ev.cancelled ? "cancelled" : ev.status,
    ...(ev.trackingUrl ? { trackingUrl: ev.trackingUrl } : {}),
    ...(ev.trackingCode && !o.trackingNote ? { trackingNote: ev.trackingCode } : {}),
  };
  if (ev.cancelled) {
    // Back to "paid" so the shop can book again; no fee is owed for a cancelled shipment.
    const reverted = await db.order.updateMany({
      where: { id: o.id, status: "SHIPPED" },
      data: { ...update, status: "PAID", shippedAt: null, courier: null, trackingNote: null, shippingKobo: 0, shipmentId: null, deliveryQuote: Prisma.DbNull },
    });
    if (!reverted.count) await db.order.update({ where: { id: o.id }, data: update });
    return;
  }
  await db.order.update({ where: { id: o.id }, data: update });
  if (ev.status === "completed") await markDelivered(o.id);
}
