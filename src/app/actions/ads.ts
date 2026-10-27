"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { requireOwner } from "@/lib/session";
import { aiConfigured, draftAdCaption } from "@/lib/ai";
import { AREAS, DAILY_BUDGETS_KOBO, DAYS, defaultCaption } from "@/lib/ads";
import { checkAdAccount, normalizeAdAccountId, PLATFORMS, type Platform } from "@/lib/metaAds";
import { promote, toggle } from "@/lib/services/ads";
import type { FormState } from "@/components/ActionForm";

const str = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

export async function connectMetaAds(_: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const adAccountId = normalizeAdAccountId(str(data, "adAccountId"));
  const pageId = str(data, "pageId");
  const igUserId = str(data, "igUserId");
  const token = str(data, "token");
  if (!adAccountId) return { error: "The ad account ID is the number after act_ in Ads Manager" };
  if (!/^\d{5,}$/.test(pageId)) return { error: "The Page ID is the long number in your Facebook Page's About section" };
  if (igUserId && !/^\d{5,}$/.test(igUserId)) return { error: "The Instagram account ID is a long number. Leave it empty to run on Facebook only" };
  if (token.length < 20) return { error: "Paste the full access token" };
  const check = await checkAdAccount(token, adAccountId);
  if (!check.ok) return { error: `Couldn't use that ad account: ${check.error}` };
  await db.shop.update({
    where: { id: owner.shopId },
    data: { metaAdAccountId: adAccountId, metaPageId: pageId, metaIgUserId: igUserId || null, metaAdsTokenEnc: encrypt(token) },
  });
  revalidatePath("/app", "layout");
  return { ok: `Connected to ${check.data}. Your ads will run on this account.` };
}

export async function disconnectMetaAds() {
  const owner = await requireOwner();
  await db.shop.update({ where: { id: owner.shopId }, data: { metaAdAccountId: null, metaPageId: null, metaIgUserId: null, metaAdsTokenEnc: null } });
  revalidatePath("/app", "layout");
}

/** Caption for the ad form: written by AI when it's on, otherwise a plain template. */
export async function draftAd(productId: string, area: string): Promise<{ text: string } | { error: string }> {
  const owner = await requireOwner();
  const p = await db.product.findFirst({ where: { id: productId, shopId: owner.shopId, archived: false } });
  if (!p) return { error: "Pick a product first." };
  if (!aiConfigured()) return { text: defaultCaption(p.name, p.priceKobo, area) };
  return draftAdCaption({ shopName: owner.shop.name, product: p.name, priceKobo: p.priceKobo, stock: p.stock, area });
}

export async function launchAd(_: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const product = await db.product.findFirst({ where: { id: str(data, "productId"), shopId: owner.shopId, archived: false } });
  if (!product) return { error: "Pick a product to promote." };
  if (product.stock < 1) return { error: "That item is sold out. Promote something in stock." };
  const platforms = data.getAll("platform").map(String).filter((p): p is Platform => p in PLATFORMS);
  if (!platforms.length) return { error: "Pick Facebook, Instagram or both." };
  if (platforms.includes("instagram") && owner.shop.metaAdsTokenEnc && !owner.shop.metaIgUserId) {
    return { error: "Add your Instagram account ID in Settings to run on Instagram, or untick it." };
  }
  const area = str(data, "area");
  if (!(AREAS as readonly string[]).includes(area)) return { error: "Pick where to show the ad." };
  const dailyKobo = Number(data.get("dailyKobo"));
  if (!(DAILY_BUDGETS_KOBO as readonly number[]).includes(dailyKobo)) return { error: "Pick a daily budget." };
  const days = Number(data.get("days"));
  if (!(DAYS as readonly number[]).includes(days)) return { error: "Pick how many days to run it." };
  const message = str(data, "message");
  if (message.length < 10) return { error: "Write the ad text, or tap Write with AI." };
  if (message.length > 600) return { error: "Keep the ad text under 600 characters." };
  const r = await promote(owner.shop, product, { platforms, area, dailyKobo, days, message });
  revalidatePath("/app/ads");
  return r;
}

export async function toggleAd(data: FormData) {
  const owner = await requireOwner();
  const ad = await db.adCampaign.findFirst({ where: { id: str(data, "id"), shopId: owner.shopId } });
  if (ad) {
    const r = await toggle(owner.shop, ad);
    if ("error" in r) console.error("toggle ad", ad.id, r.error);
  }
  revalidatePath("/app/ads");
}
