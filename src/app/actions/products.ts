"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { naira, toKobo } from "@/lib/format";
import { normalizeNigerianPhone } from "@/lib/phone";
import { requireUser } from "@/lib/session";
import { joinWaitlist, restock } from "@/lib/services/waitlist";
import type { FormState } from "@/components/ActionForm";

const productSchema = z.object({
  name: z.string().trim().min(2, "Give the product a name"),
  price: z.string().trim().min(1, "Add a price"),
  stock: z.coerce.number().int().min(0, "Stock can't be negative").default(0),
  imageUrl: z.string().trim().url("Image link must be a full https:// link").optional().or(z.literal("")),
});

export async function saveProduct(_: FormState, data: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = productSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const priceKobo = toKobo(parsed.data.price);
  if (!Number.isFinite(priceKobo) || priceKobo <= 0) return { error: "Enter the price in naira, like 28500" };

  const id = String(data.get("id") ?? "");
  const fields = { name: parsed.data.name, priceKobo, imageUrl: parsed.data.imageUrl || null };
  if (id) {
    await db.product.update({ where: { id, shopId: user.shopId }, data: fields });
  } else {
    await db.product.create({ data: { ...fields, stock: parsed.data.stock, shopId: user.shopId } });
  }
  revalidatePath("/app/products");
  return { ok: id ? "Saved" : `Added ${parsed.data.name}` };
}

export async function restockProduct(_: FormState, data: FormData): Promise<FormState> {
  const user = await requireUser();
  const units = Number(data.get("units"));
  if (!Number.isInteger(units) || units < 1 || units > 10000) return { error: "Enter how many units arrived" };
  const r = await restock(user.shop, String(data.get("productId")), units);
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
  const user = await requireUser();
  const name = String(data.get("name") ?? "").trim();
  const phone = normalizeNigerianPhone(String(data.get("phone") ?? ""));
  if (!name) return { error: "Add the buyer's name" };
  if (!phone) return { error: "Enter a Nigerian WhatsApp number like 0803 123 4567" };
  if (data.get("consent") !== "on") return { error: "Only add buyers who agreed to get a WhatsApp message" };
  const source = data.get("source") === "WHATSAPP" ? "WHATSAPP" : "IG_DM";
  const product = await db.product.findFirstOrThrow({ where: { id: String(data.get("productId")), shopId: user.shopId } });
  await joinWaitlist(user.shop, product.id, name, phone, source);
  revalidatePath(`/app/products/${product.id}`);
  return { ok: `${name} is on the waitlist for ${product.name} (${naira(product.priceKobo)})` };
}

export async function archiveProduct(data: FormData) {
  const user = await requireUser();
  await db.product.update({ where: { id: String(data.get("id")), shopId: user.shopId }, data: { archived: true } });
  revalidatePath("/app/products");
  redirect("/app/products");
}
