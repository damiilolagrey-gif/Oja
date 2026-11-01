"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/services/activity";
import { ROLE_LABEL } from "@/lib/permissions";
import type { FormState } from "@/components/ActionForm";

const STAFF_ROLES = ["REP", "MANAGER"] as const;

const staffSchema = z.object({
  name: z.string().trim().min(2, "Enter their name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Give them a temporary password of at least 8 characters"),
  role: z.enum(STAFF_ROLES).default("REP"),
});

export async function addRep(_: FormState, data: FormData): Promise<FormState> {
  const owner = await requirePermission("team");
  const parsed = staffSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (await db.user.findUnique({ where: { email: parsed.data.email } })) return { error: "Someone already uses that email" };
  const u = await db.user.create({
    data: {
      shopId: owner.shopId,
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      role: parsed.data.role,
    },
  });
  await logActivity(owner, "team.add", `Added ${u.name} as ${ROLE_LABEL[u.role]}`, { type: "user", id: u.id });
  revalidatePath("/app/team");
  return { ok: `${parsed.data.name} can now log in with ${parsed.data.email}` };
}

export async function setRepActive(data: FormData) {
  const owner = await requirePermission("team");
  const id = String(data.get("id"));
  if (id === owner.id) return;
  const active = data.get("active") === "true";
  const u = await db.user.findFirst({ where: { id, shopId: owner.shopId, role: { not: "OWNER" } } });
  if (!u) return;
  await db.user.update({ where: { id: u.id }, data: { active } });
  await logActivity(owner, active ? "team.restore" : "team.remove", `${active ? "Restored" : "Removed"} ${u.name}'s access`, { type: "user", id: u.id });
  revalidatePath("/app/team");
}

export async function setRole(data: FormData) {
  const owner = await requirePermission("team");
  const role = String(data.get("role"));
  if (!(STAFF_ROLES as readonly string[]).includes(role)) return;
  const u = await db.user.findFirst({ where: { id: String(data.get("id")), shopId: owner.shopId, role: { not: "OWNER" } } });
  if (!u || u.role === role) return;
  await db.user.update({ where: { id: u.id }, data: { role: role as (typeof STAFF_ROLES)[number] } });
  await logActivity(owner, "team.role", `Changed ${u.name} from ${ROLE_LABEL[u.role]} to ${ROLE_LABEL[role as (typeof STAFF_ROLES)[number]]}`, { type: "user", id: u.id });
  revalidatePath("/app/team");
}

export async function setMissLimit(data: FormData) {
  const owner = await requirePermission("team");
  const minutes = Number(data.get("minutes"));
  if (![5, 10, 15, 30, 60, 120].includes(minutes)) return;
  await db.shop.update({ where: { id: owner.shopId }, data: { missLimitMinutes: minutes } });
  revalidatePath("/app", "layout");
}
