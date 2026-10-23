import "server-only";
import type { Channel, Shop } from "@prisma/client";
import { db } from "../db";
import { pickRep } from "../assign";
import { sendInstagramText, sendWhatsAppText, type SendResult } from "../meta";

const ALERT_REPLY_WINDOW_MS = 72 * 60 * 60 * 1000;
const STOP_WORDS = new Set(["STOP", "UNSUBSCRIBE", "STOP ALERTS"]);

export type Inbound = {
  channel: Channel;
  waPhone?: string;
  igUserId?: string;
  igUsername?: string;
  name: string;
  text: string;
  externalId?: string;
  at?: Date;
};

async function chooseRep(shopId: string) {
  const reps = await db.user.findMany({ where: { shopId, active: true }, select: { id: true, active: true, role: true } });
  const pool = reps.some(r => r.role === "REP") ? reps.filter(r => r.role === "REP") : reps;
  const open = await db.conversation.groupBy({ by: ["repId"], where: { shopId, status: "OPEN" }, _count: true });
  const last = await db.conversation.groupBy({ by: ["repId"], where: { shopId }, _max: { startedAt: true } });
  return pickRep(
    pool,
    Object.fromEntries(open.map(o => [o.repId ?? "", o._count])),
    Object.fromEntries(last.map(l => [l.repId ?? "", l._max.startedAt?.getTime() ?? 0])),
  );
}

/** Stores a buyer's message: finds or creates the contact and open chat, links restock-alert replies, handles STOP. */
export async function receiveMessage(shop: Shop, msg: Inbound) {
  if (msg.externalId && (await db.message.findUnique({ where: { externalId: msg.externalId } }))) return null;
  const at = msg.at ?? new Date();

  const contact =
    msg.channel === "WHATSAPP"
      ? await db.contact.upsert({
          where: { shopId_waPhone: { shopId: shop.id, waPhone: msg.waPhone! } },
          create: { shopId: shop.id, waPhone: msg.waPhone!, name: msg.name },
          update: {},
        })
      : await db.contact.upsert({
          where: { shopId_igUserId: { shopId: shop.id, igUserId: msg.igUserId! } },
          create: { shopId: shop.id, igUserId: msg.igUserId!, igUsername: msg.igUsername, name: msg.name },
          update: msg.igUsername ? { igUsername: msg.igUsername } : {},
        });

  let convo = await db.conversation.findFirst({
    where: { shopId: shop.id, contactId: contact.id, channel: msg.channel, status: "OPEN" },
    orderBy: { startedAt: "desc" },
  });

  if (!convo) {
    const alerted =
      msg.channel === "WHATSAPP"
        ? await db.waitlistEntry.findFirst({
            where: { contactId: contact.id, status: "ALERTED", alertedAt: { gte: new Date(at.getTime() - ALERT_REPLY_WINDOW_MS) } },
            orderBy: { alertedAt: "desc" },
            include: { product: true },
          })
        : null;
    convo = await db.conversation.create({
      data: {
        shopId: shop.id,
        contactId: contact.id,
        channel: msg.channel,
        repId: await chooseRep(shop.id),
        productId: alerted?.productId,
        source: alerted ? "ALERT" : "ORGANIC",
        startedAt: at,
        lastBuyerAt: at,
      },
    });
    if (alerted) {
      await db.waitlistEntry.update({ where: { id: alerted.id }, data: { status: "REPLIED" } });
      await db.message.create({
        data: {
          conversationId: convo.id,
          direction: "OUT",
          author: "SYSTEM",
          text: `Restock alert sent for ${alerted.product.name}`,
          createdAt: alerted.alertedAt ?? at,
        },
      });
    }
  } else {
    await db.conversation.update({ where: { id: convo.id }, data: { lastBuyerAt: at } });
  }

  await db.message.create({
    data: { conversationId: convo.id, direction: "IN", author: "BUYER", text: msg.text, externalId: msg.externalId, createdAt: at },
  });

  if (msg.channel === "WHATSAPP" && STOP_WORDS.has(msg.text.trim().toUpperCase())) {
    await db.contact.update({ where: { id: contact.id }, data: { waOptedOut: true } });
    await db.waitlistEntry.updateMany({
      where: { contactId: contact.id, status: { in: ["WAITING", "ALERTED"] } },
      data: { status: "STOPPED" },
    });
    await sendSystemMessage(shop, convo.id, `You won't get more alerts from ${shop.name}.`);
  }
  return convo;
}

async function deliver(shop: Shop, channel: Channel, contact: { waPhone: string | null; igUserId: string | null }, text: string) {
  if (channel === "WHATSAPP") return sendWhatsAppText(shop, contact.waPhone!, text);
  return sendInstagramText(shop, contact.igUserId!, text);
}

async function sendSystemMessage(shop: Shop, conversationId: string, text: string) {
  const c = await db.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { contact: true } });
  const r = await deliver(shop, c.channel, c.contact, text);
  await db.message.create({
    data: { conversationId, direction: "OUT", author: "SYSTEM", text, externalId: r.externalId, deliveryStatus: r.status },
  });
}

/** A rep's reply. The first one stops the reply-time clock for the scorecard. */
export async function sendReply(shop: Shop, conversationId: string, repId: string, text: string): Promise<SendResult> {
  const c = await db.conversation.findFirstOrThrow({ where: { id: conversationId, shopId: shop.id }, include: { contact: true } });
  const r = await deliver(shop, c.channel, c.contact, text);
  const now = new Date();
  await db.message.create({
    data: { conversationId, direction: "OUT", author: "REP", repId, text, externalId: r.externalId, deliveryStatus: r.status },
  });
  if (!c.firstReplyAt && r.status !== "failed") {
    await db.conversation.update({ where: { id: conversationId }, data: { firstReplyAt: now } });
  }
  return r;
}

export async function markWon(shopId: string, conversationId: string, amountKobo: number) {
  const c = await db.conversation.findFirstOrThrow({ where: { id: conversationId, shopId } });
  await db.$transaction(async tx => {
    await tx.conversation.update({ where: { id: c.id }, data: { status: "WON", amountKobo, closedAt: new Date() } });
    if (c.productId) {
      await tx.product.updateMany({ where: { id: c.productId, stock: { gt: 0 } }, data: { stock: { decrement: 1 } } });
      await tx.waitlistEntry.updateMany({
        where: { productId: c.productId, contactId: c.contactId, status: { in: ["ALERTED", "REPLIED", "WAITING"] } },
        data: { status: "BOUGHT" },
      });
    }
  });
}

export async function markLost(shopId: string, conversationId: string) {
  await db.conversation.updateMany({ where: { id: conversationId, shopId }, data: { status: "LOST", closedAt: new Date() } });
}
