/**
 * Creative studio rules: what each ad platform allows, the WhatsApp link every ad points to, the copy the AI
 * writes (cut to each platform's limits), a no-AI fallback, and the image sizes. Pure functions only.
 */
import { naira } from "./format";

/** The text limits each platform enforces or truncates at. */
export const LIMITS = {
  instagramCaption: 300, // Instagram allows 2,200 but cuts the feed preview after ~125; ads read best short
  hashtags: 8,
  facebookPrimary: 125, // shown without "See more"
  facebookHeadline: 40,
  tiktokAdText: 100, // TikTok ad text is 1-100 characters, no emoji
  googleHeadline: 30, // responsive search ad headline
  googleHeadlines: 5,
  googleDescription: 90,
  googleDescriptions: 2,
  whatsappStatus: 140,
} as const;

export type AdCopy = {
  angle: string; // the idea behind this set, e.g. "Scarcity" or "Gift"
  instagram: { caption: string; hashtags: string[] };
  facebook: { primaryText: string; headline: string };
  tiktok: { adText: string };
  google: { headlines: string[]; descriptions: string[] };
  whatsappStatus: string;
};

export type StudioProduct = { id: string; name: string; priceKobo: number; stock: number; description: string | null; options?: string[] };
export type StudioShop = { name: string; slug: string; whatsappNumber: string | null; igHandle: string | null; brandVoice?: string | null };

/** Where every ad sends people: a WhatsApp chat with the product already typed, so the AI agent can sell. */
export function orderLink(shop: StudioShop, p: Pick<StudioProduct, "id" | "name">, appUrl: string): string {
  if (shop.whatsappNumber) {
    const text = `Hi ${shop.name}, I'd like the ${p.name}`;
    return `https://wa.me/${shop.whatsappNumber}?text=${encodeURIComponent(text)}`;
  }
  return `${appUrl}/s/${shop.slug}/buy/${p.id}`;
}

/** Cuts text to a limit at a word boundary, without leaving dangling punctuation. */
export function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : t.slice(0, max)).replace(/[\s,;:–-]+$/, "");
}

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
export const stripEmoji = (s: string) => s.replace(EMOJI, "").replace(/\s{2,}/g, " ").trim();

const tag = (s: string) => {
  const t = s.replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, "");
  return t ? `#${t}` : "";
};

/** Makes AI (or hand-edited) copy safe to paste into each platform: lengths, counts, no emoji on TikTok. */
export function fitCopy(c: AdCopy): AdCopy {
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];
  return {
    angle: clip(c.angle || "Ad", 40),
    instagram: {
      caption: clip(c.instagram.caption, LIMITS.instagramCaption),
      hashtags: uniq(c.instagram.hashtags.map(tag)).slice(0, LIMITS.hashtags),
    },
    facebook: { primaryText: clip(c.facebook.primaryText, LIMITS.facebookPrimary), headline: clip(c.facebook.headline, LIMITS.facebookHeadline) },
    tiktok: { adText: clip(stripEmoji(c.tiktok.adText), LIMITS.tiktokAdText) },
    google: {
      headlines: uniq(c.google.headlines.map(h => clip(stripEmoji(h), LIMITS.googleHeadline))).slice(0, LIMITS.googleHeadlines),
      descriptions: uniq(c.google.descriptions.map(d => clip(stripEmoji(d), LIMITS.googleDescription))).slice(0, LIMITS.googleDescriptions),
    },
    whatsappStatus: clip(c.whatsappStatus, LIMITS.whatsappStatus),
  };
}

/** Copy without the AI, so the studio works before an API key is added. Three angles from the product's facts. */
export function templateCopy(p: StudioProduct, shop: StudioShop): AdCopy[] {
  const price = naira(p.priceKobo);
  const handle = shop.igHandle ? `@${shop.igHandle.replace(/^@/, "")}` : shop.name;
  const detail = p.description ? ` ${clip(p.description, 80)}.` : "";
  const sizes = p.options?.length ? ` Available in ${p.options.slice(0, 5).join(", ")}.` : "";
  const scarce = p.stock > 0 && p.stock <= 5;
  const baseTags = ["NaijaFashion", "LagosVendor", "ShopSmallNG", shop.name.replace(/\s+/g, "")];
  const sets: AdCopy[] = [
    {
      angle: "Straight to the point",
      instagram: { caption: `${p.name}, ${price}.${detail}${sizes} Tap the link or send us a DM on WhatsApp to order. Pay safely, delivered to your door.`, hashtags: baseTags },
      facebook: { primaryText: `${p.name} for ${price}. Order on WhatsApp in a minute and pay safely.`, headline: `${p.name}, ${price}` },
      tiktok: { adText: `${p.name} for ${price}. Order on WhatsApp, pay safely, delivered to you.` },
      google: { headlines: [p.name, `Only ${price}`, "Order on WhatsApp"], descriptions: [`${p.name} from ${shop.name}. Order on WhatsApp and pay safely.`, "Your money is held until your order arrives."] },
      whatsappStatus: `New in: ${p.name}, ${price}. Reply to this status to order.`,
    },
    {
      angle: scarce ? "Few left" : "Treat yourself",
      instagram: {
        caption: scarce
          ? `Only ${p.stock} left! ${p.name} keeps selling out.${sizes} Send us a WhatsApp message now before it's gone. ${price}.`
          : `You deserve this. ${p.name}, ${price}.${detail} Message us on WhatsApp and it's on its way.`,
        hashtags: [...baseTags, scarce ? "SellingFast" : "TreatYourself"],
      },
      facebook: {
        primaryText: scarce ? `Only ${p.stock} left of the ${p.name}. Order on WhatsApp before it sells out.` : `Treat yourself to the ${p.name}. ${price}, delivered.`,
        headline: scarce ? `Only ${p.stock} left` : `${p.name}, ${price}`,
      },
      tiktok: { adText: scarce ? `Only ${p.stock} left. ${p.name}, ${price}. Order on WhatsApp now.` : `Treat yourself: ${p.name}, ${price}. Order on WhatsApp.` },
      google: { headlines: [p.name, scarce ? "Almost Sold Out" : "Treat Yourself Today", `${price} Delivered`], descriptions: [`Get the ${p.name} from ${shop.name}. Order in minutes on WhatsApp.`, "Pay safely. Fast delivery across Nigeria."] },
      whatsappStatus: scarce ? `Only ${p.stock} ${p.name} left at ${price}. Reply to grab one.` : `Treat yourself: ${p.name}, ${price}. Reply to order.`,
    },
    {
      angle: "Safe to buy",
      instagram: { caption: `Worried about online vendors? With ${handle} your money is held safely until your ${p.name} arrives. ${price}. Order on WhatsApp.`, hashtags: [...baseTags, "BuySafe"] },
      facebook: { primaryText: `Pay for the ${p.name} safely: your money is held until it arrives. Order on WhatsApp.`, headline: "Pay safely, get it delivered" },
      tiktok: { adText: `No more 'what I ordered vs what I got'. Your money is held until your ${p.name} arrives.` },
      google: { headlines: [p.name, "Pay Safely Online", "Money Held Till Delivery"], descriptions: [`${p.name} for ${price}. Your payment is held until you confirm delivery.`, `Order from ${shop.name} on WhatsApp.`] },
      whatsappStatus: `${p.name}, ${price}. Pay safely: your money is held until it arrives. Reply to order.`,
    },
  ];
  return sets.map(fitCopy);
}

export const COPY_SYSTEM = `You write ad copy for small Nigerian online shops that sell on Instagram and WhatsApp. Every ad sends people to the shop's WhatsApp to order, where an assistant takes payment.

Rules:
- Write for Nigerian shoppers. Natural, warm, confident. Light Nigerian flavour is fine; no heavy Pidgin unless the brand voice asks for it.
- Use only the facts given: name, price, stock, options, description. Never invent discounts, free delivery, delivery times, sizes, materials or reviews.
- Prices in naira with the ₦ sign, as given.
- The call to action is always to order or chat on WhatsApp.
- Each set has a different angle (for example: straight offer, few left, gift, quality or craft, pay safely). If stock is 5 or less, one set may use "few left" with the real number.
- Respect the limits: Instagram caption under 300 characters; up to 8 hashtags without spaces; Facebook primary text under 125 and headline under 40; TikTok ad text under 100 with no emoji; Google headlines under 30 each (3 to 5); Google descriptions under 90 (2); WhatsApp Status under 140.`;

export function copyBrief(p: StudioProduct, shop: StudioShop, angleHint?: string): string {
  return `Shop: ${shop.name}${shop.igHandle ? ` (Instagram @${shop.igHandle.replace(/^@/, "")})` : ""}
Brand voice: ${shop.brandVoice?.trim() || "friendly and professional"}
Product: ${p.name}
Price: ${naira(p.priceKobo)}
Stock: ${p.stock > 0 ? p.stock : "sold out (write copy that invites people to join the restock list on WhatsApp)"}
${p.options?.length ? `Options: ${p.options.join(", ")}\n` : ""}${p.description ? `Description: ${p.description.slice(0, 600)}\n` : ""}${angleHint ? `The owner wants this angle: ${angleHint.slice(0, 200)}\n` : ""}
Write 3 sets of ad copy, each with a different angle.`;
}

/** Ad image sizes. Feed square suits Instagram and Facebook; story suits Status, Stories, Reels and TikTok. */
export const SIZES = {
  square: { w: 1080, h: 1080, label: "Square: Instagram & Facebook feed" },
  portrait: { w: 1080, h: 1350, label: "Portrait: Instagram feed" },
  story: { w: 1080, h: 1920, label: "Story: WhatsApp Status, Stories, Reels, TikTok" },
  landscape: { w: 1200, h: 628, label: "Landscape: Facebook link & Google display" },
} as const;
export type SizeKey = keyof typeof SIZES;

/** Text drawn on a light or dark colour needs the opposite. Returns "#111" or "#fff" for a hex brand colour. */
export function textOn(hex: string): "#111111" | "#ffffff" {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? "#111111" : "#ffffff";
}

export const validHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s.trim());
