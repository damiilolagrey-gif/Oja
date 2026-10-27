import type { OrderStatus } from "@prisma/client";

/** SafePay rules. Pure functions only, so they can be unit tested without a database. */

export type EscrowConfig = {
  commissionBps: number; // Oja's cut of the item amount, in basis points (200 = 2%)
  buyerFeeKobo: number; // flat buyer protection fee per order
  releaseHours: number; // after "delivered", money releases unless the buyer reports a problem
  dispatchHours: number; // after payment, the buyer may cancel if the shop hasn't shipped
};

const int = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v != null && v !== "" && Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
};

export function escrowConfig(env: Record<string, string | undefined> = process.env): EscrowConfig {
  return {
    commissionBps: int(env.SAFEPAY_COMMISSION_BPS, 200),
    buyerFeeKobo: int(env.SAFEPAY_BUYER_FEE_KOBO, 30000),
    releaseHours: int(env.SAFEPAY_RELEASE_HOURS, 48),
    dispatchHours: int(env.SAFEPAY_DISPATCH_HOURS, 72),
  };
}

export function orderTotals(unitKobo: number, quantity: number, cfg: EscrowConfig) {
  const amountKobo = unitKobo * quantity;
  return { amountKobo, feeKobo: cfg.buyerFeeKobo, totalKobo: amountKobo + cfg.buyerFeeKobo };
}

/** What the shop receives when the order is released: the item amount minus Oja's commission. */
export function payoutKobo(amountKobo: number, cfg: EscrowConfig): number {
  return amountKobo - Math.round((amountKobo * cfg.commissionBps) / 10000);
}

/** What the shop is actually paid: the payout above minus any delivery Oja booked for it. Never below zero. */
export function shopPayoutKobo(amountKobo: number, shippingKobo: number, cfg: EscrowConfig): number {
  return Math.max(0, payoutKobo(amountKobo, cfg) - shippingKobo);
}

export type OrderAction = "ship" | "deliver" | "confirm" | "dispute" | "cancel" | "release" | "refund";

/** Which statuses each action may start from. Anything else is refused. */
const allowed: Record<OrderAction, OrderStatus[]> = {
  ship: ["PAID"], // shop
  deliver: ["SHIPPED"], // shop
  confirm: ["SHIPPED", "DELIVERED"], // buyer: item is fine, pay the shop
  dispute: ["PAID", "SHIPPED", "DELIVERED"], // buyer: something is wrong, freeze the money
  cancel: ["PAID"], // buyer, only once the dispatch window has passed
  release: ["DELIVERED", "DISPUTED", "SHIPPED"], // auto-release or admin decision
  refund: ["PAID", "DISPUTED"], // admin decision or buyer cancel
};

export const fromStatuses = (action: OrderAction) => allowed[action];
export const can = (status: OrderStatus, action: OrderAction) => allowed[action].includes(status);

export function releaseDue(o: { status: OrderStatus; releaseAt: Date | null }, now: Date): boolean {
  return o.status === "DELIVERED" && o.releaseAt != null && o.releaseAt <= now;
}

export function dispatchOverdue(o: { status: OrderStatus; paidAt: Date | null }, now: Date, cfg: EscrowConfig): boolean {
  return o.status === "PAID" && o.paidAt != null && now.getTime() - o.paidAt.getTime() >= cfg.dispatchHours * 3600_000;
}

export const releaseTime = (deliveredAt: Date, cfg: EscrowConfig) => new Date(deliveredAt.getTime() + cfg.releaseHours * 3600_000);

export const STEPS = ["Paid into SafePay", "Dispatched", "Delivered", "Shop paid"] as const;

/** How many of STEPS are done, for the progress bar. */
export function stepsDone(status: OrderStatus): number {
  switch (status) {
    case "PAID": return 1;
    case "SHIPPED": return 2;
    case "DELIVERED": return 3;
    case "RELEASED": return 4;
    case "DISPUTED": return 3;
    default: return 0;
  }
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Waiting for payment",
  PAID: "Paid, held in SafePay",
  SHIPPED: "Dispatched",
  DELIVERED: "Delivered",
  DISPUTED: "Problem reported",
  RELEASED: "Completed, shop paid",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
};

export const STATUS_TONE: Record<OrderStatus, "good" | "bad" | "gold" | "plain"> = {
  PENDING: "plain",
  PAID: "gold",
  SHIPPED: "gold",
  DELIVERED: "gold",
  DISPUTED: "bad",
  RELEASED: "good",
  REFUNDED: "plain",
  CANCELLED: "plain",
};

export const DISPUTE_REASONS = [
  "Item not as described",
  "Item damaged",
  "Wrong item or size",
  "Fake or counterfeit",
  "Never arrived",
  "Shop hasn't dispatched",
] as const;
