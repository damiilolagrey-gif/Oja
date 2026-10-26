import { decrypt } from "./crypto";

export type SendResult = { status: "sent" | "simulated" | "failed"; externalId: string | null; error?: string };

type ShopCreds = {
  waPhoneNumberId: string | null;
  waTokenEnc: string | null;
  igAccountId: string | null;
  igTokenEnc: string | null;
};

const version = () => process.env.META_GRAPH_VERSION || "v21.0";

async function post(url: string, token: string, body: unknown): Promise<SendResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      message_id?: string;
      error?: { message?: string };
    };
    if (!res.ok) return { status: "failed", externalId: null, error: json.error?.message ?? `HTTP ${res.status}` };
    return { status: "sent", externalId: json.messages?.[0]?.id ?? json.message_id ?? null };
  } catch (e) {
    return { status: "failed", externalId: null, error: (e as Error).message };
  }
}

export const whatsappConnected = (s: ShopCreds) => Boolean(s.waPhoneNumberId && s.waTokenEnc);
export const instagramConnected = (s: ShopCreds) => Boolean(s.igAccountId && s.igTokenEnc);

/** Sends the approved restock template. Shops that haven't connected WhatsApp get a simulated send. */
export async function sendRestockTemplate(
  shop: ShopCreds,
  to: string,
  vars: [product: string, shopName: string, unitsLeft: string, price: string],
): Promise<SendResult> {
  if (!whatsappConnected(shop)) return { status: "simulated", externalId: null };
  return post(`https://graph.facebook.com/${version()}/${shop.waPhoneNumberId}/messages`, decrypt(shop.waTokenEnc!), {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: process.env.WA_RESTOCK_TEMPLATE || "back_in_stock",
      language: { code: process.env.WA_TEMPLATE_LANG || "en" },
      components: [{ type: "body", parameters: vars.map(text => ({ type: "text", text })) }],
    },
  });
}

/**
 * SafePay order updates (paid, dispatched, delivered) on an approved template, so they arrive even outside
 * the 24-hour window. Body variables: {{1}} shop name, {{2}} the update, {{3}} the buyer's tracking link.
 * Simulated until the shop connects WhatsApp and WA_ORDER_TEMPLATE is set.
 */
export async function sendOrderUpdateTemplate(
  shop: ShopCreds,
  to: string,
  vars: [shopName: string, update: string, link: string],
): Promise<SendResult> {
  if (!whatsappConnected(shop) || !process.env.WA_ORDER_TEMPLATE) return { status: "simulated", externalId: null };
  return post(`https://graph.facebook.com/${version()}/${shop.waPhoneNumberId}/messages`, decrypt(shop.waTokenEnc!), {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: process.env.WA_ORDER_TEMPLATE,
      language: { code: process.env.WA_TEMPLATE_LANG || "en" },
      components: [{ type: "body", parameters: vars.map(text => ({ type: "text", text })) }],
    },
  });
}

/** Free-form WhatsApp text. Meta only delivers it within 24 hours of the buyer's last message. */
export async function sendWhatsAppText(shop: ShopCreds, to: string, text: string): Promise<SendResult> {
  if (!whatsappConnected(shop)) return { status: "simulated", externalId: null };
  return post(`https://graph.facebook.com/${version()}/${shop.waPhoneNumberId}/messages`, decrypt(shop.waTokenEnc!), {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  });
}

export async function sendInstagramText(shop: ShopCreds, igUserId: string, text: string): Promise<SendResult> {
  if (!instagramConnected(shop)) return { status: "simulated", externalId: null };
  return post(`https://graph.instagram.com/${version()}/${shop.igAccountId}/messages`, decrypt(shop.igTokenEnc!), {
    recipient: { id: igUserId },
    message: { text },
  });
}

/** One private DM in reply to a public comment (used for "comment RESTOCK" posts). */
export async function sendInstagramPrivateReply(shop: ShopCreds, commentId: string, text: string): Promise<SendResult> {
  if (!instagramConnected(shop)) return { status: "simulated", externalId: null };
  return post(`https://graph.instagram.com/${version()}/${shop.igAccountId}/messages`, decrypt(shop.igTokenEnc!), {
    recipient: { comment_id: commentId },
    message: { text },
  });
}

/** Looks up an Instagram buyer's name and username (the DM webhook only carries their id). */
export async function getInstagramProfile(shop: ShopCreds, igUserId: string): Promise<{ name?: string; username?: string }> {
  if (!instagramConnected(shop)) return {};
  try {
    const res = await fetch(`https://graph.instagram.com/${version()}/${igUserId}?fields=name,username`, {
      headers: { Authorization: `Bearer ${decrypt(shop.igTokenEnc!)}` },
    });
    return res.ok ? ((await res.json()) as { name?: string; username?: string }) : {};
  } catch {
    return {};
  }
}

// ---------- Webhook parsing ----------

export type InboundWhatsApp = { phoneNumberId: string; from: string; name: string; text: string; id: string; at: Date };
export type WhatsAppStatus = { id: string; status: string };

type WaValue = {
  metadata?: { phone_number_id?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: {
    from: string;
    id: string;
    timestamp: string;
    type: string;
    text?: { body?: string };
    button?: { text?: string };
    interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  }[];
  statuses?: { id: string; status: string }[];
};

export function parseWhatsAppWebhook(body: unknown): { messages: InboundWhatsApp[]; statuses: WhatsAppStatus[] } {
  const out = { messages: [] as InboundWhatsApp[], statuses: [] as WhatsAppStatus[] };
  const entries = (body as { entry?: { changes?: { value?: WaValue }[] }[] })?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      const phoneNumberId = v?.metadata?.phone_number_id;
      if (!v || !phoneNumberId) continue;
      for (const m of v.messages ?? []) {
        const text =
          m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? `[${m.type}]`;
        const name = v.contacts?.find(c => c.wa_id === m.from)?.profile?.name ?? m.from;
        out.messages.push({ phoneNumberId, from: m.from, name, text, id: m.id, at: new Date(Number(m.timestamp) * 1000) });
      }
      for (const s of v.statuses ?? []) out.statuses.push({ id: s.id, status: s.status });
    }
  }
  return out;
}

export type InboundInstagram =
  | { kind: "dm"; igAccountId: string; from: string; text: string; id: string; at: Date }
  | { kind: "comment"; igAccountId: string; from: string; username: string; text: string; commentId: string; at: Date };

type IgEntry = {
  id: string;
  time?: number;
  messaging?: { sender?: { id?: string }; timestamp?: number; message?: { mid?: string; text?: string; is_echo?: boolean } }[];
  changes?: { field?: string; value?: { id?: string; text?: string; from?: { id?: string; username?: string } } }[];
};

export function parseInstagramWebhook(body: unknown): InboundInstagram[] {
  const out: InboundInstagram[] = [];
  const entries = (body as { entry?: IgEntry[] })?.entry ?? [];
  for (const e of entries) {
    for (const m of e.messaging ?? []) {
      if (!m.message || m.message.is_echo || !m.sender?.id || m.sender.id === e.id) continue;
      out.push({
        kind: "dm",
        igAccountId: e.id,
        from: m.sender.id,
        text: m.message.text ?? "[attachment]",
        id: m.message.mid ?? `${m.sender.id}-${m.timestamp}`,
        at: new Date(m.timestamp ?? Date.now()),
      });
    }
    for (const c of e.changes ?? []) {
      const v = c.value;
      if (c.field !== "comments" || !v?.id || !v.from?.id || v.from.id === e.id) continue;
      out.push({
        kind: "comment",
        igAccountId: e.id,
        from: v.from.id,
        username: v.from.username ?? v.from.id,
        text: v.text ?? "",
        commentId: v.id,
        at: new Date((e.time ?? Date.now() / 1000) * 1000),
      });
    }
  }
  return out;
}
