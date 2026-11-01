import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { naira, timeOfDay } from "@/lib/format";
import { displayPhone } from "@/lib/phone";
import { ActionForm, Submit } from "@/components/ActionForm";
import { addToWaitlist, addVariants, archiveProduct, removeVariant, restockProduct, saveProduct, setVariantStock } from "@/app/actions/products";
import { ProductFields } from "../ProductFields";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const SOURCE: Record<string, string> = { IG_DM: "IG DM", IG_COMMENT: "IG comment", STOREFRONT: "Shop page", WHATSAPP: "WhatsApp" };
const STATUS_PILL: Record<string, string> = { WAITING: "gold", ALERTED: "plain", REPLIED: "plain", BOUGHT: "good", STOPPED: "bad" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const p = await db.product.findFirst({
    where: { id, shopId: user.shopId },
    include: {
      waitlist: { include: { contact: true, variant: true }, orderBy: { createdAt: "asc" } },
      variants: { where: { archived: false }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!p) notFound();
  const canEdit = can(user.role, "products.edit");
  const waiting = p.waitlist.filter(w => w.status === "WAITING").length;
  const waitingFor = (vid: string) => p.waitlist.filter(w => w.status === "WAITING" && (w.variantId === vid || w.variantId === null)).length;
  const notifyLink = `${process.env.APP_URL ?? ""}/s/${user.shop.slug}/notify/${p.id}?ref=ig-dm`;

  return (
    <>
      <Link href="/app/products" className="small">← Products</Link>
      <div className="stack" style={{ gap: 4 }}>
        <h1>{p.name}</h1>
        <p className="muted">{naira(p.priceKobo)} · {p.stock ? `${p.stock} in stock` : "Sold out"} · {waiting} waiting</p>
      </div>

      <section className="panel">
        <div className="panel-h"><h2>Sizes &amp; colours</h2>{p.variants.length > 0 && <span className="pill plain">{p.variants.length} options</span>}</div>
        <div className="list">
          {p.variants.length === 0 && <p className="item muted small">No options. Add sizes or colours if buyers need to pick one; each gets its own stock.</p>}
          {p.variants.map(v => (
            <div key={v.id} className="item">
              <div className="row between">
                <b>{v.label}</b>
                <span className="row small">
                  {v.priceKobo !== null && v.priceKobo !== p.priceKobo && <span className="num">{naira(v.priceKobo)}</span>}
                  {v.stock > 0 ? <span className="pill plain num">{v.stock} in stock</span> : <span className="pill bad">Sold out</span>}
                  {waitingFor(v.id) > 0 && v.stock === 0 && <span className="pill gold">{waitingFor(v.id)} waiting</span>}
                </span>
              </div>
              {canEdit && <ActionForm action={setVariantStock}>
                <input type="hidden" name="variantId" value={v.id} />
                <div className="restock">
                  <input className="input" name="stock" type="number" inputMode="numeric" min={0} defaultValue={v.stock} aria-label={`Stock of ${v.label}`} required />
                  <Submit className={`btn ${v.stock === 0 && waitingFor(v.id) ? "wa" : ""}`} pendingText="Saving…">{v.stock === 0 && waitingFor(v.id) ? "Restock & alert" : "Set stock"}</Submit>
                  <button className="btn ghost small" formAction={removeVariant} formNoValidate>Remove</button>
                </div>
              </ActionForm>}
            </div>
          ))}
        </div>
        {canEdit && <div className="panel-b">
          <ActionForm action={addVariants}>
            <input type="hidden" name="productId" value={p.id} />
            <label className="field">Add options
              <input className="input" name="labels" placeholder="8, 10, 12, 14" required />
              <span className="hint">Separate with commas, like sizes 8, 10, 12 or colours Red, Blue. {p.variants.length === 0 && "Once a product has options, its stock is the total of its options."}</span>
            </label>
            <div className="row">
              <label className="field" style={{ flex: 1 }}>Stock for each<input className="input" name="stock" type="number" inputMode="numeric" min={0} defaultValue={0} /></label>
              <label className="field" style={{ flex: 1 }}>Price if different (₦)<input className="input" name="price" inputMode="decimal" placeholder={String(p.priceKobo / 100)} /></label>
            </div>
            <Submit className="btn">Add options</Submit>
          </ActionForm>
        </div>}
      </section>

      {canEdit && p.variants.length === 0 && <section className="panel">
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
      </section>}

      <section className="panel">
        <div className="panel-h"><h2>Waitlist</h2><span className="pill gold">{waiting} waiting</span></div>
        <div className="list">
          {p.waitlist.length === 0 && <p className="item muted">Nobody yet.</p>}
          {p.waitlist.map(w => (
            <div key={w.id} className="item">
              <div className="row between"><b>{w.contact.name}{w.variant && <span className="muted"> · wants {w.variant.label}</span>}</b><span className={`pill ${STATUS_PILL[w.status]}`}>{w.status.toLowerCase()}</span></div>
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
            {p.variants.length > 0 && <label className="field">Option they want
              <select className="input" name="variantId" defaultValue=""><option value="">Any option</option>{p.variants.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select>
            </label>}
            <label className="field">They asked on
              <select className="input" name="source" defaultValue="IG_DM"><option value="IG_DM">Instagram DM</option><option value="WHATSAPP">WhatsApp</option></select>
            </label>
            <label className="check"><input type="checkbox" name="consent" /> The buyer agreed to get a WhatsApp message when this is back</label>
            <Submit className="btn">Add to waitlist</Submit>
          </ActionForm>
        </div>
      </section>

      {canEdit && <details className="panel">
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
      </details>}
    </>
  );
}
