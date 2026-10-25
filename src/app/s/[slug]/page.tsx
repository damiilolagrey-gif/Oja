import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { naira } from "@/lib/format";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  return db.shop.findUnique({
    where: { slug },
    include: { products: { where: { archived: false }, orderBy: [{ stock: "desc" }, { createdAt: "desc" }] } },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const shop = await load((await params).slug);
  return { title: shop?.name ?? "Shop" };
}

export default async function Storefront({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ref?: string }> }) {
  const shop = await load((await params).slug);
  if (!shop) notFound();
  const ref = (await searchParams).ref;
  // Orders go to the shop's WhatsApp when it has one; otherwise to its Instagram DMs.
  const orderLink = (name: string) =>
    shop.whatsappNumber
      ? `https://wa.me/${shop.whatsappNumber}?text=${encodeURIComponent(`Hi ${shop.name}, I'd like to order: ${name}`)}`
      : shop.igHandle
        ? `https://ig.me/m/${shop.igHandle}`
        : null;

  return (
    <main className="store">
      <header className="store-head">
        <div className="av">{shop.name[0]}</div>
        <div>
          <h1 style={{ fontSize: 22 }}>{shop.name}</h1>
          {shop.igHandle && <a href={`https://instagram.com/${shop.igHandle}`} className="small">@{shop.igHandle}</a>}
        </div>
      </header>
      <div className="store-grid">
        {shop.products.map(p => {
          const order = orderLink(p.name);
          return (
            <article key={p.id} className="card">
              <div className="img">
                {p.imageUrl ? <img src={p.imageUrl} alt="" /> : p.name[0]}
                {p.stock === 0 && <span className="so">SOLD OUT</span>}
              </div>
              <div className="info">
                <div className="stack" style={{ gap: 2 }}><b>{p.name}</b><span className="num small">{p.needsPrice ? "Ask for price" : naira(p.priceKobo)}</span></div>
                {p.stock === 0 ? (
                  <Link className="btn primary block" href={`/s/${shop.slug}/notify/${p.id}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`}>Notify me</Link>
                ) : order ? (
                  <a className="btn wa block" href={order}>Order</a>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      {shop.products.length === 0 && <p className="muted">No items yet.</p>}
      <p className="foot">Sell on Instagram? <Link href="/">Get your own waitlist free with Oja</Link></p>
    </main>
  );
}
