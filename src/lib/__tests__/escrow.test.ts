import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { can, dispatchOverdue, escrowConfig, orderTotals, payoutKobo, releaseDue, releaseTime, stepsDone } from "../escrow";
import { parsePaystackEvent, verifyPaystackSignature } from "../paystack";

const cfg = escrowConfig({});

describe("escrow money", () => {
  it("uses the defaults: 2% commission, ₦300 buyer fee, 48h release, 72h dispatch", () => {
    expect(cfg).toEqual({ commissionBps: 200, buyerFeeKobo: 30000, releaseHours: 48, dispatchHours: 72 });
  });
  it("reads overrides and ignores junk", () => {
    expect(escrowConfig({ SAFEPAY_COMMISSION_BPS: "150", SAFEPAY_BUYER_FEE_KOBO: "abc" })).toMatchObject({ commissionBps: 150, buyerFeeKobo: 30000 });
  });
  it("adds the buyer fee on top of the items", () => {
    expect(orderTotals(3850000, 2, cfg)).toEqual({ amountKobo: 7700000, feeKobo: 30000, totalKobo: 7730000 });
  });
  it("pays the shop the items minus commission", () => {
    expect(payoutKobo(3850000, cfg)).toBe(3773000);
    expect(payoutKobo(0, cfg)).toBe(0);
  });
});

describe("order rules", () => {
  it("only lets each step happen from the right status", () => {
    expect(can("PAID", "ship")).toBe(true);
    expect(can("PENDING", "ship")).toBe(false);
    expect(can("SHIPPED", "confirm")).toBe(true);
    expect(can("RELEASED", "dispute")).toBe(false);
    expect(can("REFUNDED", "release")).toBe(false);
    expect(can("DISPUTED", "refund")).toBe(true);
  });
  const now = new Date("2026-11-01T12:00:00Z");
  it("releases delivered orders only after the window", () => {
    const delivered = new Date("2026-10-30T11:00:00Z");
    expect(releaseDue({ status: "DELIVERED", releaseAt: releaseTime(delivered, cfg) }, now)).toBe(true);
    expect(releaseDue({ status: "DELIVERED", releaseAt: releaseTime(new Date("2026-10-31T13:00:00Z"), cfg) }, now)).toBe(false);
    expect(releaseDue({ status: "DISPUTED", releaseAt: releaseTime(delivered, cfg) }, now)).toBe(false);
  });
  it("lets the buyer cancel once the shop is late to dispatch", () => {
    expect(dispatchOverdue({ status: "PAID", paidAt: new Date("2026-10-29T11:00:00Z") }, now, cfg)).toBe(true);
    expect(dispatchOverdue({ status: "PAID", paidAt: new Date("2026-10-31T11:00:00Z") }, now, cfg)).toBe(false);
    expect(dispatchOverdue({ status: "SHIPPED", paidAt: new Date("2026-10-20T11:00:00Z") }, now, cfg)).toBe(false);
  });
  it("counts progress steps", () => {
    expect(stepsDone("PAID")).toBe(1);
    expect(stepsDone("RELEASED")).toBe(4);
  });
});

describe("paystack webhooks", () => {
  const body = JSON.stringify({ event: "charge.success", data: { reference: "oja_abc", amount: 7730000, status: "success" } });
  const sig = createHmac("sha512", "sk_test_x").update(body).digest("hex");
  it("accepts the right signature and rejects others", () => {
    expect(verifyPaystackSignature(body, sig, "sk_test_x")).toBe(true);
    expect(verifyPaystackSignature(body, sig, "sk_test_y")).toBe(false);
    expect(verifyPaystackSignature(body, null, "sk_test_x")).toBe(false);
    expect(verifyPaystackSignature(body, "zz", "sk_test_x")).toBe(false);
  });
  it("parses the events SafePay uses", () => {
    expect(parsePaystackEvent(JSON.parse(body))).toEqual({ kind: "charge", reference: "oja_abc", amountKobo: 7730000 });
    expect(parsePaystackEvent({ event: "transfer.reversed", data: { reference: "payout_oja_abc" } })).toEqual({ kind: "transfer", reference: "payout_oja_abc", status: "reversed" });
    expect(parsePaystackEvent({ event: "refund.processed", data: { transaction_reference: "oja_abc" } })).toEqual({ kind: "refund", reference: "oja_abc" });
    expect(parsePaystackEvent({ event: "charge.success", data: { reference: "x", status: "failed" } })).toEqual({ kind: "other" });
    expect(parsePaystackEvent({ event: "subscription.create" })).toEqual({ kind: "other" });
  });
});
