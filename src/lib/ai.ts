import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { naira } from "./format";

/**
 * Drafts replies and follow-ups for a rep to check before sending. Needs ANTHROPIC_API_KEY;
 * without it the "Draft with AI" button is hidden.
 */

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

const MODEL = "claude-opus-5-5";

export type DraftInput = {
  shopName: string;
  channel: "INSTAGRAM" | "WHATSAPP";
  buyerName: string;
  products: { name: string; priceKobo: number; stock: number; buyLink: string; notifyLink: string }[];
  focusProduct: string | null;
  messages: { from: "buyer" | "shop" | "system"; text: string; at: Date }[];
  bankDetails: string | null;
};

const SYSTEM = `You write chat replies for a Nigerian online shop that sells on Instagram and WhatsApp. A sales rep reads your draft and sends it themselves.

How to write:
- Sound like a friendly, professional Nigerian vendor. Plain English; light Nigerian warmth is fine, no heavy pidgin unless the buyer writes in pidgin.
- Keep it short: 1 to 3 sentences, under 60 words. No greetings longer than a word or two. No hashtags. At most one emoji.
- Answer what the buyer actually asked. Use only the products, prices and stock listed. Never invent prices, sizes, delivery times or discounts; if you don't know, say the rep will confirm.
- When the buyer is ready to buy an in-stock item, give that item's Pay safely link and say their money is held until it reaches them.
- When an item is sold out, offer its notify link.
- Output only the message text, nothing else.`;

function describe(input: DraftInput, mode: "reply" | "follow_up") {
  const catalogue = input.products
    .map(p => `- ${p.name}: ${naira(p.priceKobo)}, ${p.stock > 0 ? `${p.stock} in stock, Pay safely link ${p.buyLink}` : `sold out, notify link ${p.notifyLink}`}`)
    .join("\n");
  const chat = input.messages
    .slice(-20)
    .map(m => `${m.from === "buyer" ? input.buyerName : m.from === "shop" ? input.shopName : "[system]"}: ${m.text}`)
    .join("\n");
  const task =
    mode === "follow_up"
      ? `The buyer has gone quiet. Write one gentle follow-up that picks up where the chat left off and makes it easy to buy. Don't be pushy and don't repeat the last message.`
      : `Write the shop's next reply to the buyer.`;
  return `Shop: ${input.shopName} (chatting on ${input.channel === "INSTAGRAM" ? "Instagram" : "WhatsApp"})
Product this chat is about: ${input.focusProduct ?? "not set"}
${input.bankDetails ? `Shop also accepts bank transfer: ${input.bankDetails}, but prefer the Pay safely link.\n` : ""}
Catalogue:
${catalogue || "(no products listed)"}

Chat so far:
${chat || "(no messages yet)"}

${task}`;
}

export async function draftMessage(input: DraftInput, mode: "reply" | "follow_up"): Promise<{ text: string } | { error: string }> {
  if (!aiConfigured()) return { error: "AI drafts are off. Add ANTHROPIC_API_KEY to turn them on." };
  const client = new Anthropic();
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: describe(input, mode) }],
    });
    if (res.stop_reason === "refusal") return { error: "The AI couldn't draft this one. Write it yourself." };
    const text = res.content.flatMap(b => (b.type === "text" ? [b.text] : [])).join("").trim();
    return text ? { text } : { error: "The AI returned an empty draft. Try again." };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { error: "Too many AI drafts right now. Try again in a minute." };
    if (e instanceof Anthropic.AuthenticationError) return { error: "The AI key is wrong. Check ANTHROPIC_API_KEY." };
    if (e instanceof Anthropic.APIError) return { error: `AI error (${e.status}). Try again.` };
    return { error: "Couldn't reach the AI. Check your connection and try again." };
  }
}

const AD_SYSTEM = `You write short Facebook and Instagram ad captions for a Nigerian online shop. The shop owner reads and edits your caption before the ad runs.

How to write:
- 2 to 3 short lines, under 45 words. At most two emoji. No hashtags.
- Lead with the product and why someone would want it. Include the price exactly as given.
- Mention that payment is protected: the buyer pays through Oja SafePay and the money is held until the item arrives.
- Use only the facts given. Never invent discounts, sizes, colours, delivery times or claims like "best" or "original".
- Follow Meta's ad rules: no "you" statements about personal attributes (age, body, health, finances), no clickbait, no all-caps words.
- Output only the caption text.`;

export async function draftAdCaption(p: { shopName: string; product: string; priceKobo: number; stock: number; area: string }): Promise<{ text: string } | { error: string }> {
  if (!aiConfigured()) return { error: "AI drafts are off. Add ANTHROPIC_API_KEY to turn them on." };
  const client = new Anthropic();
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 1000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: AD_SYSTEM,
      messages: [{
        role: "user",
        content: `Shop: ${p.shopName}\nProduct: ${p.product}\nPrice: ${naira(p.priceKobo)}\nIn stock: ${p.stock}\nShown to people in: ${p.area === "Nigeria" ? "all of Nigeria" : p.area}\n\nWrite the caption.`,
      }],
    });
    if (res.stop_reason === "refusal") return { error: "The AI couldn't write this one. Write it yourself." };
    const text = res.content.flatMap(b => (b.type === "text" ? [b.text] : [])).join("").trim();
    return text ? { text } : { error: "The AI returned an empty caption. Try again." };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { error: "Too many AI drafts right now. Try again in a minute." };
    if (e instanceof Anthropic.AuthenticationError) return { error: "The AI key is wrong. Check ANTHROPIC_API_KEY." };
    if (e instanceof Anthropic.APIError) return { error: `AI error (${e.status}). Try again.` };
    return { error: "Couldn't reach the AI. Check your connection and try again." };
  }
}
