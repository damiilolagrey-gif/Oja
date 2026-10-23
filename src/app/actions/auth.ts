"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { slugify } from "@/lib/format";
import { endSession, startSession } from "@/lib/session";
import type { FormState } from "@/components/ActionForm";

const signupSchema = z.object({
  shopName: z.string().trim().min(2, "Enter your shop's name"),
  igHandle: z.string().trim().transform(s => s.replace(/^@/, "")).optional(),
  name: z.string().trim().min(2, "Enter your name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters for your password"),
});

async function uniqueSlug(base: string) {
  const root = slugify(base) || "shop";
  for (let i = 0; ; i++) {
    const slug = i ? `${root}-${i + 1}` : root;
    if (!(await db.shop.findUnique({ where: { slug } }))) return slug;
  }
}

export async function signup(_: FormState, data: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  if (await db.user.findUnique({ where: { email: v.email } })) return { error: "That email already has an account. Log in instead." };

  const shop = await db.shop.create({
    data: {
      name: v.shopName,
      slug: await uniqueSlug(v.igHandle || v.shopName),
      igHandle: v.igHandle || null,
      users: { create: { name: v.name, email: v.email, passwordHash: await bcrypt.hash(v.password, 10), role: "OWNER" } },
    },
    include: { users: true },
  });
  await startSession(shop.users[0].id);
  redirect("/app");
}

export async function login(_: FormState, data: FormData): Promise<FormState> {
  const email = String(data.get("email") ?? "").trim().toLowerCase();
  const password = String(data.get("password") ?? "");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "That email and password don't match." };
  }
  await startSession(user.id);
  redirect("/app");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
