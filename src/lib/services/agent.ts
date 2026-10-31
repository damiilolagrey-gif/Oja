import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Shop } from "@prisma/client";
import { db } from "../db";
import { aiConfigured } from "../ai";
import { escrowConfig } from "../escrow";
import { naira } from "../format";
import { AGENT_TOOLS, buildBrief, checkCheckout, productCard, SYSTEM_PROMPT, wantsHuman, type AgentContext } from "../agent";
import { normalizeNigerianPhone } from "../phone";
import { sendInstagramCard, sendInstagramText, sendWhatsAppButtons, sendWhatsAppText, type SendResult } from "../meta";
import { createOrder, trackingLink } from "./orders";
import { joinWaitlist } from "./waitlist";

/**
 * The AI sales agent. When a shop has it set to AUTO, it answers each buyer message on its own: shows product
 * cards, takes the order and sends the payment link, adds buyers to restock lists, and hands the chat to a rep
 * when it should. Every message it sends is stored with author AGENT so reps and owners can see what it said.
 */

const MODEL = "claude-opus-5-5";
const MAX_STEPS = 5;
const STOP_WORDS = new Set(["STOP", "UNSUBSCRIBE", "STOP ALERTS"]);

type Convo = NonNullable<Awaited<ReturnType<typeof loadConversation>>>;

function loadConversation(conversationId: string) {
  return db.conversation.findUnique({
    where: { id: conversationId },
    include: { contact: true, messages: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
}

async function record(conversationId: string, text: string, r: SendResult) {
  await db.message.create({
    data: { conversationId, direction: "OUT", author: "AGENT", text, externalId: r.externalId, deliveryStatus: r.status },
  });
}

async function sendText(shop: Shop, c: Convo, text: string) {
  const r =
    c.channel === "WHATSAPP" ? await sendWhatsAppText(shop, c.contact.waPhone!, text) : await sendInstagramText(shop, c.contact.igUserId!, text);
  await record(c.id, text, r);
  return r;
}

export async function handOver(conversationId: string, reason: string) {
  await db.conversation.update({ where: { id: conversationId }, data: { agentPaused: true, handoverNote: reason.slice(0, 300) } });
}

/** Runs the agent on a conversation's latest buyer message. Safe to call when the agent is off: it does nothing. */
export async function runAgent(shop: Shop, conversationId: string): Promise<"off" | "skipped" | "replied" | "handed_over" | "error"> {
  if (shop.agentMode !== "AUTO" || !aiConfigured()) return "off";
  const c = await loadConversation(conversationId);
  if (!c || c.shopId !== shop.id || c.status !== "OPEN" || c.agentPaused) return "skipped";
  const last = c.messages[0];
  if (!last || last.direction !== "IN") return "skipped";
  if (c.channel === "WHATSAPP" && STOP_WORDS.has(last.text.trim().toUpperCase())) return "skipped";

  if (wantsHuman(last.text)) {
    await handOver(c.id, `Buyer asked for a person: "${last.text.slice(0, 120)}"`);
    await sendText(shop, c, "Sure, I've passed you to a member of our team. They'll reply here shortly.");
    return "handed_over";
  }

  const [products, orders, waiting] = await Promise.all([
    db.product.findMany({ where: { shopId: shop.id, archived: false }, orderBy: { createdAt: "desc" }, take: 60 }),
    db.order.findMany({
      where: { shopId: shop.id, OR: [{ conversation: { is: { contactId: c.contactId } } }, ...(c.contact.waPhone ? [{ buyerPhone: c.contact.waPhone }] : [])] },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.waitlistEntry.findMany({ where: { contactId: c.contactId, status: "WAITING" }, include: { product: true } }),
  ]);

  const ctx: AgentContext = {
    shopName: shop.name,
    channel: c.channel,
    buyerName: c.contact.name,
    buyerWaPhone: c.contact.waPhone,
    notes: shop.agentNotes,
    buyerFeeKobo: escrowConfig().buyerFeeKobo,
    products: products.map(p => ({ id: p.id, name: p.name, priceKobo: p.priceKobo, stock: p.stock, description: p.description, hasImage: !!p.imageUrl })),
    orders: orders.map(o => ({
      reference: o.reference,
      itemName: o.itemName,
      status: o.status,
      totalKobo: o.totalKobo,
      trackingLink: trackingLink(o),
      payLink: o.status === "PENDING" ? trackingLink(o) : null,
    })),
    waitlisted: waiting.map(w => w.product.name),
    messages: [...c.messages].reverse().map(m => ({
      from: m.direction === "IN" ? "buyer" : m.author === "SYSTEM" ? "system" : "shop",
      text: m.text,
    })),
  };

  // Carries out one tool call and returns what to tell the AI.
  let handedOver = false;
  const runTool = async (name: string, input: Record<string, unknown>): Promise<{ text: string; isError?: boolean }> => {
    const product = typeof input.product_id === "string" ? products.find(p => p.id === input.product_id) ?? null : null;
    switch (name) {
      case "show_product": {
        if (!product) return { text: "No product with that id.", isError: true };
        const card = productCard(product);
        const r =
          c.channel === "WHATSAPP"
            ? await sendWhatsAppButtons(shop, c.contact.waPhone!, card.body, card.buttons, product.imageUrl)
            : await sendInstagramCard(shop, c.contact.igUserId!, product.name, card.subtitle, card.buttons, product.imageUrl);
        await record(c.id, card.body.replace(/\*/g, ""), r);
        if (!c.productId) await db.conversation.update({ where: { id: c.id }, data: { productId: product.id } });
        return r.status === "failed" ? { text: `Card not delivered: ${r.error}`, isError: true } : { text: "Card sent." };
      }
      case "create_checkout": {
        const checked = checkCheckout(input, product, c.contact.waPhone);
        if (!checked.ok) return { text: checked.error, isError: true };
        const order = await createOrder(
          shop,
          product!,
          checked.quantity,
          { name: checked.name, phone: checked.phone, address: checked.address, city: checked.city },
          c.id,
        );
        await db.conversation.update({ where: { id: c.id }, data: { productId: product!.id } });
        return {
          text: `Order ${order.reference} created. Total ${naira(order.totalKobo)} (items ${naira(order.amountKobo)} + buyer protection ${naira(order.feeKobo)}). Payment link: ${trackingLink(order)}`,
        };
      }
      case "join_waitlist": {
        if (!product) return { text: "No product with that id.", isError: true };
        const phone = c.contact.waPhone ?? (input.phone ? normalizeNigerianPhone(String(input.phone)) : null);
        if (!phone) return { text: "Ask for their WhatsApp number first, like 0803 123 4567.", isError: true };
        await joinWaitlist(shop, product.id, c.contact.name, phone, c.channel === "WHATSAPP" ? "WHATSAPP" : "IG_DM");
        return { text: `Added to the restock list for ${product.name}. They'll get a WhatsApp message when it's back.` };
      }
      case "hand_over": {
        await handOver(c.id, String(input.reason ?? "The agent asked for a person"));
        handedOver = true;
        return { text: "Handed over. Tell the buyer a team member will reply shortly." };
      }
      default:
        return { text: `Unknown tool ${name}.`, isError: true };
    }
  };

  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: buildBrief(ctx) }];
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        output_config: { effort: "low" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM_PROMPT,
        tools: AGENT_TOOLS,
        messages,
      });
      if (res.stop_reason === "refusal") break;
      if (res.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: res.content });
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const block of res.content) {
          if (block.type !== "tool_use") continue;
          const out = await runTool(block.name, (block.input ?? {}) as Record<string, unknown>);
          results.push({ type: "tool_result", tool_use_id: block.id, content: out.text, is_error: out.isError });
        }
        messages.push({ role: "user", content: results });
        continue;
      }
      const text = res.content.flatMap(b => (b.type === "text" ? [b.text] : [])).join("").trim();
      if (text) {
        await sendText(shop, c, text);
        if (!c.firstReplyAt) await db.conversation.update({ where: { id: c.id }, data: { firstReplyAt: new Date() } });
      }
      return handedOver ? "handed_over" : "replied";
    }
  } catch (e) {
    console.error("agent error", c.id, e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
  }
  // The AI declined, failed or went round in circles: a person takes it from here.
  await handOver(c.id, "The AI couldn't answer this one");
  return "error";
}
