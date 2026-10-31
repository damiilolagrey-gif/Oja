/**
 * The AI sales agent's rules: its tools, the brief it gets for each chat, and the checks on what it asks to do.
 * Pure functions only, so they can be unit tested without a database or the AI. The loop that calls the AI and
 * carries out the tools is in services/agent.ts.
 */
import { naira } from "./format";
import { normalizeNigerianPhone } from "./phone";

export type AgentProduct = {
  id: string;
  name: string;
  priceKobo: number;
  stock: number;
  description: string | null;
  hasImage: boolean;
};

export type AgentOrder = { reference: string; itemName: string; status: string; totalKobo: number; trackingLink: string; payLink: string | null };

export type AgentContext = {
  shopName: string;
  channel: "WHATSAPP" | "INSTAGRAM";
  buyerName: string;
  buyerWaPhone: string | null; // known on WhatsApp; on Instagram the agent must ask for it
  notes: string | null; // the owner's extra facts: delivery areas and fees, returns, opening hours
  buyerFeeKobo: number;
  products: AgentProduct[];
  orders: AgentOrder[];
  waitlisted: string[]; // product names this buyer is already waiting for
  messages: { from: "buyer" | "shop" | "system"; text: string }[];
};

/** Tool definitions in the shape the Anthropic Messages API takes. */
export const AGENT_TOOLS = [
  {
    name: "show_product",
    description:
      "Send the buyer a product card: photo, name, price and buttons (Buy now, or Notify me when sold out). Use it when the buyer asks about an item or you suggest one. Do not repeat the card's details in your text reply.",
    input_schema: {
      type: "object" as const,
      properties: { product_id: { type: "string", description: "id from the catalogue" } },
      required: ["product_id"],
    },
  },
  {
    name: "create_checkout",
    description:
      "Create the order and get its payment link once the buyer has chosen an in-stock item and given their name, full delivery address and city (and a phone number if chatting on Instagram). Put the returned link in your reply.",
    input_schema: {
      type: "object" as const,
      properties: {
        product_id: { type: "string" },
        quantity: { type: "integer", minimum: 1, maximum: 20 },
        name: { type: "string", description: "buyer's name for the delivery" },
        address: { type: "string", description: "street address with house number and area" },
        city: { type: "string" },
        phone: { type: "string", description: "Nigerian phone for the rider; omit on WhatsApp to use the chat's number" },
      },
      required: ["product_id", "quantity", "name", "address", "city"],
    },
  },
  {
    name: "join_waitlist",
    description:
      "Add the buyer to the restock list for a sold-out item, after they said yes to being messaged when it is back. On Instagram, include their WhatsApp number.",
    input_schema: {
      type: "object" as const,
      properties: { product_id: { type: "string" }, phone: { type: "string", description: "only needed on Instagram" } },
      required: ["product_id"],
    },
  },
  {
    name: "hand_over",
    description:
      "Pass the chat to a human sales rep. Use it when the buyer asks for a person, complains, wants a refund or a discount, asks for something custom or bulk, or asks anything the catalogue and notes don't answer. After this, tell the buyer a team member will reply shortly.",
    input_schema: {
      type: "object" as const,
      properties: { reason: { type: "string", description: "one line for the rep, e.g. 'Wants 5 dresses for bridesmaids, asking for discount'" } },
      required: ["reason"],
    },
  },
];

export type ToolName = "show_product" | "create_checkout" | "join_waitlist" | "hand_over";

export const SYSTEM_PROMPT = `You are the sales assistant for a Nigerian online shop, chatting with buyers on WhatsApp or Instagram. Your replies are sent straight to the buyer; nobody checks them first.

How to behave:
- Sound like a friendly, professional Nigerian vendor. Plain English; match the buyer if they write in Pidgin. Short: 1 to 3 sentences, under 60 words, at most one emoji.
- Use only the catalogue, the shop's notes and the buyer's orders below. Never invent prices, sizes, colours, stock, delivery fees, delivery times or discounts. If you don't know, hand over.
- To show an item, use show_product. To sell, collect name, full delivery address and city (and a phone number on Instagram), then use create_checkout and send the payment link. Say the money is held safely until they confirm they got the item.
- Every order adds a buyer protection fee, shown below; mention it with the total.
- If an item is sold out, say so and offer to message them when it's back; only use join_waitlist after they agree.
- For order questions, use the buyer's orders below and give the tracking link.
- Hand over to a person for complaints, refunds, discounts, bargaining, custom or bulk requests, or when the buyer asks for a human.
- If the buyer says STOP, don't reply.
- Your final message is the reply text only. If a product card already says it, keep the text short.`;

export function buildBrief(ctx: AgentContext): string {
  const catalogue = ctx.products
    .map(
      p =>
        `- id ${p.id}: ${p.name}, ${naira(p.priceKobo)}, ${p.stock > 0 ? `${p.stock} in stock` : "SOLD OUT"}${p.description ? `. ${p.description.slice(0, 200)}` : ""}`,
    )
    .join("\n");
  const orders = ctx.orders
    .map(o => `- ${o.reference}: ${o.itemName}, ${naira(o.totalKobo)}, status ${o.status}, tracking ${o.trackingLink}${o.payLink && o.status === "PENDING" ? `, pay link ${o.payLink}` : ""}`)
    .join("\n");
  const chat = ctx.messages
    .slice(-20)
    .map(m => `${m.from === "buyer" ? ctx.buyerName : m.from === "shop" ? ctx.shopName : "[system]"}: ${m.text}`)
    .join("\n");
  return `Shop: ${ctx.shopName}, chatting on ${ctx.channel === "WHATSAPP" ? "WhatsApp" : "Instagram"}
Buyer: ${ctx.buyerName}${ctx.buyerWaPhone ? ` (WhatsApp ${ctx.buyerWaPhone})` : " (phone number not known yet)"}
Buyer protection fee per order: ${naira(ctx.buyerFeeKobo)}
${ctx.notes ? `Shop notes from the owner:\n${ctx.notes.slice(0, 2000)}\n` : ""}
Catalogue:
${catalogue || "(no products listed: hand over)"}

This buyer's recent orders:
${orders || "(none)"}
${ctx.waitlisted.length ? `Already waiting for: ${ctx.waitlisted.join(", ")}\n` : ""}
Chat so far (newest last):
${chat}

Reply to the buyer's latest message.`;
}

/** Words that mean "let me talk to a person". Checked before calling the AI so these never wait on it. */
const HUMAN = /\b(human|real person|customer (care|service)|(talk|speak) (to|with) (someone|somebody|a person|the owner|your (boss|manager|oga))|call me)\b/i;
export const wantsHuman = (text: string) => HUMAN.test(text);

export type CheckoutInput = { product_id?: unknown; quantity?: unknown; name?: unknown; address?: unknown; city?: unknown; phone?: unknown };

/** Checks a create_checkout call. Returns what to order or a message the AI can act on. */
export function checkCheckout(
  input: CheckoutInput,
  product: { id: string; stock: number; archived: boolean } | null,
  chatWaPhone: string | null,
): { ok: true; quantity: number; name: string; address: string; city: string; phone: string } | { ok: false; error: string } {
  if (!product || product.archived) return { ok: false, error: "No product with that id in this shop's catalogue." };
  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return { ok: false, error: "Quantity must be a whole number from 1 to 20." };
  if (product.stock < quantity) {
    return { ok: false, error: product.stock ? `Only ${product.stock} in stock. Ask if they want fewer.` : "Sold out. Offer the restock list instead." };
  }
  const name = String(input.name ?? "").trim();
  const address = String(input.address ?? "").trim();
  const city = String(input.city ?? "").trim();
  if (name.length < 2) return { ok: false, error: "Ask for the buyer's name." };
  if (address.length < 8) return { ok: false, error: "Ask for the full delivery address with house number and area." };
  if (city.length < 2) return { ok: false, error: "Ask which city to deliver to." };
  const phone = input.phone ? normalizeNigerianPhone(String(input.phone)) : chatWaPhone;
  if (!phone) return { ok: false, error: "Ask for a Nigerian phone number the rider can call, like 0803 123 4567." };
  return { ok: true, quantity, name: name.slice(0, 100), address: address.slice(0, 300), city: city.slice(0, 60), phone };
}

/** The card text and buttons for a product. Button ids are not shown to the buyer; titles come back as their message. */
export function productCard(p: { id: string; name: string; priceKobo: number; stock: number; description: string | null }) {
  const inStock = p.stock > 0;
  const lines = [
    `*${p.name}*`,
    naira(p.priceKobo),
    inStock ? (p.stock <= 3 ? `Only ${p.stock} left` : "In stock") : "Sold out right now",
    p.description ? p.description.slice(0, 300) : null,
  ].filter(Boolean);
  const buttons = inStock
    ? [
        { id: `buy:${p.id}`, title: "Buy now" },
        { id: `ask:${p.id}`, title: "Ask a question" },
      ]
    : [
        { id: `notify:${p.id}`, title: "Notify me" },
        { id: `similar:${p.id}`, title: "Show similar" },
      ];
  return { body: lines.join("\n"), subtitle: `${naira(p.priceKobo)} · ${inStock ? "In stock" : "Sold out"}`, buttons };
}
