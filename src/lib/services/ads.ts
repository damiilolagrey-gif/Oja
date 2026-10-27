import "server-only";
import type { AdCampaign, Product, Shop } from "@prisma/client";
import { db } from "../db";
import { cityKey, endDate, insights, launch, metaAdsConnected, setCampaignStatus, simulatedSpend, type AdPlan, type Platform } from "../metaAds";
import { decrypt } from "../crypto";

type Done = { ok: string } | { error: string };

export async function promote(
  shop: Shop,
  product: Product,
  p: { platforms: Platform[]; area: string; dailyKobo: number; days: number; message: string },
): Promise<Done> {
  const start = new Date();
  const end = endDate(start, p.days);
  const base = process.env.APP_URL ?? "";
  const ad = await db.adCampaign.create({
    data: {
      shopId: shop.id, productId: product.id, productName: product.name, platforms: p.platforms, area: p.area,
      dailyKobo: p.dailyKobo, days: p.days, message: p.message, startAt: start, endAt: end, simulated: !metaAdsConnected(shop),
    },
  });
  if (ad.simulated) return { ok: "Test ad started. Connect your Meta ad account in Settings to run real ads." };

  let geo: AdPlan["geo"] = { countries: ["NG"] };
  if (p.area !== "Nigeria") {
    const key = await cityKey(decrypt(shop.metaAdsTokenEnc!), p.area);
    if (!key.ok) return fail(ad.id, key.error);
    geo = { cities: [{ key: key.data, radius: 40, distance_unit: "kilometer" }] };
  }
  const r = await launch(shop, {
    name: `Oja · ${product.name} · ${start.toISOString().slice(0, 10)}`,
    platforms: p.platforms,
    dailyKobo: p.dailyKobo,
    start,
    end,
    geo,
    link: `${base}/s/${shop.slug}/buy/${product.id}?ad=${ad.id}`,
    message: p.message,
    pictureUrl: product.imageUrl,
  });
  if (!r.ok) return fail(ad.id, r.error);
  await db.adCampaign.update({ where: { id: ad.id }, data: { metaCampaignId: r.data.campaignId, metaAdSetId: r.data.adSetId, metaAdId: r.data.adId } });
  return { ok: "Ad sent to Meta. It usually goes live after Meta's review, often within an hour." };
}

async function fail(id: string, error: string): Promise<Done> {
  await db.adCampaign.update({ where: { id }, data: { status: "FAILED", error } });
  return { error: `Meta didn't accept the ad: ${error}` };
}

export async function toggle(shop: Shop, ad: AdCampaign): Promise<Done> {
  if (ad.status !== "ACTIVE" && ad.status !== "PAUSED") return { error: "This ad has finished." };
  const next = ad.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
  if (!ad.simulated && ad.metaCampaignId) {
    const r = await setCampaignStatus(shop, ad.metaCampaignId, next);
    if (!r.ok) return { error: `Meta said: ${r.error}` };
  }
  // A test ad's spend is worked out from its start time, so move the start forward by the time it spent paused.
  const resumeShift = ad.simulated && next === "ACTIVE" && ad.dailyKobo > 0
    ? { startAt: new Date(Date.now() - (ad.spendKobo / ad.dailyKobo) * 24 * 3600_000) }
    : {};
  await db.adCampaign.update({ where: { id: ad.id }, data: { status: next, ...resumeShift } });
  return { ok: next === "PAUSED" ? "Ad paused." : "Ad running again." };
}

/** Run by the cron: pulls spend and clicks from Meta, works out test-ad spend, and ends ads past their end date. */
export async function syncAds(now = new Date()) {
  const ads = await db.adCampaign.findMany({ where: { status: "ACTIVE" }, include: { shop: true } });
  let synced = 0;
  for (const ad of ads) {
    let stats: { spendKobo: number; impressions?: number; clicks?: number } | null = null;
    if (ad.simulated) stats = { spendKobo: simulatedSpend(ad, now) };
    else if (ad.metaCampaignId && metaAdsConnected(ad.shop)) {
      const r = await insights(ad.shop, ad.metaCampaignId);
      if (r.ok) stats = r.data;
      else console.error("ad insights", ad.id, r.error);
    }
    await db.adCampaign.update({
      where: { id: ad.id },
      data: { ...(stats ?? {}), syncedAt: now, ...(ad.endAt <= now ? { status: "ENDED" } : {}) },
    });
    if (stats) synced++;
  }
  return { ads: synced };
}
