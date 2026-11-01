"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { toKobo } from "@/lib/format";
import { normalizeNigerianPhone } from "@/lib/phone";
import { requireUser } from "@/lib/session";
import { markLost, markWon, receiveMessage, sendReply } from "@/lib/services/conversations";
import { draftMessage } from "@/lib/ai";
import { handOver, runAgent } from "@/lib/services/agent";
import { checkStock } from "@/lib/services/stock";
import { logActivity } from "@/lib/services/activity";
import { naira } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { FormState } from "@/components/ActionForm";

/** "Ada on WhatsApp", for activity log lines. */
async function chatLabel(shopId: string, id: string) {
  const c = await db.conversation.findFirst({ where: { id, shopId }, include: { contact: true } });
  return c ? `${c.contact.name} on ${c.channel === "INSTAGRAM" ? "Instagram" : "WhatsApp"}` : "a chat";
}

export async function reply(_: FormState, data: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = String(data.get("conversationId"));
  const text = String(data.get("text") ?? "").trim();
  if (!text) return { error: "Type a message first" };
  const r = await sendReply(user.shop, id, user.id, text);
  await logActivity(user, "chat.reply", `Replied to ${await chatLabel(user.shopId, id)}`, { type: "conversation", id });
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
  const c = await db.conversation.findFirst({ where: { id, shopId: user.shopId }, select: { productId: true } });
  if (c?.productId) await checkStock(user.shop, c.productId);
  await logActivity(user, "chat.won", `Recorded a ${naira(amount)} sale from ${await chatLabel(user.shopId, id)}`, { type: "conversation", id });
  revalidatePath("/app", "layout");
  return { ok: "Sale recorded" };
}

export async function closeLost(data: FormData) {
  const user = await requireUser();
  const id = String(data.get("conversationId"));
  await markLost(user.shopId, id);
  await logActivity(user, "chat.lost", `Marked ${await chatLabel(user.shopId, id)} as lost`, { type: "conversation", id });
  revalidatePath("/app", "layout");
}

export async function updateConversation(data: FormData) {
  const user = await requireUser();
  const id = String(data.get("conversationId"));
  const repId = data.get("repId") ? String(data.get("repId")) : undefined;
  const productId = data.get("productId") !== null ? String(data.get("productId")) || null : undefined;
  const rep = repId ? await db.user.findFirst({ where: { id: repId, shopId: user.shopId } }) : null;
  if (repId && !rep) return;
  // Reps can only take a chat themselves; handing chats to other people needs the assign permission.
  if (repId && repId !== user.id && !can(user.role, "chats.assign")) return;
  if (productId && !(await db.product.findFirst({ where: { id: productId, shopId: user.shopId } }))) return;
  await db.conversation.updateMany({ where: { id, shopId: user.shopId }, data: { repId, productId } });
  if (rep) await logActivity(user, "chat.assign", `Assigned ${await chatLabel(user.shopId, id)} to ${rep.name}`, { type: "conversation", id });
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
  // Lets the owner try the AI agent before going live: it answers the pretend buyer straight away.
  if (convo) await runAgent(user.shop, convo.id);
  revalidatePath("/app", "layout");
  if (convo) redirect(`/app/inbox/${convo.id}`);
  return undefined;
}

/** Drafts a reply (or a follow-up when the buyer went quiet) for the rep to check and send. */
export async function draftWithAi(conversationId: string, mode: "reply" | "follow_up"): Promise<{ text: string } | { error: string }> {
  const user = await requireUser();
  const c = await db.conversation.findFirst({
    where: { id: conversationId, shopId: user.shopId },
    include: { contact: true, product: true, messages: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
  if (!c) return { error: "Chat not found" };
  const products = await db.product.findMany({ where: { shopId: user.shopId, archived: false }, orderBy: { createdAt: "desc" }, take: 40 });
  const base = process.env.APP_URL ?? "";
  const shop = user.shop;
  return draftMessage(
    {
      shopName: shop.name,
      channel: c.channel,
      buyerName: c.contact.name,
      bankDetails: shop.bankDetails,
      focusProduct: c.product?.name ?? null,
      products: products.map(p => ({
        name: p.name,
        priceKobo: p.priceKobo,
        stock: p.stock,
        buyLink: `${base}/s/${shop.slug}/buy/${p.id}`,
        notifyLink: `${base}/s/${shop.slug}/notify/${p.id}?ref=${c.channel === "INSTAGRAM" ? "ig-dm" : "wa"}`,
      })),
      messages: [...c.messages].reverse().map(m => ({ from: m.author === "BUYER" ? "buyer" : m.author === "SYSTEM" ? "system" : "shop", text: m.text, at: m.createdAt })),
    },
    mode,
  );
}

/** A rep takes the chat from the AI agent: the agent stays quiet in this chat until it is handed back. */
export async function takeOver(data: FormData) {
  const user = await requireUser();
  const id = String(data.get("conversationId"));
  const c = await db.conversation.findFirst({ where: { id, shopId: user.shopId } });
  if (!c) return;
  await handOver(c.id, `${user.name} took over`);
  await db.conversation.update({ where: { id: c.id }, data: { repId: c.repId ?? user.id } });
  await logActivity(user, "chat.take_over", `Took over ${await chatLabel(user.shopId, id)} from the AI agent`, { type: "conversation", id });
  revalidatePath(`/app/inbox/${id}`);
}

/** Gives the chat back to the AI agent, which answers the buyer's next message. */
export async function handBack(data: FormData) {
  const user = await requireUser();
  const id = String(data.get("conversationId"));
  const n = await db.conversation.updateMany({ where: { id, shopId: user.shopId }, data: { agentPaused: false, handoverNote: null } });
  if (n.count) await logActivity(user, "chat.hand_back", `Handed ${await chatLabel(user.shopId, id)} back to the AI agent`, { type: "conversation", id });
  revalidatePath(`/app/inbox/${id}`);
}
