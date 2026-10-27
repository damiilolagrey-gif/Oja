/** Trust badge shown to buyers. Business beats bank; bank needs a payout account checked with the bank (not test mode). */
export type TrustLevel = "business" | "bank" | "none";

export function trustLevel(s: { businessVerifiedAt: Date | null; paystackRecipient: string | null }): TrustLevel {
  if (s.businessVerifiedAt) return "business";
  if (s.paystackRecipient) return "bank";
  return "none";
}

export const TRUST_LABEL: Record<Exclude<TrustLevel, "none">, string> = {
  business: "Business verified",
  bank: "Bank verified",
};

export const TRUST_HELP: Record<Exclude<TrustLevel, "none">, string> = {
  business: "Oja checked this shop's CAC business registration and its bank account name.",
  bank: "The shop's payout account name was confirmed with its bank.",
};

/** RC (company) or BN (business name) numbers as printed on CAC certificates, e.g. RC 1234567 or BN 3456789. */
export function normalizeCac(input: string): string | null {
  const m = input.toUpperCase().replace(/[\s-]/g, "").match(/^(RC|BN|IT)?(\d{4,8})$/);
  if (!m) return null;
  return `${m[1] ?? "RC"} ${m[2]}`;
}
