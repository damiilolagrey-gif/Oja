import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { naira } from "@/lib/format";
import { ActionForm, Submit } from "@/components/ActionForm";
import { restockProduct, saveProduct } from "@/app/actions/products";
import { whatsappConnected } from "@/lib/meta";
import { ProductFields } from "./ProductFields";

export const dynamic = "force-dynamic";

export default async function Products() {
  const user = await requireUser();
  const products = await db.product.findMany({
    where: { shopId: user.shopId, archived: false },
    orderBy: [{ stock: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { waitlist: { where: { status: "WAITING" } } } } },
  });
  const shopUrl = `${process.env.APP_URL ?? ""}/s/${user.shop.slug}`;

  return (
    <>
      <div className="stack" style={{ gap: 4 }}>
        <h1>Products</h1>
        <p className="muted small">
          Your shop link for your Instagram bio and WhatsApp status: <span className="code">{shopUrl}</span>
        </p>
      </div>

      <details className="panel">
        <summary className="panel-h"><h2>Add a product</h2><span className="btn primary">Add</span></summary>
        <div className="panel-b">
          <ActionForm action={saveProduct}>
            <ProductFields />
            <Submit>Add product</Submit>
          </ActionForm>
        </div>
      </details>

      <details className="panel">
        <summary className="panel-h"><h2>Add products from WhatsApp</h2><span className="btn">How</span></summary>
        <div className="panel-b stack small">
          <p>Message your shop&apos;s WhatsApp number from your own phone. First add your number on the Team page.</p>
          <p><b>Send a photo</b> with the name, price and how many you have as the caption: <span className="code">Ankara two-piece 25000 3</span></p>
          <p><b>restock Ankara 10</b> adds stock and alerts the waitlist. <b>sold out Ankara</b> opens the waitlist. <b>price Ankara 27000</b> changes the price. <b>list</b> shows what&apos;s sold out.</p>
          <p>When buyers comment RESTOCK on an Instagram post, that post becomes a product here on its own. If the caption has no price, it shows <span className="pill gold">Price needed</span> until you add one.</p>
          {!whatsappConnected(user.shop) && <p className="muted">This starts working once WhatsApp is connected in Settings.</p>}
        </div>
      </details>

      <section className="panel list">
        {products.length === 0 && <p className="item muted">No products yet. Add the items you post on Instagram.</p>}
        {products.map(p => (
          <div key={p.id} className="product">
            {p.imageUrl ? <img src={p.imageUrl} alt="" className="thumb" /> : <div className="thumb">{p.name[0]}</div>}
            <div style={{ minWidth: 0 }}>
              <Link href={`/app/products/${p.id}`} className="name" style={{ color: "inherit" }}>{p.name}</Link>
              <div className="row small" style={{ marginTop: 4 }}>
                {p.needsPrice ? <span className="pill gold">Price needed</span> : <span className="num">{naira(p.priceKobo)}</span>}
                {p.stock ? <span className="pill plain num">{p.stock} in stock</span> : <span className="pill bad">Sold out</span>}
                {p._count.waitlist > 0 && <span className="pill gold">{p._count.waitlist} waiting</span>}
              </div>
              <ActionForm action={restockProduct} className="stack">
                <input type="hidden" name="productId" value={p.id} />
                <div className="restock">
                  <input className="input" name="units" type="number" inputMode="numeric" min={1} defaultValue={p.stock ? "" : 3} placeholder="Units" aria-label={`Units of ${p.name} arriving`} required />
                  <Submit className={`btn ${p._count.waitlist ? "wa" : ""}`} pendingText="Sending…">
                    {p._count.waitlist ? "Restock & alert" : "Add stock"}
                  </Submit>
                </div>
              </ActionForm>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
