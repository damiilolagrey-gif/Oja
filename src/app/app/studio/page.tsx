import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { naira } from "@/lib/format";
import { aiConfigured } from "@/lib/ai";
import { ActionForm, Submit } from "@/components/ActionForm";
import { saveBrand } from "@/app/actions/studio";
import { StudioNav } from "./StudioNav";
import { PromptForm } from "./PromptForm";
import { AdThumb } from "./AdThumb";
import { adView } from "./view";

export const dynamic = "force-dynamic";

export default async function Studio({ searchParams }: { searchParams: Promise<{ new?: string; busy?: string; product?: string }> }) {
  const user = await requirePermission("studio");
  const q = await searchParams;
  const fresh = (q.new ?? "").split(",").filter(Boolean).slice(0, 6);
  const shop = user.shop;
  const productSelect = { product: { select: { name: true, priceKobo: true, imageUrl: true } } };
  const [products, latest, recent] = await Promise.all([
    db.product.findMany({
      where: { shopId: user.shopId, archived: false },
      orderBy: [{ createdAt: "desc" }],
      include: { _count: { select: { creatives: true } } },
    }),
    fresh.length ? db.adCreative.findMany({ where: { id: { in: fresh }, shopId: user.shopId }, include: productSelect, orderBy: { createdAt: "asc" } }) : [],
    db.adCreative.findMany({ where: { shopId: user.shopId, design: { not: Prisma.AnyNull }, id: { notIn: fresh } }, include: productSelect, orderBy: { createdAt: "desc" }, take: 12 }),
  ]);
  const card = (c: (typeof recent)[number]) => {
    const v = adView(c, shop.name);
    if (!v) return null;
    return (
      <Link key={c.id} href={`/app/studio/ad/${c.id}`} className="panel concept">
        <AdThumb design={v.design} item={v.item} photo={v.photo} label={`${c.angle} ad for ${v.item.name}`} />
        <b className="small">{c.angle}</b>
        <span className="hint">{v.item.name}</span>
      </Link>
    );
  };

  return (
    <>
      <StudioNav on="studio" />
      <div className="stack" style={{ gap: 4 }}>
        <h1>Ad studio</h1>
        <p className="muted">Describe the ad you want. You get three finished ads with images, a short video and captions for Instagram, Facebook, TikTok, Google and WhatsApp Status. Each one opens a WhatsApp chat with your shop.</p>
      </div>

      <PromptForm products={products.map(p => ({ id: p.id, name: p.name }))} start={products.find(p => p.id === q.product)?.id ?? products[0]?.id ?? ""} />
      {!aiConfigured() && <p className="notice small">The AI designer is off, so ads are built from ready-made designs that follow your idea&apos;s theme. They still use your real prices and stock.</p>}

      {latest.length > 0 && (
        <section className="stack" id="new">
          <h2>Your new ads</h2>
          {q.busy && <p className="notice small">The AI designer was busy, so these come from our ready-made designs.</p>}
          <div className="concepts">{latest.map(card)}</div>
          <p className="hint">Tap an ad to change the words or colours, pick a size, and download it as an image or video.</p>
        </section>
      )}

      {recent.length > 0 && (
        <section className="stack">
          <h2>Your ads</h2>
          <div className="concepts">{recent.map(card)}</div>
        </section>
      )}

      {!shop.whatsappNumber && (
        <p className="notice">Add your shop&apos;s WhatsApp number in <Link href="/app/settings">Settings</Link> so ads open a WhatsApp chat. Until then they link to your shop page.</p>
      )}

      <details className="panel">
        <summary className="panel-h"><h2>Captions only, by product</h2><span className="btn">Open</span></summary>
        <div className="list">
          {products.length === 0 && <p className="item muted">Add a product first.</p>}
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
        </div>
      </details>

      <details className="panel">
        <summary className="panel-h"><h2>Your brand</h2><span className="btn">Edit</span></summary>
        <div className="panel-b">
          <ActionForm action={saveBrand}>
            <label className="field">Brand colour
              <input className="input" type="color" name="brandColor" defaultValue={shop.brandColor ?? "#2f3b8f"} style={{ height: 44, padding: 4 }} />
              <span className="hint">Used when your idea doesn&apos;t ask for other colours.</span>
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
