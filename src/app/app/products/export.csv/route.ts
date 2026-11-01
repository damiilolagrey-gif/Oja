import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { toCsv } from "@/lib/catalogue-import";

/** The shop's products as a spreadsheet. Edit it and upload it back, or use it as the template for a new catalogue. */
export async function GET() {
  const user = await requireUser();
  const products = await db.product.findMany({ where: { shopId: user.shopId, archived: false }, orderBy: { createdAt: "asc" } });
  return new Response(toCsv(products), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${user.shop.slug}-products.csv"`,
      "cache-control": "no-store",
    },
  });
}
