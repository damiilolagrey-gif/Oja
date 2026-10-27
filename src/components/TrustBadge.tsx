import { TRUST_HELP, TRUST_LABEL, trustLevel } from "@/lib/verification";

export function TrustBadge({ shop }: { shop: { businessVerifiedAt: Date | null; paystackRecipient: string | null } }) {
  const level = trustLevel(shop);
  if (level === "none") return null;
  return <span className={`badge-v ${level}`} title={TRUST_HELP[level]}>✓ {TRUST_LABEL[level]}</span>;
}
