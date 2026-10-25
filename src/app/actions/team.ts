"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizeNigerianPhone } from "@/lib/phone";
import { requireOwner } from "@/lib/session";
import type { FormState } from "@/components/ActionForm";

const repSchema = z.object({
  name: z.string().trim().min(2, "Enter the rep's name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Give them a temporary password of at least 8 characters"),
});

export async function addRep(_: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const parsed = repSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (await db.user.findUnique({ where: { email: parsed.data.email } })) return { error: "Someone already uses that email" };
  await db.user.create({
    data: { shopId: owner.shopId, name: parsed.data.name, email: parsed.data.email, passwordHash: await bcrypt.hash(parsed.data.password, 10), role: "REP" },
  });
  revalidatePath("/app/team");
  return { ok: `${parsed.data.name} can now log in with ${parsed.data.email}` };
}

/** The number a staff member messages the shop's WhatsApp from to add and restock products. */
export async function setStaffPhone(_: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const raw = String(data.get("phone") ?? "").trim();
  const phone = raw ? normalizeNigerianPhone(raw) : null;
  if (raw && !phone) return { error: "Enter a Nigerian WhatsApp number like 0803 123 4567" };
  if (phone && phone === owner.shop.whatsappNumber) {
    return { error: "That's the shop's own number. Use the personal number you'll message the shop from." };
  }
  try {
    await db.user.updateMany({ where: { id: String(data.get("id")), shopId: owner.shopId }, data: { phone } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "Someone on your team already uses that number" };
    throw e;
  }
  revalidatePath("/app/team");
  return { ok: phone ? "Saved. Messages from this number can now add and restock products." : "Number removed" };
}

export async function setRepActive(data: FormData) {
  const owner = await requireOwner();
  const id = String(data.get("id"));
  if (id === owner.id) return;
  await db.user.updateMany({ where: { id, shopId: owner.shopId, role: "REP" }, data: { active: data.get("active") === "true" } });
  revalidatePath("/app/team");
}

export async function setMissLimit(data: FormData) {
  const owner = await requireOwner();
  const minutes = Number(data.get("minutes"));
  if (![5, 10, 15, 30, 60, 120].includes(minutes)) return;
  await db.shop.update({ where: { id: owner.shopId }, data: { missLimitMinutes: minutes } });
  revalidatePath("/app", "layout");
}
