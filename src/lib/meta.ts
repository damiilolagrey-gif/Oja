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

/** Sends an approved WhatsApp template. Shops that haven't connected WhatsApp get a simulated send. */
async function sendTemplate(shop: ShopCreds, to: string, name: string, vars: string[]): Promise<SendResult> {
  if (!whatsappConnected(shop)) return { status: "simulated", externalId: null };
  return post(`https://graph.facebook.com/${version()}/${shop.waPhoneNumberId}/messages`, decrypt(shop.waTokenEnc!), {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: process.env.WA_TEMPLATE_LANG || "en" },
      components: [{ type: "body", parameters: vars.map(text => ({ type: "text", text })) }],
    },
  });
}

export const sendRestockTemplate = (
  shop: ShopCreds,
  to: string,
  vars: [product: string, shopName: string, unitsLeft: string, price: string],
) => sendTemplate(shop, to, process.env.WA_RESTOCK_TEMPLATE || "back_in_stock", vars);

/** Tells shop staff how many buyers are waiting; it opens the chat they answer with "restock 10". */
export const sendDemandTemplate = (shop: ShopCreds, to: string, vars: [waiting: string, product: string]) =>
  sendTemplate(shop, to, process.env.WA_DEMAND_TEMPLATE || "waitlist_demand", vars);

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
  if (!process.env.WA_ORDER_TEMPLATE) return { status: "simulated", externalId: null };
  return sendTemplate(shop, to, process.env.WA_ORDER_TEMPLATE, vars);
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

export type Media = { mime: string; data: Uint8Array<ArrayBuffer> };
const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

async function download(url: string, token?: string): Promise<Media | null> {
  try {
    const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
    const mime = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (!res.ok || !mime.startsWith("image/")) return null;
    const data = new Uint8Array(await res.arrayBuffer());
    return data.length <= MAX_MEDIA_BYTES ? { mime, data } : null;
  } catch {
    return null;
  }
}

/** Fetches a photo a staff member sent over WhatsApp. */
export async function downloadWhatsAppMedia(shop: ShopCreds, mediaId: string): Promise<Media | null> {
  if (!whatsappConnected(shop)) return null;
  const token = decrypt(shop.waTokenEnc!);
  try {
    const res = await fetch(`https://graph.facebook.com/${version()}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } });
    const meta = (await res.json()) as { url?: string };
    return res.ok && meta.url ? download(meta.url, token) : null;
  } catch {
    return null;
  }
}

/** An Instagram post's caption and picture (the thumbnail for videos). */
export async function getInstagramPost(shop: ShopCreds, mediaId: string): Promise<{ caption?: string; image: Media | null }> {
  if (!instagramConnected(shop)) return { image: null };
  try {
    const res = await fetch(`https://graph.instagram.com/${version()}/${mediaId}?fields=caption,media_type,media_url,thumbnail_url`, {
      headers: { Authorization: `Bearer ${decrypt(shop.igTokenEnc!)}` },
    });
    if (!res.ok) return { image: null };
    const post = (await res.json()) as { caption?: string; media_type?: string; media_url?: string; thumbnail_url?: string };
    const src = post.media_type === "VIDEO" ? post.thumbnail_url : post.media_url;
    return { caption: post.caption, image: src ? await download(src) : null };
  } catch {
    return { image: null };
  }
}

// ---------- Webhook parsing ----------

export type InboundWhatsApp = {
  phoneNumberId: string;
  from: string;
  name: string;
  text: string;
  imageId?: string;
  id: string;
  at: Date;
};
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
    image?: { id?: string; caption?: string };
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
          m.text?.body ??
          m.image?.caption ??
          m.button?.text ??
          m.interactive?.button_reply?.title ??
          m.interactive?.list_reply?.title ??
          `[${m.type}]`;
        const name = v.contacts?.find(c => c.wa_id === m.from)?.profile?.name ?? m.from;
        out.messages.push({
          phoneNumberId,
          from: m.from,
          name,
          text,
          imageId: m.image?.id,
          id: m.id,
          at: new Date(Number(m.timestamp) * 1000),
        });
      }
      for (const s of v.statuses ?? []) out.statuses.push({ id: s.id, status: s.status });
    }
  }
  return out;
}

export type InboundInstagram =
  | { kind: "dm"; igAccountId: string; from: string; text: string; id: string; at: Date }
  | {
      kind: "comment";
      igAccountId: string;
      from: string;
      username: string;
      text: string;
      commentId: string;
      mediaId?: string;
      at: Date;
    };

type IgEntry = {
  id: string;
  time?: number;
  messaging?: { sender?: { id?: string }; timestamp?: number; message?: { mid?: string; text?: string; is_echo?: boolean } }[];
  changes?: { field?: string; value?: { id?: string; text?: string; from?: { id?: string; username?: string }; media?: { id?: string } } }[];
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
        mediaId: v.media?.id,
        at: new Date((e.time ?? Date.now() / 1000) * 1000),
      });
    }
  }
  return out;
}
