import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { naira } from "@/lib/format";
import { aiConfigured } from "@/lib/ai";
import { ActionForm, Submit } from "@/components/ActionForm";
import { saveBrand } from "@/app/actions/studio";

export const dynamic = "force-dynamic";

export default async function Studio() {
  const user = await requirePermission("studio");
  const products = await db.product.findMany({
    where: { shopId: user.shopId, archived: false },
    orderBy: [{ createdAt: "desc" }],
    include: { _count: { select: { creatives: true } } },
  });
  const shop = user.shop;

  return (
    <>
      <div className="stack" style={{ gap: 4 }}>
        <h1>Creative studio</h1>
        <p className="muted">Pick a product to get ad captions for Instagram, Facebook, TikTok and Google, and ad images in every size. Every ad sends buyers to your WhatsApp.</p>
      </div>

      {!shop.whatsappNumber && (
        <p className="notice">Add your shop&apos;s WhatsApp number in <Link href="/app/settings">Settings</Link> so ads open a WhatsApp chat. Until then they link to your shop page.</p>
      )}
      {!aiConfigured() && <p className="notice small">The AI writer is off, so captions come from ready-made templates. They still use your real prices and stock.</p>}

      <section className="panel list">
        {products.length === 0 && <p className="item muted">Add a product first, then come back to make ads for it.</p>}
        {products.map(p => (
          <Link key={p.id} href={`/app/studio/${p.id}`} className="product" style={{ color: "inherit", textDecoration: "none" }}>
            {p.imageUrl ? <img src={p.imageUrl} alt="" className="thumb" /> : <div className="thumb">{p.name[0]}</div>}
            <div style={{ minWidth: 0 }}>
              <b className="name">{p.name}</b>
              <div className="row small" style={{ marginTop: 4 }}>
                <span className="num">{naira(p.priceKobo)}</span>
                {p.stock ? <span className="pill plain num">{p.stock} in stock</span> : <span className="pill bad">Sold out</span>}
                {p._count.creatives > 0 && <span className="pill good">{p._count.creatives} ads</span>}
              </div>
            </div>
          </Link>
        ))}
      </section>

      <details className="panel">
        <summary className="panel-h"><h2>Your brand</h2><span className="btn">Edit</span></summary>
        <div className="panel-b">
          <ActionForm action={saveBrand}>
            <label className="field">Brand colour
              <input className="input" type="color" name="brandColor" defaultValue={shop.brandColor ?? "#2f3b8f"} style={{ height: 44, padding: 4 }} />
              <span className="hint">Used as the background of your ad images.</span>
            </label>
            <label className="field">How your shop sounds
              <textarea className="input" name="brandVoice" rows={2} maxLength={300} defaultValue={shop.brandVoice ?? ""} placeholder="Warm and classy. Light pidgin is fine. We love the word 'babe'." />
              <span className="hint">The AI writer follows this.</span>
            </label>
            <Submit>Save brand</Submit>
          </ActionForm>
        </div>
      </details>
    </>
  );
}
