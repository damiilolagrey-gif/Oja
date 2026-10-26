import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { escrowConfig, shopPayoutKobo } from "../escrow";
import { parseShipbubbleEvent, pickupDate, simulatedQuote, toCourier, verifyShipbubbleSignature } from "../shipbubble";

const cfg = escrowConfig({});

describe("shopPayoutKobo", () => {
  it("takes the delivery fee out after commission", () => expect(shopPayoutKobo(2_000_000, 250_000, cfg)).toBe(1_710_000));
  it("is the plain payout without delivery", () => expect(shopPayoutKobo(2_000_000, 0, cfg)).toBe(1_960_000));
  it("never goes below zero", () => expect(shopPayoutKobo(100_000, 500_000, cfg)).toBe(0));
});

describe("simulatedQuote", () => {
  it("offers same-day bikes within a city", () => {
    const q = simulatedQuote("Lagos", " lagos ");
    expect(q.token).toBe("sim");
    expect(q.couriers.map(c => c.name)).toContain("Kwik (test)");
  });
  it("offers interstate couriers between cities", () => {
    expect(simulatedQuote("Lagos", "Abuja").couriers.every(c => c.totalKobo >= 450_000)).toBe(true);
  });
});

describe("pickupDate", () => {
  it("is today in Lagos before 4pm", () => expect(pickupDate(new Date("2026-11-02T13:59:00Z"))).toBe("2026-11-02"));
  it("rolls to tomorrow from 4pm Lagos time", () => expect(pickupDate(new Date("2026-11-02T15:00:00Z"))).toBe("2026-11-03"));
  it("uses the Lagos date just after midnight", () => expect(pickupDate(new Date("2026-11-02T23:30:00Z"))).toBe("2026-11-03"));
});

describe("toCourier", () => {
  it("converts naira prices to kobo", () => {
    expect(toCourier({ courier_id: 12, courier_name: "Kwik", service_code: "kwik_bike", total: 2450.5, pickup_eta: "Today" })).toEqual({
      courierId: "12", serviceCode: "kwik_bike", name: "Kwik", totalKobo: 245050, pickupEta: "Today", deliveryEta: null,
    });
  });
});

describe("Shipbubble webhooks", () => {
  const key = "sb_sandbox_test";
  const body = JSON.stringify({ event: "shipment.status.changed", order_id: "SB-1", status: "completed", tracking_url: "https://t/1", courier: { tracking_code: "T9" } });
  const sig = createHmac("sha512", key).update(body).digest("hex");

  it("accepts a correct signature", () => expect(verifyShipbubbleSignature(body, sig, key)).toBe(true));
  it("rejects a tampered body", () => expect(verifyShipbubbleSignature(body + " ", sig, key)).toBe(false));
  it("rejects a missing signature or key", () => {
    expect(verifyShipbubbleSignature(body, null, key)).toBe(false);
    expect(verifyShipbubbleSignature(body, sig, "")).toBe(false);
  });
  it("parses a status change", () => {
    expect(parseShipbubbleEvent(JSON.parse(body))).toEqual({
      kind: "shipment", shipmentId: "SB-1", status: "completed", cancelled: false, trackingUrl: "https://t/1", trackingCode: "T9",
    });
  });
  it("flags cancellations", () => {
    const ev = parseShipbubbleEvent({ event: "shipment.cancelled", order_id: "SB-2", status: "cancelled" });
    expect(ev.kind === "shipment" && ev.cancelled).toBe(true);
  });
  it("ignores wallet events", () => expect(parseShipbubbleEvent({ event: "wallet.threshold.alert", amount: 1000 }).kind).toBe("other"));
});
