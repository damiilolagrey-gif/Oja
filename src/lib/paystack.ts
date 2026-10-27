import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Paystack client for SafePay. Buyers pay into the platform's Paystack balance; the shop is paid with a
 * transfer on release, and a dispute can end in a refund. Without PAYSTACK_SECRET_KEY every call is skipped
 * and orders run in test mode.
 */

const BASE = "https://api.paystack.co";

export const paystackConfigured = () => Boolean(process.env.PAYSTACK_SECRET_KEY);

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<Result<T>> {
  try {
    const res = await fetch(BASE + path, {
      method: init?.method ?? "GET",
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
    if (!res.ok || !json.status) return { ok: false, error: json.message ?? `Paystack HTTP ${res.status}` };
    return { ok: true, data: json.data as T };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function initializeTransaction(p: { email: string; amountKobo: number; reference: string; callbackUrl: string; metadata: Record<string, unknown> }) {
  return call<{ authorization_url: string }>("/transaction/initialize", {
    method: "POST",
    body: { email: p.email, amount: p.amountKobo, currency: "NGN", reference: p.reference, callback_url: p.callbackUrl, metadata: p.metadata },
  });
}

export function verifyTransaction(reference: string) {
  return call<{ status: string; amount: number; reference: string }>(`/transaction/verify/${encodeURIComponent(reference)}`);
}

export function listBanks() {
  return call<{ name: string; code: string }[]>("/bank?country=nigeria&currency=NGN&perPage=200");
}

export function resolveAccount(accountNumber: string, bankCode: string) {
  return call<{ account_name: string }>(`/bank/resolve?account_number=${accountNumber}&bank_code=${encodeURIComponent(bankCode)}`);
}

export function createRecipient(p: { name: string; accountNumber: string; bankCode: string }) {
  return call<{ recipient_code: string }>("/transferrecipient", {
    method: "POST",
    body: { type: "nuban", name: p.name, account_number: p.accountNumber, bank_code: p.bankCode, currency: "NGN" },
  });
}

export function transfer(p: { amountKobo: number; recipient: string; reference: string; reason: string }) {
  return call<{ status: string; transfer_code: string }>("/transfer", {
    method: "POST",
    body: { source: "balance", amount: p.amountKobo, recipient: p.recipient, reference: p.reference, reason: p.reason },
  });
}

export function refund(transactionReference: string) {
  return call<{ status: string }>("/refund", { method: "POST", body: { transaction: transactionReference } });
}

/** Paystack signs webhooks with HMAC-SHA512 of the raw body, keyed with the secret key, in x-paystack-signature. */
export function verifyPaystackSignature(rawBody: string, header: string | null, secretKey: string): boolean {
  if (!header || !secretKey) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody, "utf8").digest();
  const given = Buffer.from(header, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type PaystackEvent =
  | { kind: "charge"; reference: string; amountKobo: number }
  | { kind: "transfer"; reference: string; status: "success" | "failed" | "reversed" }
  | { kind: "refund"; reference: string }
  | { kind: "other" };

export function parsePaystackEvent(body: unknown): PaystackEvent {
  const b = body as { event?: string; data?: { reference?: string; amount?: number; status?: string; transaction_reference?: string } };
  const d = b?.data ?? {};
  switch (b?.event) {
    case "charge.success":
      return d.reference && d.status === "success" ? { kind: "charge", reference: d.reference, amountKobo: Number(d.amount) } : { kind: "other" };
    case "transfer.success":
    case "transfer.failed":
    case "transfer.reversed":
      return d.reference ? { kind: "transfer", reference: d.reference, status: b.event.slice(9) as "success" | "failed" | "reversed" } : { kind: "other" };
    case "refund.processed":
      return d.transaction_reference ? { kind: "refund", reference: d.transaction_reference } : { kind: "other" };
    default:
      return { kind: "other" };
  }
}
