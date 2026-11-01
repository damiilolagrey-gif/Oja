import { lookup } from "node:dns/promises";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { isPrivateAddress } from "@/lib/net";

const MAX_BYTES = 8_000_000;

/**
 * Serves a product's photo from our own address so the ad maker can draw it on a canvas and save the result
 * (browsers refuse to export a canvas that holds another site's image). Only the shop's own product photos,
 * only https, and never an address inside our network.
 */
export async function GET(_: Request, { params }: { params: Promise<{ productId: string }> }) {
  const user = await requirePermission("studio");
  const { productId } = await params;
  const p = await db.product.findFirst({ where: { id: productId, shopId: user.shopId }, select: { imageUrl: true } });
  if (!p?.imageUrl) return new Response("No photo", { status: 404 });

  let url = p.imageUrl;
  for (let hop = 0; hop < 3; hop++) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return new Response("Bad photo link", { status: 400 });
    }
    if (u.protocol !== "https:") return new Response("Photo link must be https", { status: 400 });
    const addrs = await lookup(u.hostname, { all: true }).catch(() => []);
    if (!addrs.length || addrs.some(a => isPrivateAddress(a.address))) return new Response("Photo address not allowed", { status: 400 });

    const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(6000) }).catch(() => null);
    if (!res) return new Response("Couldn't load the photo", { status: 502 });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, u).toString();
      continue;
    }
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return new Response("That link isn't a photo", { status: 502 });
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return new Response("Photo too large", { status: 413 });
    const body = await res.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return new Response("Photo too large", { status: 413 });
    return new Response(body, { headers: { "content-type": type, "cache-control": "private, max-age=3600" } });
  }
  return new Response("Too many redirects", { status: 502 });
}
