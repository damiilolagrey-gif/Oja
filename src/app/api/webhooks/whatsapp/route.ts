import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyMetaSignature } from "@/lib/meta-signature";
import { parseWhatsAppWebhook } from "@/lib/meta";
import { receiveMessage } from "@/lib/services/conversations";

/** Meta calls this once to confirm the webhook URL. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET ?? "")) {
    return new Response("Bad signature", { status: 401 });
  }
  const { messages, statuses } = parseWhatsAppWebhook(JSON.parse(raw));

  for (const m of messages) {
    const shop = await db.shop.findUnique({ where: { waPhoneNumberId: m.phoneNumberId } });
    if (!shop) continue;
    await receiveMessage(shop, { channel: "WHATSAPP", waPhone: m.from, name: m.name, text: m.text, externalId: m.id, at: m.at });
  }
  for (const s of statuses) {
    await db.message.updateMany({ where: { externalId: s.id }, data: { deliveryStatus: s.status } });
  }
  return NextResponse.json({ ok: true });
}
