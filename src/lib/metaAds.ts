import { decrypt } from "./crypto";

/**
 * Facebook + Instagram ads through the Meta Marketing API, on the shop's own ad account and Page. Meta bills
 * the shop's card directly; Oja never holds ad money. A shop that hasn't connected an ad account gets a
 * simulated campaign so the flow can be tried.
 */

const version = () => process.env.META_ADS_API_VERSION || "v25.0";
const BASE = () => process.env.META_GRAPH_BASE_URL || "https://graph.facebook.com"; // override only to point at a mock in tests

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type AdsCreds = {
  metaAdAccountId: string | null;
  metaPageId: string | null;
  metaIgUserId: string | null;
  metaAdsTokenEnc: string | null;
};

export const metaAdsConnected = (s: AdsCreds) => Boolean(s.metaAdAccountId && s.metaPageId && s.metaAdsTokenEnc);

export const PLATFORMS = { facebook: "Facebook", instagram: "Instagram" } as const;
export type Platform = keyof typeof PLATFORMS;

/** "act_123", "123" and "act_ 123" all become "123". */
export function normalizeAdAccountId(raw: string): string | null {
  const digits = raw.trim().replace(/^act_/i, "").replace(/\s/g, "");
  return /^\d{5,20}$/.test(digits) ? digits : null;
}

async function call<T>(token: string, path: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<Result<T>> {
  try {
    const res = await fetch(`${BASE()}/${version()}/${path}`, {
      method: init?.method ?? "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; error_user_msg?: string } };
    if (!res.ok || json.error) return { ok: false, error: json.error?.error_user_msg || json.error?.message || `Meta HTTP ${res.status}` };
    return { ok: true, data: json };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Checks the token can see the ad account, and that it bills in naira (budgets are sent in kobo). */
export async function checkAdAccount(token: string, adAccountId: string) {
  const r = await call<{ currency: string; name: string; account_status: number }>(token, `act_${adAccountId}?fields=currency,name,account_status`);
  if (!r.ok) return r;
  if (r.data.currency !== "NGN") return { ok: false as const, error: `That ad account bills in ${r.data.currency}. Use an ad account set to Nigerian naira (NGN).` };
  if (r.data.account_status !== 1) return { ok: false as const, error: "That ad account isn't active. Check it in Meta Ads Manager." };
  return { ok: true as const, data: r.data.name };
}

export type AdPlan = {
  name: string;
  platforms: Platform[];
  dailyKobo: number;
  start: Date;
  end: Date;
  geo: { countries: string[] } | { cities: { key: string; radius: number; distance_unit: "kilometer" }[] };
  link: string;
  message: string;
  pictureUrl: string | null;
};

export function endDate(start: Date, days: number) {
  return new Date(start.getTime() + days * 24 * 3600_000);
}

/** Ad set body. Pure, so the shape is unit tested. Budget in kobo, the naira account's minor unit. */
export function adSetBody(campaignId: string, p: AdPlan) {
  return {
    name: p.name,
    campaign_id: campaignId,
    daily_budget: p.dailyKobo,
    start_time: p.start.toISOString(),
    end_time: p.end.toISOString(),
    billing_event: "IMPRESSIONS",
    optimization_goal: "LINK_CLICKS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: {
      geo_locations: p.geo,
      age_min: 18,
      publisher_platforms: p.platforms,
      targeting_automation: { advantage_audience: 0 },
    },
    status: "ACTIVE",
  };
}

export function creativeBody(pageId: string, igUserId: string | null, p: AdPlan) {
  return {
    name: `${p.name} creative`,
    object_story_spec: {
      page_id: pageId,
      ...(igUserId && p.platforms.includes("instagram") ? { instagram_user_id: igUserId } : {}),
      link_data: {
        link: p.link,
        message: p.message,
        ...(p.pictureUrl ? { picture: p.pictureUrl } : {}),
        call_to_action: { type: "SHOP_NOW", value: { link: p.link } },
      },
    },
  };
}

/** Finds Meta's key for a Nigerian city, for city targeting. */
export async function cityKey(token: string, city: string): Promise<Result<string>> {
  const q = new URLSearchParams({ type: "adgeolocation", location_types: '["city"]', q: city, country_code: "NG" });
  const r = await call<{ data: { key: string; name: string }[] }>(token, `search?${q}`);
  if (!r.ok) return r;
  const hit = r.data.data.find(c => c.name.toLowerCase() === city.toLowerCase()) ?? r.data.data[0];
  return hit ? { ok: true, data: hit.key } : { ok: false, error: `Meta doesn't recognise "${city}" as a city` };
}

export type Launched = { campaignId: string; adSetId: string; adId: string };

/**
 * Creates campaign → ad set → creative → ad. If a later step fails, the campaign is deleted so nothing half-made
 * is left on the shop's account.
 */
export async function launch(shop: AdsCreds, p: AdPlan): Promise<Result<Launched>> {
  const token = decrypt(shop.metaAdsTokenEnc!);
  const act = `act_${shop.metaAdAccountId}`;
  const campaign = await call<{ id: string }>(token, `${act}/campaigns`, {
    method: "POST",
    body: { name: p.name, objective: "OUTCOME_TRAFFIC", status: "ACTIVE", special_ad_categories: [], is_adset_budget_sharing_enabled: false },
  });
  if (!campaign.ok) return campaign;
  const undo = async (error: string): Promise<Result<Launched>> => {
    await call(token, campaign.data.id, { method: "POST", body: { status: "DELETED" } });
    return { ok: false, error };
  };
  const adSet = await call<{ id: string }>(token, `${act}/adsets`, { method: "POST", body: adSetBody(campaign.data.id, p) });
  if (!adSet.ok) return undo(adSet.error);
  const creative = await call<{ id: string }>(token, `${act}/adcreatives`, { method: "POST", body: creativeBody(shop.metaPageId!, shop.metaIgUserId, p) });
  if (!creative.ok) return undo(creative.error);
  const ad = await call<{ id: string }>(token, `${act}/ads`, {
    method: "POST",
    body: { name: p.name, adset_id: adSet.data.id, creative: { creative_id: creative.data.id }, status: "ACTIVE" },
  });
  if (!ad.ok) return undo(ad.error);
  return { ok: true, data: { campaignId: campaign.data.id, adSetId: adSet.data.id, adId: ad.data.id } };
}

export function setCampaignStatus(shop: AdsCreds, campaignId: string, status: "ACTIVE" | "PAUSED") {
  return call<{ success: boolean }>(decrypt(shop.metaAdsTokenEnc!), campaignId, { method: "POST", body: { status } });
}

export type Insights = { spendKobo: number; impressions: number; clicks: number };

/** Meta reports spend as a naira string, e.g. "1234.56". */
export function parseInsights(body: { data?: { spend?: string; impressions?: string; clicks?: string }[] }): Insights {
  const row = body.data?.[0];
  return {
    spendKobo: Math.round(Number(row?.spend ?? 0) * 100),
    impressions: Number(row?.impressions ?? 0),
    clicks: Number(row?.clicks ?? 0),
  };
}

export async function insights(shop: AdsCreds, campaignId: string): Promise<Result<Insights>> {
  const r = await call<{ data?: { spend?: string; impressions?: string; clicks?: string }[] }>(
    decrypt(shop.metaAdsTokenEnc!),
    `${campaignId}/insights?fields=spend,impressions,clicks&date_preset=maximum`,
  );
  return r.ok ? { ok: true, data: parseInsights(r.data) } : r;
}

/** Test-mode spend: the daily budget pro rata for the time the ad has run. No impressions or clicks are invented. */
export function simulatedSpend(c: { dailyKobo: number; startAt: Date; endAt: Date }, now = new Date()) {
  const ran = Math.max(0, Math.min(now.getTime(), c.endAt.getTime()) - c.startAt.getTime());
  return Math.round((c.dailyKobo * ran) / (24 * 3600_000));
}
