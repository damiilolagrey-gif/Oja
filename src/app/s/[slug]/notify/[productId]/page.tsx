import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { naira } from "@/lib/format";
import { consentText } from "@/lib/services/waitlist";
import { ActionForm, Submit } from "@/components/ActionForm";
import { optIn } from "@/app/actions/storefront";

export const dynamic = "force-dynamic";

export default async function Notify({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; productId: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { slug, productId } = await params;
  const ref = (await searchParams).ref ?? "";
  const shop = await db.shop.findUnique({ where: { slug } });
  const product = shop && (await db.product.findFirst({ where: { id: productId, shopId: shop.id, archived: false } }));
  if (!shop || !product) notFound();
  const waiting = await db.waitlistEntry.count({ where: { productId: product.id, status: "WAITING" } });

  return (
    <main className="store">
      <Link href={`/s/${shop.slug}`} className="small">← {shop.name}</Link>
      <div className="row" style={{ gap: 14, flexWrap: "nowrap" }}>
        {product.imageUrl ? <img src={product.imageUrl} alt="" className="thumb" style={{ width: 72, height: 72 }} /> : <div className="thumb" style={{ width: 72, height: 72 }}>{product.name[0]}</div>}
        <div className="stack" style={{ gap: 2 }}>
          <h1 style={{ fontSize: 22 }}>Get {product.name} when it&apos;s back</h1>
          <span className="muted small">{product.needsPrice ? "Ask for price" : naira(product.priceKobo)}{waiting > 2 ? ` · ${waiting} people waiting` : ""}</span>
        </div>
      </div>
      <section className="panel panel-b">
        <p className="small muted">We&apos;ll send you one WhatsApp message when it&apos;s restocked. Reply YES to reserve yours.</p>
        <ActionForm action={optIn}>
          <input type="hidden" name="slug" value={shop.slug} />
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="ref" value={ref} />
          <label className="field">Your name<input className="input" name="name" autoComplete="given-name" required /></label>
          <label className="field">WhatsApp number<input className="input" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" required /></label>
          <label className="check"><input type="checkbox" name="consent" defaultChecked /> {consentText(shop.name)}</label>
          <Submit className="btn wa block" pendingText="Adding you…">Notify me on WhatsApp</Submit>
        </ActionForm>
      </section>
      <p className="foot">Powered by Oja</p>
    </main>
  );
}
