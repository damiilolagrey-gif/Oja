// Local demo data: a shop with sold-out items, waitlists, reps and a few chats.
// Run with `npm run db:seed`. Refuses to run against production.
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Don't seed demo data in production");
  await db.shop.deleteMany({ where: { slug: "asawears" } });
  const hash = await bcrypt.hash("demo-password", 10);
  const shop = await db.shop.create({
    data: {
      name: "Asa Wears",
      slug: "asawears",
      igHandle: "asawears.ng",
      whatsappNumber: "2348030000000",
      bankDetails: "GTBank 0123456789 (Asa Wears)",
      users: {
        create: [
          { name: "Asa Owner", email: "owner@asawears.test", passwordHash: hash, role: "OWNER" },
          { name: "Tolu Adeyemi", email: "tolu@asawears.test", passwordHash: hash, role: "REP" },
          { name: "Chika Obi", email: "chika@asawears.test", passwordHash: hash, role: "REP" },
        ],
      },
    },
    include: { users: true },
  });
  const products = await Promise.all(
    [
      ["Ankara two-piece, size 12", 28500, 0],
      ["Adire silk kaftan", 42000, 0],
      ["Coral bead bracelet set", 12000, 7],
      ["Aso-oke gele, gold", 18500, 0],
      ["Linen agbada, cream", 65000, 3],
    ].map(([name, price, stock]) =>
      db.product.create({ data: { shopId: shop.id, name: String(name), priceKobo: Number(price) * 100, stock: Number(stock) } }),
    ),
  );
  const buyers = [
    ["Bisola A.", "2348034121190", "IG_DM"],
    ["Amaka N.", "2348162204410", "IG_COMMENT"],
    ["Funmi O.", "2347059013321", "IG_COMMENT"],
    ["Grace E.", "2349091182023", "STOREFRONT"],
    ["Zainab M.", "2348125540098", "IG_DM"],
  ] as const;
  for (const [i, [name, waPhone, source]] of buyers.entries()) {
    const contact = await db.contact.create({ data: { shopId: shop.id, name, waPhone } });
    for (const p of [products[0], products[i % 2 ? 1 : 3]]) {
      await db.waitlistEntry.create({
        data: { productId: p.id, contactId: contact.id, source, consentText: "Seeded demo consent", createdAt: new Date(Date.now() - (10 - i) * 3600e3) },
      });
    }
  }
  const [, tolu, chika] = shop.users;
  const igBuyer = await db.contact.create({ data: { shopId: shop.id, name: "Moyo A.", igUserId: "demo-moyo" } });
  await db.conversation.create({
    data: {
      shopId: shop.id, contactId: igBuyer.id, channel: "INSTAGRAM", repId: chika.id, productId: products[4].id,
      startedAt: new Date(Date.now() - 78 * 60e3), lastBuyerAt: new Date(Date.now() - 78 * 60e3),
      messages: { create: { direction: "IN", author: "BUYER", text: "How much is the agbada?", createdAt: new Date(Date.now() - 78 * 60e3) } },
    },
  });
  const waBuyer = await db.contact.create({ data: { shopId: shop.id, name: "Kunle B.", waPhone: "2348061234567" } });
  await db.conversation.create({
    data: {
      shopId: shop.id, contactId: waBuyer.id, channel: "WHATSAPP", repId: tolu.id, productId: products[2].id, status: "WON", amountKobo: 1200000,
      startedAt: new Date(Date.now() - 120 * 60e3), firstReplyAt: new Date(Date.now() - 116 * 60e3), lastBuyerAt: new Date(Date.now() - 100 * 60e3),
      messages: {
        create: [
          { direction: "IN", author: "BUYER", text: "I want the coral beads", createdAt: new Date(Date.now() - 120 * 60e3) },
          { direction: "OUT", author: "REP", repId: tolu.id, text: "₦12,000. GTBank 0123456789", createdAt: new Date(Date.now() - 116 * 60e3) },
          { direction: "IN", author: "BUYER", text: "Paid", createdAt: new Date(Date.now() - 100 * 60e3) },
        ],
      },
    },
  });
  console.log("Seeded Asa Wears. Log in as owner@asawears.test / demo-password");
}

main().finally(() => db.$disconnect());
