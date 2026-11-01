/**
 * Ads manager rules: the three ad platforms and what each needs before real ads can run, the tracked WhatsApp
 * link each campaign uses (so a chat or an order can be traced back to the ad that brought it), campaign
 * validation, and the results maths. Pure functions only.
 */
import type { StudioProduct, StudioShop } from "./creative";
import { naira, toKobo } from "./format";

export type Platform = "META" | "GOOGLE" | "TIKTOK";
export type CampaignState = "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED";

export const PLATFORMS: Record<Platform, { label: string; short: string; places: string; needs: string[] }> = {
  META: {
    label: "Facebook & Instagram",
    short: "Meta",
    places: "Instagram feed, Stories and Reels, Facebook feed, and click-to-WhatsApp ads",
    needs: [
      "A Meta Business account (business.facebook.com) with the business verified",
      "An ad account in that business, with your own card added for payment",
      "Your Facebook Page and Instagram account added to the business",
    ],
  },
  GOOGLE: {
    label: "Google",
    short: "Google",
    places: "Google Search, YouTube and Google's partner sites",
    needs: [
      "A Google Ads account (ads.google.com) with your own card added for payment",
      "Advertiser verification, which Google asks for after your first ads",
    ],
  },
  TIKTOK: {
    label: "TikTok",
    short: "TikTok",
    places: "the TikTok For You feed",
    needs: [
      "A TikTok Ads Manager account (ads.tiktok.com) with your own card added for payment",
      "Your business details approved by TikTok",
    ],
  },
};

export const PLATFORM_KEYS = Object.keys(PLATFORMS) as Platform[];

/** Nigeria's 36 states and the FCT, for location targeting. */
export const NG_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi",
  "Edo", "Ekiti", "Enugu", "FCT Abuja", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara",
  "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
] as const;

export const BUDGET = { minKobo: 1_000_00, maxKobo: 5_000_000_00 } as const;
export const DAYS = { min: 1, max: 60 } as const;
export const AGES = { min: 18, max: 65 } as const;

// No 0/O, 1/I/L, so a code read off a screen or typed by hand still matches.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

const DIGITS = "23456789";

/**
 * A short campaign code. It always ends in a digit, so an ordinary word after "ref" ("ref thanks") is never
 * read as a code. `random` returns an integer in [0, n), so tests can pass their own.
 */
export function newCode(random: (n: number) => number): string {
  let s = "";
  for (let i = 0; i < CODE_LENGTH - 1; i++) s += CODE_CHARS[random(CODE_CHARS.length)];
  return s + DIGITS[random(DIGITS.length)];
}

const REF = new RegExp(`\\bref(?:[\\s:#-]+)([${CODE_CHARS}]{${CODE_LENGTH - 1}}[${DIGITS}])\\b`, "i");

/** Finds a campaign code in a buyer's first message, e.g. "Hi, I'd like the dress (ref K7Q2M4)". */
export function parseRef(text: string): string | null {
  const m = REF.exec(text);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Where a campaign's ads send people. A WhatsApp chat with the product and the campaign code already typed, so
 * the chat is credited to the ad. Without a WhatsApp number, the shop's checkout page with the code in the link.
 */
export function campaignLink(shop: StudioShop, p: Pick<StudioProduct, "id" | "name"> | null, code: string, appUrl: string): string {
  if (shop.whatsappNumber) {
    const text = p ? `Hi ${shop.name}, I'd like the ${p.name} (ref ${code})` : `Hi ${shop.name}, I saw your ad (ref ${code})`;
    return `https://wa.me/${shop.whatsappNumber}?text=${encodeURIComponent(text)}`;
  }
  return p ? `${appUrl}/s/${shop.slug}/buy/${p.id}?c=${code}` : `${appUrl}/s/${shop.slug}?c=${code}`;
}

export type CampaignInput = {
  platform: Platform;
  name: string;
  dailyBudgetKobo: number;
  days: number;
  locations: string[]; // empty means all of Nigeria
  ageMin: number;
  ageMax: number;
};

/** Checks the new-campaign form. Errors are written for the shop owner. */
export function validateCampaign(raw: {
  platform: string;
  name: string;
  dailyBudget: string;
  days: string;
  locations: string[];
  ageMin: string;
  ageMax: string;
}): { ok: true; value: CampaignInput } | { ok: false; error: string } {
  if (!PLATFORM_KEYS.includes(raw.platform as Platform)) return { ok: false, error: "Pick where the ad will run." };
  const name = raw.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, error: "Give the campaign a name, like \"Adire December\"." };
  if (name.length > 80) return { ok: false, error: "Keep the name under 80 characters." };

  const dailyBudgetKobo = toKobo(raw.dailyBudget);
  if (!Number.isFinite(dailyBudgetKobo) || dailyBudgetKobo < BUDGET.minKobo)
    return { ok: false, error: `The daily budget must be at least ${naira(BUDGET.minKobo)}. Ad platforms barely show ads below that.` };
  if (dailyBudgetKobo > BUDGET.maxKobo) return { ok: false, error: `The daily budget can be up to ${naira(BUDGET.maxKobo)}.` };

  const days = Number(raw.days);
  if (!Number.isInteger(days) || days < DAYS.min || days > DAYS.max) return { ok: false, error: `Run it for ${DAYS.min} to ${DAYS.max} days.` };

  const known = new Set<string>(NG_STATES);
  const locations = [...new Set(raw.locations.map(s => s.trim()).filter(Boolean))];
  const unknown = locations.find(l => !known.has(l));
  if (unknown) return { ok: false, error: `"${unknown}" isn't a Nigerian state.` };

  const ageMin = Number(raw.ageMin);
  const ageMax = Number(raw.ageMax);
  if (![ageMin, ageMax].every(a => Number.isInteger(a) && a >= AGES.min && a <= AGES.max))
    return { ok: false, error: `Ages must be between ${AGES.min} and ${AGES.max}.` };
  if (ageMin > ageMax) return { ok: false, error: "The youngest age is above the oldest." };

  return { ok: true, value: { platform: raw.platform as Platform, name, dailyBudgetKobo, days, locations, ageMin, ageMax } };
}

export const totalBudget = (dailyKobo: number, days: number) => dailyKobo * days;

export const placesLine = (locations: string[]) =>
  locations.length === 0 ? "All of Nigeria" : locations.length <= 3 ? locations.join(", ") : `${locations.slice(0, 3).join(", ")} and ${locations.length - 3} more`;

/** What the owner can do to a campaign in each state. */
export const NEXT: Record<CampaignState, ("start" | "pause" | "resume" | "end")[]> = {
  DRAFT: ["start", "end"],
  ACTIVE: ["pause", "end"],
  PAUSED: ["resume", "end"],
  ENDED: [],
};

export const STATUS_LABEL: Record<CampaignState, string> = { DRAFT: "Draft", ACTIVE: "Running", PAUSED: "Paused", ENDED: "Ended" };

export type Results = {
  chats: number;
  orders: number;
  revenueKobo: number;
  spendKobo: number; // what the shop says it paid the platform; 0 until known
  costPerChatKobo: number | null;
  costPerOrderKobo: number | null;
  returnOnSpend: number | null; // revenue ÷ spend, e.g. 4.2 means ₦4.20 back for every ₦1
  chatToOrder: number | null; // share of chats that bought
};

/** The numbers on a campaign card. Cost figures stay empty until spend is known, so nothing is made up. */
export function results(r: { chats: number; orders: number; revenueKobo: number; spendKobo: number; chatOrders?: number }): Results {
  const spend = Math.max(0, r.spendKobo);
  const { chatOrders = r.orders, ...rest } = r;
  return {
    ...rest,
    spendKobo: spend,
    costPerChatKobo: spend && r.chats ? Math.round(spend / r.chats) : null,
    costPerOrderKobo: spend && r.orders ? Math.round(spend / r.orders) : null,
    returnOnSpend: spend ? r.revenueKobo / spend : null,
    // Orders from the checkout link have no chat, so only orders that came through a chat count here.
    chatToOrder: r.chats ? Math.min(1, chatOrders / r.chats) : null,
  };
}

/** One sentence for the campaign card, in plain words. */
export function verdict(r: Results): string {
  if (!r.chats && !r.orders) return "No chats from this ad yet.";
  const people = `${r.chats} chat${r.chats === 1 ? "" : "s"} and ${r.orders} order${r.orders === 1 ? "" : "s"} worth ${naira(r.revenueKobo)}`;
  if (r.returnOnSpend === null) return `${people}. Add what you've spent to see the cost per order.`;
  const back = r.returnOnSpend >= 1 ? `${naira(Math.round(r.returnOnSpend * 100))} back for every ₦1 spent` : "less back than you spent so far";
  return `${people}: ${back}.`;
}
