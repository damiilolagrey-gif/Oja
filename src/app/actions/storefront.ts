"use server";

import { db } from "@/lib/db";
import { normalizeNigerianPhone } from "@/lib/phone";
import { joinWaitlist } from "@/lib/services/waitlist";
import type { FormState } from "@/components/ActionForm";

export async function optIn(_: FormState, data: FormData): Promise<FormState> {
  const shop = await db.shop.findUnique({ where: { slug: String(data.get("slug")) } });
  const product = shop && (await db.product.findFirst({ where: { id: String(data.get("productId")), shopId: shop.id, archived: false } }));
  if (!shop || !product) return { error: "This item is no longer available." };
  const name = String(data.get("name") ?? "").trim();
  const phone = normalizeNigerianPhone(String(data.get("phone") ?? ""));
  if (!name) return { error: "Add your name so the shop knows who to message." };
  if (!phone) return { error: "Enter a Nigerian WhatsApp number like 0803 123 4567." };
  if (data.get("consent") !== "on") return { error: "Tick the box so the shop is allowed to message you on WhatsApp." };
  const ref = String(data.get("ref") ?? "");
  await joinWaitlist(shop, product.id, name, phone, ref === "ig-dm" ? "IG_DM" : ref === "ig-comment" ? "IG_COMMENT" : "STOREFRONT");
  return { ok: `Done! We'll WhatsApp you as soon as ${product.name} is back.` };
}
