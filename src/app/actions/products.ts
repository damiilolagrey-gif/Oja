"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { naira, toKobo } from "@/lib/format";
import { normalizeNigerianPhone } from "@/lib/phone";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/services/activity";
import { joinWaitlist, restock } from "@/lib/services/waitlist";
import { checkStock } from "@/lib/services/stock";
import { syncStock } from "@/lib/services/variants";
import { itemName, live, parseOptions } from "@/lib/variants";
import type { FormState } from "@/components/ActionForm";
import { buyers, describePlan, describeRow, planImport } from "@/lib/catalogue-import";

const productSchema = z.object({
  name: z.string().trim().min(2, "Give the product a name"),
  price: z.string().trim().min(1, "Add a price"),
  stock: z.coerce.number().int().min(0, "Stock can't be negative").default(0),
  imageUrl: z.string().trim().url("Image link must be a full https:// link").optional().or(z.literal("")),
  description: z.string().trim().max(1000, "Keep the details under 1000 characters").optional(),
  lowStockAt: z.coerce.number().int().min(0).max(1000).default(3),
});

export async function saveProduct(_: FormState, data: FormData): Promise<FormState> {
  const user = await requirePermission("products.edit");
  const parsed = productSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const priceKobo = toKobo(parsed.data.price);
  if (!Number.isFinite(priceKobo) || priceKobo <= 0) return { error: "Enter the price in naira, like 28500" };

  const id = String(data.get("id") ?? "");
  const fields = {
    name: parsed.data.name,
    priceKobo,
    imageUrl: parsed.data.imageUrl || null,
    description: parsed.data.description || null,
    lowStockAt: parsed.data.lowStockAt,
  };
  const before = id ? await db.product.findFirst({ where: { id, shopId: user.shopId } }) : null;
  if (id && !before) return { error: "Product not found" };
  const saved = id
    ? await db.product.update({ where: { id, shopId: user.shopId }, data: fields })
    : await db.product.create({ data: { ...fields, stock: parsed.data.stock, shopId: user.shopId } });
  await logActivity(
    user,
    id ? "product.edit" : "product.add",
    before && before.priceKobo !== priceKobo
      ? `Changed the price of ${saved.name} from ${naira(before.priceKobo)} to ${naira(priceKobo)}`
      : id
        ? `Edited ${saved.name}`
        : `Added ${saved.name} at ${naira(priceKobo)} with ${saved.stock} in stock`,
    { type: "product", id: saved.id },
  );
  await checkStock(user.shop, saved.id); // a new threshold can put it in (or out of) the low-stock zone
  revalidatePath("/app/products");
  return { ok: id ? "Saved" : `Added ${parsed.data.name}` };
}

export async function restockProduct(_: FormState, data: FormData): Promise<FormState> {
  const user = await requirePermission("products.edit");
  const units = Number(data.get("units"));
  if (!Number.isInteger(units) || units < 1 || units > 10000) return { error: "Enter how many units arrived" };
  const product = await db.product.findFirst({ where: { id: String(data.get("productId")), shopId: user.shopId }, include: { variants: true } });
  if (!product) return { error: "Product not found" };
  const options = live(product.variants);
  const variantId = data.get("variantId") ? String(data.get("variantId")) : null;
  const variant = variantId ? options.find(v => v.id === variantId) : null;
  if (variantId && !variant) return { error: "That option was removed" };
  if (options.length && !variant) return { error: "Pick which option arrived on the product page" };
  const r = await restock(user.shop, product.id, units, variant?.id ?? null);
  await logActivity(user, "product.restock", `Restocked ${itemName(product.name, variant)} with ${units} and alerted ${r.alerted} waiting buyers`, { type: "product", id: product.id });
  revalidatePath("/app", "layout");
  if (!r.alerted && !r.failed) return { ok: `Added ${units} to stock. Nobody was waiting.` };
  const parts = [`Added ${units} to stock and alerted ${r.alerted} on WhatsApp`];
  if (r.simulated) parts.push(`(${r.simulated} simulated: connect WhatsApp in Settings to send for real)`);
  if (r.failed) parts.push(`${r.failed} failed to send`);
  if (r.stillWaiting) parts.push(`${r.stillWaiting} still waiting for the next restock`);
  return { ok: parts.join(". ") + "." };
}

/** A rep adds a buyer who asked in a DM and agreed to be messaged. */
export async function addToWaitlist(_: FormState, data: FormData): Promise<FormState> {
  const user = await requirePermission("waitlist.add");
  const name = String(data.get("name") ?? "").trim();
  const phone = normalizeNigerianPhone(String(data.get("phone") ?? ""));
  if (!name) return { error: "Add the buyer's name" };
  if (!phone) return { error: "Enter a Nigerian WhatsApp number like 0803 123 4567" };
  if (data.get("consent") !== "on") return { error: "Only add buyers who agreed to get a WhatsApp message" };
  const source = data.get("source") === "WHATSAPP" ? "WHATSAPP" : "IG_DM";
  const product = await db.product.findFirstOrThrow({ where: { id: String(data.get("productId")), shopId: user.shopId }, include: { variants: { where: { archived: false } } } });
  const variant = product.variants.find(v => v.id === data.get("variantId")) ?? null;
  await joinWaitlist(user.shop, product.id, name, phone, source, variant?.id ?? null);
  await logActivity(user, "waitlist.add", `Added ${name} to the restock list for ${itemName(product.name, variant)}`, { type: "product", id: product.id });
  revalidatePath(`/app/products/${product.id}`);
  return { ok: `${name} is on the waitlist for ${product.name} (${naira(product.priceKobo)})` };
}

export async function archiveProduct(data: FormData) {
  const user = await requirePermission("products.edit");
  const p = await db.product.update({ where: { id: String(data.get("id")), shopId: user.shopId }, data: { archived: true } });
  await logActivity(user, "product.archive", `Removed ${p.name} from the shop`, { type: "product", id: p.id });
  revalidatePath("/app/products");
  redirect("/app/products");
}

export type ImportState =
  | {
      error?: string;
      ok?: string;
      preview?: { summary: string; text: string; rows: { line: number; name: string; what: string }[]; errors: { line: number; message: string }[] };
    }
  | undefined;

async function readSheet(data: FormData): Promise<string | { error: string }> {
  const file = data.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 2_000_000) return { error: "That file is over 2 MB. Upload up to 500 products at a time." };
    if (/\.(xlsx|xls|numbers)$/i.test(file.name)) {
      return { error: "Save the sheet as CSV first (in Excel: File, Save As, CSV), or copy the cells and paste them in the box." };
    }
    return file.text();
  }
  return String(data.get("text") ?? "");
}

/** Bulk upload in two steps: "check" shows what will change; "import" re-checks against live stock and applies it. */
export async function importCatalogue(_: ImportState, data: FormData): Promise<ImportState> {
  const user = await requirePermission("products.edit");
  const text = await readSheet(data);
  if (typeof text !== "string") return text;
  if (!text.trim()) return { error: "Choose a CSV file or paste your sheet first." };

  const existing = await db.product.findMany({
    where: { shopId: user.shopId, archived: false },
    include: { _count: { select: { waitlist: { where: { status: "WAITING" } }, variants: { where: { archived: false } } } } },
  });
  const plan = planImport(text, existing.map(p => ({ ...p, waiting: p._count.waitlist, hasOptions: p._count.variants > 0 })));
  const preview = {
    summary: describePlan(plan),
    text,
    rows: plan.rows.map(r => ({ line: r.line, name: r.name, what: describeRow(r) })),
    errors: plan.errors,
  };
  if (data.get("mode") !== "import" || plan.errors.length) return { preview };

  let alerted = 0;
  const changed = plan.rows.filter(r => r.kind !== "same");
  for (const r of changed) {
    if (r.kind === "add") {
      const p = await db.product.create({
        data: { shopId: user.shopId, name: r.name, priceKobo: r.priceKobo, stock: r.stock, imageUrl: r.imageUrl, description: r.description, lowStockAt: r.lowStockAt },
      });
      await checkStock(user.shop, p.id);
    } else if (r.kind === "update") {
      if (Object.keys(r.changes).length) await db.product.update({ where: { id: r.id, shopId: user.shopId }, data: r.changes });
      if (r.stockTo > r.stockFrom) {
        // Through restock, so buyers on the waitlist get their WhatsApp message.
        alerted += (await restock(user.shop, r.id, r.stockTo - r.stockFrom)).alerted;
      } else {
        if (r.stockTo < r.stockFrom) await db.product.update({ where: { id: r.id, shopId: user.shopId }, data: { stock: r.stockTo } });
        await checkStock(user.shop, r.id);
      }
    }
  }
  const adds = changed.filter(r => r.kind === "add").length;
  const updates = changed.length - adds;
  await logActivity(user, "product.import", `Uploaded a sheet: ${adds} added, ${updates} updated${alerted ? `, ${buyers(alerted)} alerted` : ""}`);
  revalidatePath("/app", "layout");
  return { ok: `Done. ${adds} added, ${updates} updated${alerted ? `, and ${buyers(alerted)} messaged on WhatsApp` : ""}.` };
}

/** Adds sizes, colours or other options, each with its own stock. The product's stock becomes their total. */
export async function addVariants(_: FormState, data: FormData): Promise<FormState> {
  const user = await requirePermission("products.edit");
  const product = await db.product.findFirst({ where: { id: String(data.get("productId")), shopId: user.shopId }, include: { variants: true } });
  if (!product) return { error: "Product not found" };
  const { labels, error } = parseOptions(String(data.get("labels") ?? ""));
  if (error) return { error };
  const stock = Number(data.get("stock") || 0);
  if (!Number.isInteger(stock) || stock < 0 || stock > 10000) return { error: "Stock for each option should be a whole number" };
  const priceRaw = String(data.get("price") ?? "").trim();
  const priceKobo = priceRaw ? toKobo(priceRaw) : null;
  if (priceKobo !== null && (!Number.isFinite(priceKobo) || priceKobo <= 0)) return { error: "Enter the price in naira, like 28500, or leave it blank" };

  const byLabel = new Map(product.variants.map(v => [v.label.toLowerCase(), v]));
  const fresh = labels.filter(l => !byLabel.get(l.toLowerCase()) || byLabel.get(l.toLowerCase())!.archived);
  if (!fresh.length) return { error: "Those options are already on this product" };
  if (live(product.variants).length + fresh.length > 30) return { error: "Up to 30 options per product" };
  await db.$transaction(async tx => {
    for (const label of fresh) {
      const old = byLabel.get(label.toLowerCase());
      if (old) await tx.productVariant.update({ where: { id: old.id }, data: { archived: false, stock, priceKobo, stockAlert: null } });
      else await tx.productVariant.create({ data: { productId: product.id, label, stock, priceKobo } });
    }
    await syncStock(product.id, tx);
  });
  await checkStock(user.shop, product.id);
  await logActivity(user, "product.options", `Added ${fresh.join(", ")} to ${product.name}`, { type: "product", id: product.id });
  revalidatePath(`/app/products/${product.id}`);
  return { ok: `Added ${fresh.length} option${fresh.length === 1 ? "" : "s"}` };
}

/** Sets an option's stock to a counted number, up or down. Going up from zero alerts waiting buyers. */
export async function setVariantStock(_: FormState, data: FormData): Promise<FormState> {
  const user = await requirePermission("products.edit");
  const v = await db.productVariant.findFirst({ where: { id: String(data.get("variantId")), archived: false, product: { shopId: user.shopId } }, include: { product: true } });
  if (!v) return { error: "Option not found" };
  const count = Number(data.get("stock"));
  if (!Number.isInteger(count) || count < 0 || count > 10000) return { error: "Enter how many you have now" };
  if (count === v.stock) return { ok: "No change" };
  let note = "";
  if (count > v.stock) {
    const r = await restock(user.shop, v.productId, count - v.stock, v.id);
    if (r.alerted) note = ` and messaged ${r.alerted} waiting buyer${r.alerted === 1 ? "" : "s"}`;
  } else {
    await db.productVariant.update({ where: { id: v.id }, data: { stock: count } });
    await syncStock(v.productId);
    await checkStock(user.shop, v.productId);
  }
  await logActivity(user, "product.stock", `Set ${itemName(v.product.name, v)} stock from ${v.stock} to ${count}${note}`, { type: "product", id: v.productId });
  revalidatePath(`/app/products/${v.productId}`);
  return { ok: `${v.label}: ${count} in stock${note}` };
}

export async function removeVariant(data: FormData) {
  const user = await requirePermission("products.edit");
  const v = await db.productVariant.findFirst({ where: { id: String(data.get("variantId")), product: { shopId: user.shopId } }, include: { product: true } });
  if (!v) return;
  await db.$transaction(async tx => {
    await tx.productVariant.update({ where: { id: v.id }, data: { archived: true } });
    // Removing the last option hands stock back to the product itself.
    if ((await syncStock(v.productId, tx)) === null) await tx.product.update({ where: { id: v.productId }, data: { stock: 0 } });
  });
  await checkStock(user.shop, v.productId);
  await logActivity(user, "product.options", `Removed ${v.label} from ${v.product.name}`, { type: "product", id: v.productId });
  revalidatePath(`/app/products/${v.productId}`);
}
