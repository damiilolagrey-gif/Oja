"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/services/activity";
import { writeConcepts, writeCopy } from "@/lib/services/studio";
import { redirect } from "next/navigation";
import { fitDesign, LIMIT, type Design } from "@/lib/concepts";
import { toKobo } from "@/lib/format";
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
  revalidatePath("/app/studio");
  if (data.get("back") === "/app/studio") redirect("/app/studio");
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

/**
 * The studio's main action: the vendor's idea in, three finished ads out. The ad is for a product in the shop,
 * or for something not listed yet (a name and a price are enough).
 */
export async function makeAds(_: FormState, data: FormData): Promise<FormState> {
  const user = await requirePermission("studio");
  const prompt = String(data.get("prompt") ?? "").trim().slice(0, LIMIT.prompt);
  if (prompt.length < 3) return { error: "Describe the ad you want, like \"Owambe ad for my adire, gold vibe\"." };
  const productId = String(data.get("productId") ?? "");
  let item: { id: string | null; name: string; priceKobo: number; stock: number; description: string | null; options: string[] };
  if (productId) {
    const p = await db.product.findFirst({ where: { id: productId, shopId: user.shopId, archived: false }, include: { variants: { where: { archived: false } } } });
    if (!p) return { error: "That product is no longer in your shop." };
    item = { id: p.id, name: p.name, priceKobo: p.priceKobo, stock: p.stock, description: p.description, options: p.variants.map(v => v.label) };
  } else {
    const name = String(data.get("itemName") ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    const priceKobo = toKobo(String(data.get("itemPrice") ?? ""));
    if (name.length < 2) return { error: "Say what you're selling, like \"Adire two-piece\"." };
    if (!Number.isFinite(priceKobo) || priceKobo <= 0) return { error: "Add its price in naira, like 25000." };
    item = { id: null, name, priceKobo, stock: 10, description: null, options: [] };
  }
  const brand = user.shop.brandColor ?? "#2f3b8f";
  const r = await writeConcepts(prompt, { ...item, id: item.id ?? "" }, user.shop, brand);
  const made = await db.$transaction(
    r.concepts.map(c =>
      db.adCreative.create({
        data: {
          shopId: user.shopId,
          productId: item.id,
          angle: c.angle,
          prompt,
          design: { ...c.design, ...(item.id ? {} : { item: { name: item.name, priceKobo: item.priceKobo } }) },
          copy: c.copy,
          source: r.source,
          createdById: user.id,
        },
        select: { id: true },
      }),
    ),
  );
  await logActivity(user, "studio.make", `Made ${made.length} ads for ${item.name}: "${prompt.slice(0, 80)}"`, item.id ? { type: "product", id: item.id } : undefined);
  revalidatePath("/app/studio");
  redirect(`/app/studio?new=${made.map(m => m.id).join(",")}${r.note ? "&busy=1" : ""}`);
}

/** Saves edits from the ad editor. The same safety rules as the AI's output apply. */
export async function saveDesign(data: FormData) {
  const user = await requirePermission("studio");
  const ad = await db.adCreative.findFirst({ where: { id: String(data.get("id")), shopId: user.shopId }, include: { product: { select: { stock: true } } } });
  if (!ad) return;
  let incoming: Partial<Design> = {};
  try {
    incoming = JSON.parse(String(data.get("design") ?? "{}"));
  } catch {
    return;
  }
  const old = (ad.design ?? {}) as Record<string, unknown>;
  const design = fitDesign(incoming, { stock: ad.product?.stock ?? null, prompt: ad.prompt ?? "", brand: user.shop.brandColor ?? "#2f3b8f" });
  await db.adCreative.update({ where: { id: ad.id }, data: { design: { ...design, ...(old.item ? { item: old.item } : {}) } } });
  await logActivity(user, "studio.edit", `Edited the "${ad.angle}" ad design`, { type: "creative", id: ad.id });
  revalidatePath(`/app/studio/ad/${ad.id}`);
  revalidatePath("/app/studio");
}
