/**
 * Prompt-to-ad: the vendor types an idea ("Owambe ad for my adire, gold vibe") and gets three finished ad
 * concepts, each with a design (style, headline, colours) and copy for every channel. Pure functions only:
 * the safety rules that keep AI output honest, and a no-AI fallback that reads the prompt for a theme.
 */
import { clip, fitCopy, templateCopy, textOn, validHex, type AdCopy, type StudioProduct, type StudioShop } from "./creative";

export const STYLES = ["bold", "photo", "split", "minimal", "festive"] as const;
export type Style = (typeof STYLES)[number];

export const STYLE_LABEL: Record<Style, string> = {
  bold: "Bold colour",
  photo: "Full photo",
  split: "Side by side",
  minimal: "Clean",
  festive: "Celebration",
};

export type Design = {
  style: Style;
  headline: string; // big text on the image, up to 40 characters
  subline: string; // one short line under it, up to 60
  cta: string; // the button, up to 24
  badge: string | null; // a corner sticker like "New in" or "Only 2 left"
  bg: string; // hex colours
  ink: string;
  accent: string;
};

export type Concept = { angle: string; design: Design; copy: AdCopy };

export const LIMIT = { headline: 40, subline: 60, cta: 24, badge: 18, prompt: 300 } as const;

/** Contrast between two hex colours (WCAG), 1 to 21. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    const [r, g, bl] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const OFFER = /%|\bfree\b|\boff\b|\bdiscount|\bsale\b|\bbogo\b|\bbuy \d+ get\b/i;

/**
 * A badge can't promise what the shop hasn't offered. Numbers must be the real stock or price, and words like
 * "50% off", "free delivery" or "sale" are dropped unless the vendor's own prompt mentions them.
 */
export function safeBadge(badge: string | null | undefined, facts: { stock: number | null; prompt: string }): string | null {
  const b = clip(String(badge ?? "").replace(/\s+/g, " "), LIMIT.badge);
  if (!b) return null;
  if (OFFER.test(b) && !OFFER.test(facts.prompt)) return null;
  const nums = b.match(/\d+/g);
  if (nums && !(facts.stock !== null && facts.stock > 0 && nums.every(n => Number(n) === facts.stock))) return null;
  return b;
}

/** Cleans a design from the AI or an edit: known style, short text, valid colours, readable text. */
export function fitDesign(d: Partial<Design>, facts: { stock: number | null; prompt: string; brand: string }): Design {
  const bg = d.bg && validHex(d.bg) ? d.bg : validHex(facts.brand) ? facts.brand : "#2f3b8f";
  const ink = d.ink && validHex(d.ink) && contrast(d.ink, bg) >= 4.5 ? d.ink : textOn(bg);
  const accent = d.accent && validHex(d.accent) && contrast(d.accent, bg) >= 1.5 ? d.accent : ink === "#ffffff" ? "#ffd166" : "#1f8f5a";
  return {
    style: STYLES.includes(d.style as Style) ? (d.style as Style) : "bold",
    headline: clip(d.headline || "", LIMIT.headline) || "New in",
    subline: clip(d.subline || "", LIMIT.subline),
    cta: clip(d.cta || "", LIMIT.cta) || "Order on WhatsApp",
    badge: safeBadge(d.badge, facts),
    bg,
    ink,
    accent,
  };
}

type Theme = { words: RegExp; style: Style; bg: string; accent: string; headline: (name: string) => string; angle: string };

// Read from the vendor's prompt when the AI is off. Order matters: the first match wins.
const THEMES: Theme[] = [
  { words: /owambe|wedding|aso.?ebi|party|ceremony|engagement/i, style: "festive", bg: "#5b1a2e", accent: "#e6b84a", headline: () => "Owambe ready", angle: "Owambe" },
  { words: /christmas|xmas|detty|december|festive|new year/i, style: "festive", bg: "#123d2b", accent: "#e8c547", headline: () => "Detty December ready", angle: "December" },
  { words: /valentine|love|bae|date night/i, style: "bold", bg: "#9b1d48", accent: "#ffc2d4", headline: () => "Made for love", angle: "Valentine" },
  { words: /eid|sallah|ramadan/i, style: "festive", bg: "#0f3d3e", accent: "#e6c36a", headline: () => "Sallah ready", angle: "Sallah" },
  { words: /gift|birthday|mum|mother|dad|father|anniversary/i, style: "split", bg: "#3b2a6b", accent: "#ffd166", headline: () => "The perfect gift", angle: "Gift" },
  { words: /restock|back in stock|is back|back again/i, style: "bold", bg: "#1f4e8c", accent: "#ffd166", headline: () => "Back in stock", angle: "Back in stock" },
  { words: /new|arrival|drop|launch|just in/i, style: "photo", bg: "#111111", accent: "#ffd166", headline: n => `New in: ${n}`, angle: "New in" },
  { words: /luxury|premium|classy|elegant|quality/i, style: "minimal", bg: "#f5efe6", accent: "#8a6a2f", headline: n => n, angle: "Premium" },
  { words: /sale|promo|discount|deal|cheap|affordable/i, style: "bold", bg: "#c0392b", accent: "#ffe08a", headline: () => "Price you'll love", angle: "Value" },
];

export function themeFor(prompt: string): Theme | null {
  return THEMES.find(t => t.words.test(prompt)) ?? null;
}

/** Three ad concepts without the AI: one in the prompt's theme, one on stock or value, one on safe payment. */
export function templateConcepts(prompt: string, p: StudioProduct, shop: StudioShop, brand: string): Concept[] {
  const copies = templateCopy(p, shop);
  const theme = themeFor(prompt);
  const scarce = p.stock > 0 && p.stock <= 5;
  const facts = { stock: p.stock, prompt, brand };
  const one = fitDesign(
    theme
      ? { style: theme.style, headline: theme.headline(p.name), subline: p.name, cta: "Order on WhatsApp", badge: theme.angle === "New in" ? "New in" : null, bg: theme.bg, accent: theme.accent }
      : { style: "bold", headline: p.name, subline: "Delivered to your door", cta: "Order on WhatsApp", badge: "New in", bg: brand },
    facts,
  );
  const two = fitDesign(
    scarce
      ? { style: "photo", headline: `Only ${p.stock} left`, subline: p.name, cta: "Grab yours", badge: `Only ${p.stock} left`, bg: "#111111" }
      : { style: "split", headline: p.name, subline: "Treat yourself today", cta: "Order on WhatsApp", badge: null, bg: theme?.bg ?? brand },
    facts,
  );
  const three = fitDesign({ style: "minimal", headline: "Pay safely, get it delivered", subline: `${p.name}. Your money is held until it arrives.`, cta: "Chat to order", badge: null, bg: "#f7f3ec", accent: "#1f8f5a" }, facts);
  return [
    { angle: theme?.angle ?? copies[0].angle, design: one, copy: copies[0] },
    { angle: copies[1].angle, design: two, copy: copies[1] },
    { angle: copies[2].angle, design: three, copy: copies[2] },
  ];
}

export const CONCEPT_SYSTEM = `You are the creative director in an ad studio for small Nigerian online shops. The owner describes the ad they want; you return three finished ad concepts. Each concept has a design for the ad image and copy for every channel. Every ad sends buyers to the shop's WhatsApp, where an assistant takes payment.

Design rules:
- style is one of: bold (solid brand colour, photo on top), photo (full-bleed photo with dark fade), split (photo left, text right), minimal (light background, lots of space, premium feel), festive (rich colour with gold accent, for owambe, Sallah, Christmas and other celebrations).
- headline: what the ad says in big letters, under 40 characters. Strong, specific, no hashtags.
- subline: one short supporting line under 60 characters.
- cta: button text under 24 characters, about ordering or chatting on WhatsApp.
- badge: an optional corner sticker under 18 characters ("New in", "Owambe ready"). Use the real stock number only if stock is 5 or less. Never write discounts, "free", "sale" or "% off" unless the owner said so. Use null for no badge.
- bg, ink, accent: hex colours like #5b1a2e. ink must be easy to read on bg. Match the mood the owner asked for; otherwise use the brand colour.
- Make the three concepts genuinely different: different style, colours and angle.

Copy rules:
- Write for Nigerian shoppers. Natural, warm, confident. Light Nigerian flavour is fine; no heavy Pidgin unless asked.
- Use only the facts given: name, price, stock, options, description and the owner's prompt. Never invent discounts, free delivery, delivery times, sizes, materials or reviews.
- Prices in naira with the ₦ sign, as given.
- Limits: Instagram caption under 300 characters; up to 8 hashtags without spaces; Facebook primary text under 125 and headline under 40; TikTok ad text under 100 with no emoji; Google headlines under 30 each (3 to 5); Google descriptions under 90 (2); WhatsApp Status under 140.`;

export function conceptBrief(prompt: string, p: StudioProduct, shop: StudioShop, brand: string): string {
  return `The owner's idea: ${prompt.slice(0, LIMIT.prompt)}

Shop: ${shop.name}${shop.igHandle ? ` (Instagram @${shop.igHandle.replace(/^@/, "")})` : ""}
Brand colour: ${brand}
Brand voice: ${shop.brandVoice?.trim() || "friendly and professional"}
Product: ${p.name}
Price: ₦${Math.round(p.priceKobo / 100).toLocaleString("en-NG")}
Stock: ${p.stock > 0 ? p.stock : "sold out (invite people to join the restock list on WhatsApp)"}
${p.options?.length ? `Options: ${p.options.join(", ")}\n` : ""}${p.description ? `Description: ${p.description.slice(0, 600)}\n` : ""}
Return 3 ad concepts.`;
}

/** Makes a whole concept safe to show and post: the design and the copy. */
export function fitConcept(c: Concept, facts: { stock: number | null; prompt: string; brand: string }): Concept {
  return { angle: clip(c.angle || "Ad", 40), design: fitDesign(c.design, facts), copy: fitCopy(c.copy) };
}
