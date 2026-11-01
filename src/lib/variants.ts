/**
 * Product options (sizes, colours) with their own stock. Pure functions only, so they can be unit tested.
 * When a product has options, its own stock is kept as the total of their stock, so lists, alerts and the
 * catalogue keep working without knowing about options.
 */
import { naira } from "./format";

export type Variant = { id: string; label: string; stock: number; priceKobo: number | null; archived?: boolean };

export const MAX_VARIANTS = 30;

/** "8, 10, 12" or one per line → ["8", "10", "12"]. Trims, drops blanks and repeats (ignoring case). */
export function parseOptions(text: string): { labels: string[]; error: string | null } {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const raw of text.split(/[\n,]/)) {
    const label = raw.trim().replace(/\s+/g, " ");
    if (!label) continue;
    if (label.length > 40) return { labels: [], error: `"${label.slice(0, 20)}…" is too long. Keep each option under 40 characters.` };
    const k = label.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    labels.push(label);
  }
  if (!labels.length) return { labels, error: "Type at least one option, like 8, 10, 12." };
  if (labels.length > MAX_VARIANTS) return { labels: [], error: `Up to ${MAX_VARIANTS} options per product.` };
  return { labels, error: null };
}

export const live = <V extends Variant>(vs: V[]) => vs.filter(v => !v.archived);

export const totalStock = (vs: Variant[]) => live(vs).reduce((n, v) => n + Math.max(0, v.stock), 0);

export const unitPrice = (productPriceKobo: number, v?: Pick<Variant, "priceKobo"> | null) => v?.priceKobo ?? productPriceKobo;

/** "Adire maxi dress (Size 12)": the name on the order, the receipt and the restock message. */
export const itemName = (productName: string, v?: Pick<Variant, "label"> | null) => (v ? `${productName} (${v.label})` : productName);

/** One line for a product card or the AI's brief: "Options: 8, 10 (1 left), 12 sold out". */
export function optionsLine(productPriceKobo: number, vs: Variant[]): string | null {
  const shown = live(vs);
  if (!shown.length) return null;
  return (
    "Options: " +
    shown
      .map(v => {
        const price = v.priceKobo !== null && v.priceKobo !== productPriceKobo ? ` ${naira(v.priceKobo)}` : "";
        const stock = v.stock <= 0 ? " sold out" : v.stock <= 2 ? ` (${v.stock} left)` : "";
        return `${v.label}${price}${stock}`;
      })
      .join(", ")
  );
}

/**
 * Picks the option a buyer chose. Products without options need none. With options, the id must be one of
 * them and not removed; the error is worded for the AI or the shop page to act on.
 */
export function chooseVariant<V extends Variant>(vs: V[], id: unknown): { ok: true; variant: V | null } | { ok: false; error: string } {
  const shown = live(vs);
  if (!shown.length) return { ok: true, variant: null };
  const v = typeof id === "string" ? shown.find(x => x.id === id) : undefined;
  if (!v) return { ok: false, error: `Ask which option they want: ${shown.map(x => x.label).join(", ")}.` };
  return { ok: true, variant: v };
}

/** Whether a waiting buyer should hear about a restock of this option: they wanted it, or any option. */
export const restockReaches = (wantedVariantId: string | null, restockedVariantId: string | null) =>
  restockedVariantId === null || wantedVariantId === null || wantedVariantId === restockedVariantId;
