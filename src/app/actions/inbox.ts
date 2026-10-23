"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { toKobo } from "@/lib/format";
import { normalizeNigerianPhone } from "@/lib/phone";
import { requireUser } from "@/lib/session";
import { markLost, markWon, receiveMessage, sendReply } from "@/lib/services/conversations";
import type { FormState } from "@/components/ActionForm";

export async function reply(_: FormState, data: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = String(data.get("conversationId"));
  const text = String(data.get("text") ?? "").trim();
  if (!text) return { error: "Type a message first" };
  const r = await sendReply(user.shop, id, user.id, text);
  revalidatePath(`/app/inbox/${id}`);
  if (r.status === "failed") return { error: `Not delivered: ${r.error}. WhatsApp only allows free replies within 24 hours of the buyer's last message.` };
  return undefined;
}

export async function closeSale(_: FormState, data: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = String(data.get("conversationId"));
  const amount = toKobo(String(data.get("amount") ?? ""));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the amount paid in naira" };
  await markWon(user.shopId, id, amount);
  revalidatePath("/app", "layout");
  return { ok: "Sale recorded" };
}

export async function closeLost(data: FormData) {
  const user = await requireUser();
  await markLost(user.shopId, String(data.get("conversationId")));
  revalidatePath("/app", "layout");
}

export async function updateConversation(data: FormData) {
  const user = await requireUser();
  const id = String(data.get("conversationId"));
  const repId = data.get("repId") ? String(data.get("repId")) : undefined;
  const productId = data.get("productId") !== null ? String(data.get("productId")) || null : undefined;
  if (repId && !(await db.user.findFirst({ where: { id: repId, shopId: user.shopId } }))) return;
  if (productId && !(await db.product.findFirst({ where: { id: productId, shopId: user.shopId } }))) return;
  await db.conversation.updateMany({ where: { id, shopId: user.shopId }, data: { repId, productId } });
  revalidatePath(`/app/inbox/${id}`);
}

/** Lets a shop try the inbox before Meta has approved its WhatsApp and Instagram connection. */
export async function simulateBuyerMessage(_: FormState, data: FormData): Promise<FormState> {
  const user = await requireUser();
  const channel = data.get("channel") === "INSTAGRAM" ? "INSTAGRAM" : "WHATSAPP";
  const name = String(data.get("name") ?? "").trim() || "Test buyer";
  const text = String(data.get("text") ?? "").trim();
  if (!text) return { error: "Type the buyer's message" };
  let convo;
  if (channel === "WHATSAPP") {
    const phone = normalizeNigerianPhone(String(data.get("phone") ?? ""));
    if (!phone) return { error: "Enter a Nigerian WhatsApp number like 0803 123 4567" };
    convo = await receiveMessage(user.shop, { channel, waPhone: phone, name, text });
  } else {
    convo = await receiveMessage(user.shop, { channel, igUserId: `test-${name.toLowerCase().replace(/\W+/g, "-")}`, name, text });
  }
  revalidatePath("/app", "layout");
  if (convo) redirect(`/app/inbox/${convo.id}`);
  return undefined;
}
