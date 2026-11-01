"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/services/activity";
import { writeCopy } from "@/lib/services/studio";
import { fitCopy, validHex, type AdCopy } from "@/lib/creative";
import type { FormState } from "@/components/ActionForm";

/** Writes three sets of ad copy for a product and saves them to the library. */
export async function writeAds(_: FormState, data: FormData): Promise<FormState> {
  const user = await requirePermission("studio");
  const product = await db.product.findFirst({
    where: { id: String(data.get("productId")), shopId: user.shopId, archived: false },
    include: { variants: { where: { archived: false } } },
  });
  if (!product) return { error: "Product not found" };
  const hint = String(data.get("hint") ?? "").trim();
  const r = await writeCopy(
    { id: product.id, name: product.name, priceKobo: product.priceKobo, stock: product.stock, description: product.description, options: product.variants.map(v => v.label) },
    user.shop,
    hint || undefined,
  );
  await db.adCreative.createMany({
    data: r.sets.map(c => ({ shopId: user.shopId, productId: product.id, angle: c.angle, copy: c, source: r.source, createdById: user.id })),
  });
  await logActivity(user, "studio.write", `Wrote ${r.sets.length} ads for ${product.name}`, { type: "product", id: product.id });
  revalidatePath(`/app/studio/${product.id}`);
  return { ok: r.note ?? `${r.sets.length} new ad sets are below.` };
}

const lines = (v: FormDataEntryValue | null) => String(v ?? "").split("\n").map(s => s.trim()).filter(Boolean);

/** Saves a vendor's edits to a set, cut back to each platform's limits. */
export async function editAd(_: FormState, data: FormData): Promise<FormState> {
  const user = await requirePermission("studio");
  const ad = await db.adCreative.findFirst({ where: { id: String(data.get("id")), shopId: user.shopId } });
  if (!ad) return { error: "Ad not found" };
  const copy = fitCopy({
    angle: ad.angle,
    instagram: { caption: String(data.get("igCaption") ?? ""), hashtags: String(data.get("igHashtags") ?? "").split(/[\s,]+/) },
    facebook: { primaryText: String(data.get("fbPrimary") ?? ""), headline: String(data.get("fbHeadline") ?? "") },
    tiktok: { adText: String(data.get("tiktok") ?? "") },
    google: { headlines: lines(data.get("gHeadlines")), descriptions: lines(data.get("gDescriptions")) },
    whatsappStatus: String(data.get("status") ?? ""),
  } satisfies AdCopy);
  await db.adCreative.update({ where: { id: ad.id }, data: { copy } });
  await logActivity(user, "studio.edit", `Edited the "${ad.angle}" ad`, { type: "creative", id: ad.id });
  revalidatePath(`/app/studio/${ad.productId}`);
  return { ok: "Saved. Long text was cut to fit each platform." };
}

export async function deleteAd(data: FormData) {
  const user = await requirePermission("studio");
  const ad = await db.adCreative.findFirst({ where: { id: String(data.get("id")), shopId: user.shopId } });
  if (!ad) return;
  await db.adCreative.delete({ where: { id: ad.id } });
  revalidatePath(`/app/studio/${ad.productId}`);
}

export async function saveBrand(_: FormState, data: FormData): Promise<FormState> {
  const user = await requirePermission("studio");
  const color = String(data.get("brandColor") ?? "").trim();
  const voice = String(data.get("brandVoice") ?? "").trim().slice(0, 300);
  if (color && !validHex(color)) return { error: "Pick a colour" };
  await db.shop.update({ where: { id: user.shopId }, data: { brandColor: color || null, brandVoice: voice || null } });
  await logActivity(user, "studio.brand", "Updated the brand colour and voice");
  revalidatePath("/app/studio", "layout");
  return { ok: "Brand saved" };
}
