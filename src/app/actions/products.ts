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
import type { FormState } from "@/components/ActionForm";

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
  const product = await db.product.findFirst({ where: { id: String(data.get("productId")), shopId: user.shopId } });
  if (!product) return { error: "Product not found" };
  const r = await restock(user.shop, product.id, units);
  await logActivity(user, "product.restock", `Restocked ${product.name} with ${units} and alerted ${r.alerted} waiting buyers`, { type: "product", id: product.id });
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
  const product = await db.product.findFirstOrThrow({ where: { id: String(data.get("productId")), shopId: user.shopId } });
  await joinWaitlist(user.shop, product.id, name, phone, source);
  await logActivity(user, "waitlist.add", `Added ${name} to the restock list for ${product.name}`, { type: "product", id: product.id });
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
