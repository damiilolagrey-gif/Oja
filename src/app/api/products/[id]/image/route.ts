import { db } from "@/lib/db";

/** Product photos are public: they appear on the shop page. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const image = await db.productImage.findUnique({ where: { productId: (await params).id } });
  if (!image) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(image.data), {
    headers: { "Content-Type": image.mime, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}
