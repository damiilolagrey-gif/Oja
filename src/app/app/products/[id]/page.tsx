import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { naira, timeOfDay } from "@/lib/format";
import { displayPhone } from "@/lib/phone";
import { ActionForm, Submit } from "@/components/ActionForm";
import { addToWaitlist, archiveProduct, restockProduct, saveProduct } from "@/app/actions/products";
import { ProductFields } from "../ProductFields";

export const dynamic = "force-dynamic";

const SOURCE: Record<string, string> = { IG_DM: "IG DM", IG_COMMENT: "IG comment", STOREFRONT: "Shop page", WHATSAPP: "WhatsApp" };
const STATUS_PILL: Record<string, string> = { WAITING: "gold", ALERTED: "plain", REPLIED: "plain", BOUGHT: "good", STOPPED: "bad" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const p = await db.product.findFirst({
    where: { id, shopId: user.shopId },
    include: { waitlist: { include: { contact: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!p) notFound();
  const waiting = p.waitlist.filter(w => w.status === "WAITING").length;
  const notifyLink = `${process.env.APP_URL ?? ""}/s/${user.shop.slug}/notify/${p.id}?ref=ig-dm`;

  return (
    <>
      <Link href="/app/products" className="small">← Products</Link>
      <div className="stack" style={{ gap: 4 }}>
        <h1>{p.name}</h1>
        <p className="muted">{naira(p.priceKobo)} · {p.stock ? `${p.stock} in stock` : "Sold out"} · {waiting} waiting</p>
      </div>

      <section className="panel">
        <div className="panel-h"><h2>Restock</h2></div>
        <div className="panel-b">
          <ActionForm action={restockProduct}>
            <input type="hidden" name="productId" value={p.id} />
            <label className="field">Units arriving
              <input className="input" name="units" type="number" inputMode="numeric" min={1} defaultValue={3} required />
              <span className="hint">We alert twice as many waiting buyers as units, oldest first. The rest wait for the next restock.</span>
            </label>
            <Submit className="btn wa" pendingText="Sending alerts…">Restock & alert waitlist</Submit>
          </ActionForm>
        </div>
      </section>

      <section className="panel">
        <div className="panel-h"><h2>Waitlist</h2><span className="pill gold">{waiting} waiting</span></div>
        <div className="list">
          {p.waitlist.length === 0 && <p className="item muted">Nobody yet.</p>}
          {p.waitlist.map(w => (
            <div key={w.id} className="item">
              <div className="row between"><b>{w.contact.name}</b><span className={`pill ${STATUS_PILL[w.status]}`}>{w.status.toLowerCase()}</span></div>
              <span className="small muted">
                {w.contact.waPhone ? displayPhone(w.contact.waPhone) : "–"} · from {SOURCE[w.source]} · joined {w.createdAt.toLocaleDateString("en-NG")} {timeOfDay(w.createdAt)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-h"><h2>Add a buyer from a DM</h2></div>
        <div className="panel-b">
          <p className="small muted">Send this link in the DM so the buyer adds their own number: <span className="code">{notifyLink}</span></p>
          <p className="small muted">Or, if they already gave you their number and agreed to be messaged, add them here.</p>
          <ActionForm action={addToWaitlist}>
            <input type="hidden" name="productId" value={p.id} />
            <label className="field">Buyer&apos;s name<input className="input" name="name" required /></label>
            <label className="field">WhatsApp number<input className="input" name="phone" type="tel" inputMode="tel" placeholder="0803 123 4567" required /></label>
            <label className="field">They asked on
              <select className="input" name="source" defaultValue="IG_DM"><option value="IG_DM">Instagram DM</option><option value="WHATSAPP">WhatsApp</option></select>
            </label>
            <label className="check"><input type="checkbox" name="consent" /> The buyer agreed to get a WhatsApp message when this is back</label>
            <Submit className="btn">Add to waitlist</Submit>
          </ActionForm>
        </div>
      </section>

      <details className="panel">
        <summary className="panel-h"><h2>Edit product</h2><span className="btn">Edit</span></summary>
        <div className="panel-b">
          <ActionForm action={saveProduct}>
            <input type="hidden" name="id" value={p.id} />
            <ProductFields product={p} />
            <Submit>Save</Submit>
          </ActionForm>
          <form action={archiveProduct}>
            <input type="hidden" name="id" value={p.id} />
            <button className="btn ghost">Remove from shop</button>
          </form>
        </div>
      </details>
    </>
  );
}
