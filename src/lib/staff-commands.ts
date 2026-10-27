/**
 * Shop staff manage products by messaging the shop's own WhatsApp number from their phone.
 * These are the pure parts: reading their messages, prices in captions, and when to tell the owner about demand.
 */

export type StaffCommand =
  | { kind: "add"; name: string; priceKobo: number; stock: number }
  | { kind: "restock"; query: string | null; units: number }
  | { kind: "soldout"; query: string | null }
  | { kind: "price"; query: string | null; priceKobo: number }
  | { kind: "list" }
  | { kind: "help" };

/** "25000", "25,000", "₦25,000", "N25k", "25.5k" -> kobo. Returns null for anything else. */
export function parseNairaAmount(input: string): number | null {
  const m = /^(?:₦|ngn|n)?\s?(\d[\d,]*(?:\.\d+)?)\s?(k)?$/i.exec(input.trim());
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

const NUMBER = /^\d{1,5}$/;
const STOCK = /^(?:x|qty:?)?(\d{1,5})(?:pcs|pieces|units|left)?$/i;
const MIN_PRICE_KOBO = 100 * 100;

/** Splits "<name> <price> [<stock>]" from the end, so names may contain numbers ("Size 10 gown 15000 2"). */
function nameWithPrice(text: string): { name: string; priceKobo: number; stock: number | null } | null {
  const words = text.split(" ").filter(w => !/^(pcs|pieces|units|left)$/i.test(w));
  for (const withStock of [true, false]) {
    const stockWord = withStock ? words.at(-1) : undefined;
    const stock = stockWord ? STOCK.exec(stockWord) : null;
    if (withStock && !stock) continue;
    const priceAt = words.length - (withStock ? 2 : 1);
    const priceKobo = priceAt > 0 ? parseNairaAmount(words[priceAt]) : null;
    if (!priceKobo || priceKobo < MIN_PRICE_KOBO) continue;
    const name = words.slice(0, priceAt).join(" ").replace(/[-:,]+$/, "").trim();
    if (name.length < 2) return null;
    return { name: name.slice(0, 80), priceKobo, stock: stock ? Number(stock[1]) : null };
  }
  return null;
}

/** Reads a staff member's message. A photo's caption is read as a new product, with or without the word "add". */
export function parseStaffCommand(text: string, hasImage: boolean): StaffCommand | null {
  const t = text.trim().replace(/\s+/g, " ");
  const [first = "", ...rest] = t.split(" ");
  const word = first.toLowerCase();
  const tail = rest.join(" ");

  if (["help", "menu", "?"].includes(word) && !tail) return { kind: "help" };
  if (["list", "products", "stock"].includes(word) && !tail) return { kind: "list" };
  if (NUMBER.test(t) && Number(t) > 0) return { kind: "restock", query: null, units: Number(t) };

  if (word === "restock") {
    const last = rest.at(-1) ?? "";
    if (!NUMBER.test(last) || Number(last) < 1) return null;
    return { kind: "restock", query: rest.slice(0, -1).join(" ") || null, units: Number(last) };
  }
  if (word === "soldout" || /^sold out\b/i.test(t)) {
    return { kind: "soldout", query: t.replace(/^sold ?out\s*/i, "") || null };
  }
  if (word === "price") {
    const kobo = parseNairaAmount(rest.at(-1) ?? "");
    return kobo ? { kind: "price", query: rest.slice(0, -1).join(" ") || null, priceKobo: kobo } : null;
  }
  if (word === "add" || hasImage) {
    const p = nameWithPrice(word === "add" ? tail : t);
    return p ? { kind: "add", name: p.name, priceKobo: p.priceKobo, stock: p.stock ?? 1 } : null;
  }
  return null;
}

export const STAFF_HELP = [
  "Send a photo with a caption to add a product:",
  "  Ankara two-piece 25000 3   (name, price, how many you have)",
  "No photo? Start with add: add Ankara two-piece 25k 3",
  "restock Ankara 10   adds 10 and alerts the waitlist",
  "restock 10   restocks the last product we talked about",
  "sold out Ankara   marks it sold out so buyers can join the waitlist",
  "price Ankara 27000   changes the price",
  "list   shows what is sold out and who is waiting",
].join("\n");

const CAPTION_PRICE = /(?:₦|\bngn\s?|\bn(?=\d)|price:?\s*)(\d[\d,]*(?:\.\d+)?)\s?(k)?|\b(\d[\d,]*(?:\.\d+)?)\s?k\b/i;

/** Turns an Instagram post caption into a product name and, if the caption has one, a price. */
export function productFromCaption(caption: string | null | undefined): { name: string; priceKobo: number | null } {
  const text = caption ?? "";
  const m = CAPTION_PRICE.exec(text);
  const priceKobo = m ? parseNairaAmount(`${m[1] ?? m[3]}${m[2] ?? (m[3] ? "k" : "")}`) : null;
  const firstLine =
    text
      .split("\n")
      .map(l =>
        l
          .replace(/[#@][\p{L}\p{N}_.]+/gu, "")
          .replace(/comment\s+restock[^.!\n]*/gi, "")
          .replace(/[^\p{L}\p{N}\s'&()\-/.,]/gu, "")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .find(l => /\p{L}{2}/u.test(l)) ?? "";
  const name = firstLine.replace(/[\s,.\-]+$/, "").slice(0, 60).trim();
  return { name: name || "Item from Instagram", priceKobo };
}

const MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500];

/** The waitlist size worth telling the owner about, if `waiting` reached one they haven't heard about yet. */
export function demandMilestone(waiting: number, alreadyToldFor: number): number | null {
  const reached = MILESTONES.filter(n => n <= waiting).at(-1);
  return reached && reached > alreadyToldFor ? reached : null;
}
