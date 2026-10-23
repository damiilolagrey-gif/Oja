"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
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
