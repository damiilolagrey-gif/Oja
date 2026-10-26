import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Shipbubble client for booking delivery. One Oja account books riders for every shop; the fee is paid
 * from Oja's Shipbubble wallet and taken out of the shop's SafePay payout. Without SHIPBUBBLE_API_KEY,
 * prices are made up and bookings are simulated so the flow can be tried.
 */

const BASE = process.env.SHIPBUBBLE_BASE_URL || "https://api.shipbubble.com/v1"; // override only to point at a mock in tests

export const shipbubbleConfigured = () => Boolean(process.env.SHIPBUBBLE_API_KEY);

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<Result<T>> {
  try {
    const res = await fetch(BASE + path, {
      method: init?.method ?? "GET",
      headers: { Authorization: `Bearer ${process.env.SHIPBUBBLE_API_KEY}`, "Content-Type": "application/json" },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { status?: string; message?: string; data?: T; errors?: string[] };
    if (!res.ok || json.status !== "success") {
      return { ok: false, error: json.errors?.join(", ") || json.message || `Shipbubble HTTP ${res.status}` };
    }
    return { ok: true, data: json.data as T };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Checks an address and returns the code Shipbubble uses for it in rate requests. */
export function validateAddress(p: { name: string; email: string; phone: string; address: string }) {
  return call<{ address_code: number; formatted_address: string }>("/shipping/address/validate", { method: "POST", body: p });
}

export function listCategories() {
  return call<{ category_id: number; category: string }[]>("/shipping/labels/categories");
}

/** Picks the package category from SHIPBUBBLE_CATEGORY (a name such as "Fashion"), else the first one. */
export async function categoryId(): Promise<Result<number>> {
  const r = await listCategories();
  if (!r.ok) return r;
  const want = (process.env.SHIPBUBBLE_CATEGORY || "Fashion").toLowerCase();
  const match = r.data.find(c => c.category.toLowerCase().includes(want)) ?? r.data[0];
  return match ? { ok: true, data: match.category_id } : { ok: false, error: "Shipbubble returned no package categories" };
}

export type Courier = {
  courierId: string;
  serviceCode: string;
  name: string;
  totalKobo: number;
  pickupEta: string | null;
  deliveryEta: string | null;
};

export type Quote = { token: string; at: string; couriers: Courier[] };

type RawCourier = {
  courier_id: string | number;
  courier_name: string;
  service_code: string;
  total: number;
  pickup_eta?: string;
  delivery_eta?: string;
};

export const PACKAGE_SIZES = {
  small: { label: "Small (pouch or envelope)", length: 30, width: 25, height: 5 },
  medium: { label: "Medium (shoe box)", length: 35, width: 25, height: 15 },
  large: { label: "Large (carton)", length: 45, width: 35, height: 25 },
} as const;
export type PackageSize = keyof typeof PACKAGE_SIZES;

export async function fetchRates(p: {
  senderCode: number;
  receiverCode: number;
  pickupDate: string;
  categoryId: number;
  item: { name: string; valueKobo: number; quantity: number; weightKg: number };
  size: PackageSize;
}): Promise<Result<Quote>> {
  const { length, width, height } = PACKAGE_SIZES[p.size];
  const r = await call<{ request_token: string; couriers: RawCourier[] }>("/shipping/fetch_rates", {
    method: "POST",
    body: {
      sender_address_code: p.senderCode,
      reciever_address_code: p.receiverCode, // sic, Shipbubble's spelling
      pickup_date: p.pickupDate,
      category_id: p.categoryId,
      package_items: [
        {
          name: p.item.name,
          description: p.item.name,
          unit_weight: String(p.item.weightKg / p.item.quantity),
          unit_amount: String(Math.round(p.item.valueKobo / p.item.quantity / 100)),
          quantity: String(p.item.quantity),
        },
      ],
      package_dimension: { length, width, height },
    },
  });
  if (!r.ok) return r;
  return { ok: true, data: { token: r.data.request_token, at: new Date().toISOString(), couriers: r.data.couriers.map(toCourier) } };
}

export function toCourier(c: RawCourier): Courier {
  return {
    courierId: String(c.courier_id),
    serviceCode: c.service_code,
    name: c.courier_name,
    totalKobo: Math.round(Number(c.total) * 100),
    pickupEta: c.pickup_eta ?? null,
    deliveryEta: c.delivery_eta ?? null,
  };
}

export function createShipment(p: { token: string; courierId: string; serviceCode: string }) {
  return call<{ order_id: string; status: string; tracking_url?: string; courier?: { name?: string; tracking_code?: string } }>(
    "/shipping/labels",
    { method: "POST", body: { request_token: p.token, courier_id: p.courierId, service_code: p.serviceCode } },
  );
}

/** Test-mode prices, so a shop can try booking without a Shipbubble account. */
export function simulatedQuote(fromCity: string, toCity: string, now = new Date()): Quote {
  const local = fromCity.trim().toLowerCase() === toCity.trim().toLowerCase();
  const couriers: Courier[] = local
    ? [
        { courierId: "sim-kwik", serviceCode: "sim-bike", name: "Kwik (test)", totalKobo: 250000, pickupEta: "Within 2 hours", deliveryEta: "Today" },
        { courierId: "sim-gig", serviceCode: "sim-standard", name: "GIG Logistics (test)", totalKobo: 180000, pickupEta: "Tomorrow", deliveryEta: "1 to 2 days" },
      ]
    : [
        { courierId: "sim-gig", serviceCode: "sim-interstate", name: "GIG Logistics (test)", totalKobo: 450000, pickupEta: "Tomorrow", deliveryEta: "2 to 4 days" },
        { courierId: "sim-dhl", serviceCode: "sim-express", name: "DHL Express (test)", totalKobo: 900000, pickupEta: "Tomorrow", deliveryEta: "1 to 2 days" },
      ];
  return { token: "sim", at: now.toISOString(), couriers };
}

/** Today in Lagos as yyyy-mm-dd, or tomorrow once it's past 4pm and riders have stopped picking up. */
export function pickupDate(now = new Date()): string {
  const lagos = new Date(now.getTime() + 3600_000); // WAT is UTC+1 all year
  if (lagos.getUTCHours() >= 16) lagos.setUTCDate(lagos.getUTCDate() + 1);
  return lagos.toISOString().slice(0, 10);
}

/** Shipbubble signs webhooks with HMAC-SHA512 of the raw body, keyed with the API key, in x-ship-signature. */
export function verifyShipbubbleSignature(rawBody: string, header: string | null, apiKey: string): boolean {
  if (!header || !apiKey) return false;
  const expected = createHmac("sha512", apiKey).update(rawBody, "utf8").digest();
  const given = Buffer.from(header, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type ShipmentStatus = "pending" | "confirmed" | "picked_up" | "in_transit" | "completed" | "cancelled";

export type ShipbubbleEvent =
  | { kind: "shipment"; shipmentId: string; status: ShipmentStatus; cancelled: boolean; trackingUrl: string | null; trackingCode: string | null }
  | { kind: "other" };

export function parseShipbubbleEvent(body: unknown): ShipbubbleEvent {
  const b = body as {
    event?: string;
    order_id?: string;
    status?: string;
    tracking_url?: string;
    courier?: { tracking_code?: string | null };
  };
  if (!b?.order_id || !b.event?.startsWith("shipment.")) return { kind: "other" };
  return {
    kind: "shipment",
    shipmentId: b.order_id,
    status: (b.status ?? "pending") as ShipmentStatus,
    cancelled: b.event === "shipment.cancelled" || b.status === "cancelled",
    trackingUrl: b.tracking_url ?? null,
    trackingCode: b.courier?.tracking_code ?? null,
  };
}

export const SHIPMENT_LABEL: Record<string, string> = {
  booking: "Booking",
  pending: "Booked, waiting for the courier",
  confirmed: "Courier accepted",
  picked_up: "Picked up",
  in_transit: "On the way",
  completed: "Delivered",
  cancelled: "Cancelled",
};
