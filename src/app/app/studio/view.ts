import { naira } from "@/lib/format";
import type { Design } from "@/lib/concepts";
import type { Item } from "./draw";

type Row = { id: string; design: unknown; productId: string | null; product: { name: string; priceKobo: number; imageUrl: string | null } | null };

/** What the canvas needs for a saved ad: its design, the item's name and price, and the photo to use. */
export function adView(c: Row, shopName: string): { design: Design; item: Item; photo: string | null } | null {
  if (!c.design) return null;
  const { item: loose, ...design } = c.design as Design & { item?: { name: string; priceKobo: number } };
  const name = c.product?.name ?? loose?.name ?? "Your item";
  const priceKobo = c.product?.priceKobo ?? loose?.priceKobo ?? 0;
  return {
    design,
    item: { name, price: priceKobo ? naira(priceKobo) : "", shopName },
    photo: c.product?.imageUrl && c.productId ? `/app/studio/photo/${c.productId}` : null,
  };
}
