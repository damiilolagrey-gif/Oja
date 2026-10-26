import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { naira } from "@/lib/format";
import { escrowConfig } from "@/lib/escrow";
import { paystackConfigured } from "@/lib/paystack";
import { ActionForm, Submit } from "@/components/ActionForm";
import { startCheckout } from "@/app/actions/orders";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pay safely" };

export default async function Buy({ params }: { params: Promise<{ slug: string; productId: string }> }) {
  const { slug, productId } = await params;
  const shop = await db.shop.findUnique({ where: { slug } });
  const product = shop && (await db.product.findFirst({ where: { id: productId, shopId: shop.id, archived: false } }));
  if (!shop || !product) notFound();
  const cfg = escrowConfig();
  const live = paystackConfigured();

  return (
    <main className="store">
      <Link href={`/s/${shop.slug}`} className="small">← {shop.name}</Link>
      <div className="row" style={{ gap: 14, flexWrap: "nowrap" }}>
        {product.imageUrl ? <img src={product.imageUrl} alt="" className="thumb" style={{ width: 72, height: 72 }} /> : <div className="thumb" style={{ width: 72, height: 72 }}>{product.name[0]}</div>}
        <div className="stack" style={{ gap: 2 }}>
          <h1 style={{ fontSize: 22 }}>{product.name}</h1>
          <span className="muted small num">{naira(product.priceKobo)} · {product.stock > 0 ? `${product.stock} left` : "Sold out"}</span>
        </div>
      </div>

      <section className="panel panel-b safe">
        <b>Your money is protected</b>
        <ul className="small">
          <li>You pay into Oja SafePay, not to the shop&apos;s personal account.</li>
          <li>{shop.name} is paid only after you confirm the item arrived, or {cfg.releaseHours} hours after delivery if you don&apos;t report a problem.</li>
          <li>Not as described? Report it before you confirm and get your money back.</li>
        </ul>
      </section>

      {product.stock === 0 ? (
        <Link className="btn primary block" href={`/s/${shop.slug}/notify/${product.id}`}>Notify me when it&apos;s back</Link>
      ) : (
        <section className="panel panel-b">
          <ActionForm action={startCheckout}>
            <input type="hidden" name="slug" value={shop.slug} />
            <input type="hidden" name="productId" value={product.id} />
            <label className="field">How many<input className="input" name="quantity" type="number" min={1} max={Math.min(20, product.stock)} defaultValue={1} required /></label>
            <label className="field">Your name<input className="input" name="name" autoComplete="name" required /></label>
            <label className="field">Phone for the rider<input className="input" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" required /></label>
            <label className="field">Email for your receipt (optional)<input className="input" name="email" type="email" autoComplete="email" /></label>
            <label className="field">Delivery address<input className="input" name="address" autoComplete="street-address" placeholder="12 Admiralty Way, Lekki Phase 1" required /></label>
            <label className="field">City<input className="input" name="city" autoComplete="address-level2" placeholder="Lagos" required /></label>
            <p className="small muted num">Item {naira(product.priceKobo)} each + buyer protection {naira(cfg.buyerFeeKobo)}. Delivery is agreed with the shop.</p>
            <Submit className="btn primary block" pendingText="Opening payment…">Pay safely</Submit>
          </ActionForm>
          {!live && <p className="notice small">Test mode: no real payment is taken. The order is marked paid straight away so you can try the whole flow.</p>}
        </section>
      )}
      <p className="foot">Payments by Paystack · Protected by Oja SafePay</p>
    </main>
  );
}
