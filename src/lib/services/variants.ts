import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { totalStock } from "../variants";

type Tx = Prisma.TransactionClient | typeof db;

/** Keeps a product's stock equal to the total of its options. Does nothing for products without options. */
export async function syncStock(productId: string, tx: Tx = db) {
  const variants = await tx.productVariant.findMany({ where: { productId, archived: false } });
  if (!variants.length) return null;
  const stock = totalStock(variants);
  await tx.product.update({ where: { id: productId }, data: { stock } });
  return stock;
}

export const hasVariants = async (productId: string) => (await db.productVariant.count({ where: { productId, archived: false } })) > 0;
