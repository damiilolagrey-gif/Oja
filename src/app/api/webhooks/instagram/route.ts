import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyMetaSignature } from "@/lib/meta-signature";
import { getInstagramProfile, parseInstagramWebhook, sendInstagramPrivateReply } from "@/lib/meta";
import { receiveMessage } from "@/lib/services/conversations";

const WAITLIST_KEYWORDS = /\b(restock|notify|waitlist)\b/i;

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
  for (const ev of parseInstagramWebhook(JSON.parse(raw))) {
    const shop = await db.shop.findUnique({ where: { igAccountId: ev.igAccountId } });
    if (!shop) continue;
    if (ev.kind === "dm") {
      const known = await db.contact.findUnique({ where: { shopId_igUserId: { shopId: shop.id, igUserId: ev.from } } });
      const profile = known ? {} : await getInstagramProfile(shop, ev.from);
      await receiveMessage(shop, {
        channel: "INSTAGRAM",
        igUserId: ev.from,
        igUsername: profile.username,
        name: known?.name ?? profile.name ?? (profile.username ? `@${profile.username}` : "Instagram buyer"),
        text: ev.text,
        externalId: ev.id,
        at: ev.at,
      });
    } else if (WAITLIST_KEYWORDS.test(ev.text)) {
      // "Comment RESTOCK to get notified": answer privately with the shop's waitlist link.
      const link = `${process.env.APP_URL}/s/${shop.slug}?ref=ig-comment`;
      await sendInstagramPrivateReply(
        shop,
        ev.commentId,
        `Hi @${ev.username}! Pick the item you want here and we'll WhatsApp you the minute it's back: ${link}`,
      );
    }
  }
  return NextResponse.json({ ok: true });
}
