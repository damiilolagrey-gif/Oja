import "server-only";
import { Prisma, type Product, type Shop, type User } from "@prisma/client";
import { db } from "../db";
import { naira } from "../format";
import { demandMilestone, parseStaffCommand, productFromCaption, STAFF_HELP } from "../staff-commands";
import { downloadWhatsAppMedia, getInstagramPost, sendDemandTemplate, sendWhatsAppText, type Media } from "../meta";
import { restock } from "./waitlist";

export const productImagePath = (productId: string) => `/api/products/${productId}/image`;

async function saveImage(productId: string, image: Media | null) {
  if (!image) return null;
  await db.productImage.upsert({
    where: { productId },
    create: { productId, mime: image.mime, data: image.data },
    update: { mime: image.mime, data: image.data },
  });
  return db.product.update({ where: { id: productId }, data: { imageUrl: productImagePath(productId) } });
}

type Found = { product: Product } | { reply: string };

/** The product a staff command is about: named in the message, or else the last one we talked to them about. */
async function findProduct(staff: User, query: string | null): Promise<Found> {
  if (!query) {
    const last = staff.lastProductId
      ? await db.product.findFirst({ where: { id: staff.lastProductId, shopId: staff.shopId, archived: false } })
      : null;
    return last ? { product: last } : { reply: "Which product? Add its name, for example: restock Ankara two-piece 10" };
  }
  const matches = await db.product.findMany({
    where: { shopId: staff.shopId, archived: false, name: { contains: query, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    take: 6,
  });
  const exact = matches.find(p => p.name.toLowerCase() === query.toLowerCase());
  if (exact || matches.length === 1) return { product: exact ?? matches[0] };
  if (!matches.length) return { reply: `I couldn't find a product called "${query}". Send list to see your products.` };
  return { reply: `Which one did you mean?\n${matches.map(p => `• ${p.name}`).join("\n")}\nSend the full name.` };
}

async function remember(staff: User, product: Product) {
  await db.user.update({ where: { id: staff.id }, data: { lastProductId: product.id } });
}

async function runCommand(shop: Shop, staff: User, text: string, imageId?: string): Promise<string> {
  const cmd = parseStaffCommand(text, Boolean(imageId));
  if (!cmd) {
    if (/^restock\b/i.test(text.trim())) return "Add how many arrived, for example: restock Lace bubu 10";
    return imageId
      ? "Add the name and price in the photo's caption, like: Ankara two-piece 25000 3"
      : `Hi ${staff.name.split(" ")[0]}! Here's what you can send me:\n\n${STAFF_HELP}`;
  }

  switch (cmd.kind) {
    case "help":
      return STAFF_HELP;

    case "list": {
      const products = await db.product.findMany({
        where: { shopId: shop.id, archived: false },
        include: { _count: { select: { waitlist: { where: { status: "WAITING" } } } } },
        orderBy: [{ stock: "asc" }, { createdAt: "desc" }],
        take: 15,
      });
      if (!products.length) return "No products yet. Send a photo with the name and price in the caption to add one.";
      return products
        .map(p => {
          const stock = p.stock ? `${p.stock} in stock` : "sold out";
          const waiting = p._count.waitlist ? `, ${p._count.waitlist} waiting` : "";
          return `• ${p.name}: ${p.needsPrice ? "price needed" : naira(p.priceKobo)}, ${stock}${waiting}`;
        })
        .join("\n");
    }

    case "add": {
      const product = await db.product.create({
        data: { shopId: shop.id, name: cmd.name, priceKobo: cmd.priceKobo, stock: cmd.stock },
      });
      const photo = imageId ? await saveImage(product.id, await downloadWhatsAppMedia(shop, imageId)) : null;
      await remember(staff, product);
      const noPhoto = imageId && !photo ? " I couldn't save the photo, so add it later in the app." : "";
      return `Added ${product.name} at ${naira(product.priceKobo)}, ${product.stock} in stock.${noPhoto} When it sells out, send: sold out`;
    }

    case "restock": {
      const found = await findProduct(staff, cmd.query);
      if ("reply" in found) return found.reply;
      const r = await restock(shop, found.product.id, cmd.units);
      await remember(staff, found.product);
      const alerted = r.alerted ? ` We sent the restock alert to ${r.alerted} waiting buyer${r.alerted === 1 ? "" : "s"}.` : "";
      const left = r.stillWaiting ? ` ${r.stillWaiting} more are still waiting.` : "";
      const price = found.product.needsPrice ? " It has no price yet, so send: price 25000" : "";
      return `Added ${cmd.units} ${found.product.name}.${alerted}${left}${price}`;
    }

    case "soldout": {
      const found = await findProduct(staff, cmd.query);
      if ("reply" in found) return found.reply;
      await db.product.update({ where: { id: found.product.id }, data: { stock: 0 } });
      await remember(staff, found.product);
      return `${found.product.name} is marked sold out. Buyers can now join its waitlist. When it's back, send: restock 10`;
    }

    case "price": {
      const found = await findProduct(staff, cmd.query);
      if ("reply" in found) return found.reply;
      await db.product.update({ where: { id: found.product.id }, data: { priceKobo: cmd.priceKobo, needsPrice: false } });
      await remember(staff, found.product);
      return `${found.product.name} now costs ${naira(cmd.priceKobo)}.`;
    }
  }
}

/** The active staff member texting from this number, if any. Their messages are commands, not buyer chats. */
export function findStaff(shopId: string, phone: string) {
  return db.user.findFirst({ where: { shopId, phone, active: true } });
}

export async function handleStaffMessage(shop: Shop, staff: User, text: string, imageId?: string) {
  const reply = await runCommand(shop, staff, text, imageId);
  await sendWhatsAppText(shop, staff.phone!, reply);
  return reply;
}

/**
 * The product for an Instagram post, created from its caption and picture the first time a buyer comments RESTOCK on it.
 * Without a price in the caption it is marked as needing one.
 */
export async function productForPost(shop: Shop, mediaId: string): Promise<Product> {
  const existing = await db.product.findUnique({ where: { shopId_igMediaId: { shopId: shop.id, igMediaId: mediaId } } });
  if (existing) return existing;
  const post = await getInstagramPost(shop, mediaId);
  const { name, priceKobo } = productFromCaption(post.caption);
  try {
    const product = await db.product.create({
      data: { shopId: shop.id, igMediaId: mediaId, name, priceKobo: priceKobo ?? 0, needsPrice: !priceKobo, stock: 0 },
    });
    return (await saveImage(product.id, post.image)) ?? product;
  } catch (e) {
    // Two comments on the same post can arrive together; the other one created it.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return db.product.findUniqueOrThrow({ where: { shopId_igMediaId: { shopId: shop.id, igMediaId: mediaId } } });
    }
    throw e;
  }
}

/** When a waitlist reaches 1, 5, 10, 25... buyers, tells the owner on WhatsApp so they restock. */
export async function notifyDemand(shop: Shop, productId: string) {
  const product = await db.product.findUniqueOrThrow({ where: { id: productId } });
  const waiting = await db.waitlistEntry.count({ where: { productId, status: "WAITING" } });
  const milestone = demandMilestone(waiting, product.nudgedFor);
  if (!milestone) return;
  // Claim the milestone first so two sign-ups at once don't both send it.
  const claimed = await db.product.updateMany({ where: { id: productId, nudgedFor: { lt: milestone } }, data: { nudgedFor: milestone } });
  if (!claimed.count) return;

  const staff = await db.user.findMany({ where: { shopId: shop.id, active: true, phone: { not: null } } });
  const owners = staff.filter(u => u.role === "OWNER");
  for (const u of owners.length ? owners : staff) {
    await sendDemandTemplate(shop, u.phone!, [String(waiting), product.name]);
    await db.user.update({ where: { id: u.id }, data: { lastProductId: product.id } });
  }
}
