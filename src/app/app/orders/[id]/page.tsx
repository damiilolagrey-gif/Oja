import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { naira } from "@/lib/format";
import { displayPhone } from "@/lib/phone";
import { can, escrowConfig, payoutKobo, shopPayoutKobo, STATUS_LABEL, STATUS_TONE } from "@/lib/escrow";
import { PACKAGE_SIZES, SHIPMENT_LABEL, shipbubbleConfigured, type Quote } from "@/lib/shipbubble";
import { trackingLink } from "@/lib/services/orders";
import { OrderSteps } from "@/components/OrderSteps";
import { ActionForm, Submit } from "@/components/ActionForm";
import { bookDelivery, deliverOrder, quoteDelivery, shipOrder } from "@/app/actions/orders";

export const dynamic = "force-dynamic";

const PAYOUT: Record<string, string> = {
  pending: "Transfer on its way to your bank",
  success: "Paid into your bank",
  failed: "Transfer failed. We'll retry within the hour",
  simulated: "Test order, no money moved",
  awaiting_account: "Waiting for you to add a payout account in Settings",
};

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const o = await db.order.findFirst({ where: { id, shopId: user.shopId } });
  if (!o) notFound();
  const shop = user.shop;
  const quote = o.deliveryQuote as unknown as Quote | null;
  const when = (d: Date | null) => d?.toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });

  return (
    <>
      <Link href="/app/orders" className="small">← Orders</Link>
      <div className="stack" style={{ gap: 6 }}>
        <h1 style={{ fontSize: 22 }}>{o.quantity > 1 ? `${o.quantity} × ` : ""}{o.itemName}</h1>
        <span><span className={`pill ${STATUS_TONE[o.status]}`}>{STATUS_LABEL[o.status]}</span> <span className="small muted code">{o.reference}</span></span>
      </div>
      <OrderSteps status={o.status} />

      <section className="panel">
        <div className="panel-h"><h2>Next step</h2></div>
        <div className="panel-b stack">
          {o.status === "PAID" && (
            <>
              <p className="small muted">The buyer has paid {naira(o.totalKobo)} into SafePay. Send it out, and the buyer gets a tracking update.</p>
              {o.shipmentStatus === "booking" && <p className="notice small">Booking a rider…</p>}
              {o.shipmentStatus === "cancelled" && <p className="notice small">The courier cancelled the last booking, so no fee was taken. Book again or use your own rider.</p>}
              {!shop.pickupAddress ? (
                <p className="small"><Link href="/app/settings#delivery">Add your pickup address</Link> to book a rider from here and see prices first.</p>
              ) : (
                <>
                  <ActionForm action={quoteDelivery}>
                    <input type="hidden" name="id" value={o.id} />
                    <div className="row" style={{ gap: 8, alignItems: "end" }}>
                      <label className="field" style={{ flex: 2 }}>Package
                        <select className="input" name="size" defaultValue="small">
                          {Object.entries(PACKAGE_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </label>
                      <label className="field" style={{ flex: 1 }}>Weight (kg)<input className="input" name="weight" inputMode="decimal" defaultValue="1" required /></label>
                    </div>
                    <Submit className={quote ? "btn" : "btn primary"} pendingText="Asking couriers…">{quote ? "Refresh prices" : "Get delivery prices"}</Submit>
                  </ActionForm>
                  {quote && (
                    <ActionForm action={bookDelivery}>
                      <input type="hidden" name="id" value={o.id} />
                      <div className="stack" style={{ gap: 6 }} role="radiogroup" aria-label="Delivery options">
                        {quote.couriers.map((c, i) => (
                          <label key={c.courierId + c.serviceCode} className="row between courier">
                            <span className="row" style={{ gap: 8 }}>
                              <input type="radio" name="choice" value={`${c.courierId}|${c.serviceCode}`} defaultChecked={i === 0} />
                              <span className="stack" style={{ gap: 0 }}>
                                <b>{c.name}</b>
                                <span className="small muted">{[c.pickupEta && `Pickup ${c.pickupEta}`, c.deliveryEta && `arrives ${c.deliveryEta}`].filter(Boolean).join(", ")}</span>
                              </span>
                            </span>
                            <b className="num">{naira(c.totalKobo)}</b>
                          </label>
                        ))}
                      </div>
                      <p className="small muted">The delivery fee comes out of your payout for this order.{!shipbubbleConfigured() && " Test mode: no rider will come."}</p>
                      <Submit pendingText="Booking…">Book rider</Submit>
                    </ActionForm>
                  )}
                </>
              )}
              <details className="own-rider">
                <summary className="small">{shop.pickupAddress ? "Using your own rider instead?" : "Send it with your own rider"}</summary>
                <ActionForm action={shipOrder}>
                  <input type="hidden" name="id" value={o.id} />
                  <label className="field">Who is delivering<input className="input" name="courier" placeholder="GIG Logistics, Kwik, or our rider Musa" required /></label>
                  <label className="field">Tracking number or rider phone (optional)<input className="input" name="tracking" /></label>
                  <Submit>Mark dispatched</Submit>
                </ActionForm>
              </details>
            </>
          )}
          {can(o.status, "deliver") && (
            <form action={deliverOrder}>
              <input type="hidden" name="id" value={o.id} />
              <p className="small muted">Sent with {o.courier} on {when(o.shippedAt)}.{o.shipmentId && ` ${SHIPMENT_LABEL[o.shipmentStatus ?? ""] ?? ""}.`} Once it&apos;s delivered, the buyer has {escrowConfig().releaseHours} hours to report a problem, then you&apos;re paid.</p>
              {o.trackingUrl && <p className="small"><a href={o.trackingUrl} target="_blank" rel="noreferrer">Track with {o.courier}</a></p>}
              {o.shipmentId && shipbubbleConfigured() ? (
                <p className="small muted">We&apos;ll mark it delivered when the courier does.</p>
              ) : (
                <button className="btn primary">Mark delivered</button>
              )}
            </form>
          )}
          {o.status === "DELIVERED" && <p>Delivered. You&apos;ll be paid when the buyer confirms, or automatically on {when(o.releaseAt)}.</p>}
          {o.status === "DISPUTED" && <p>The buyer reported <b>{o.disputeReason}</b>{o.disputeDetail ? `: "${o.disputeDetail}"` : ""}. The Oja team will contact you both. Keep any proof of dispatch and delivery.</p>}
          {o.status === "RELEASED" && <p><b className="num">{naira(o.payoutKobo ?? 0)}</b> released to you. {PAYOUT[o.payoutStatus ?? ""] ?? ""}.</p>}
          {o.status === "REFUNDED" && <p>Refunded to the buyer.{o.resolutionNote ? ` ${o.resolutionNote}.` : ""}</p>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-h"><h2>Buyer</h2></div>
        <div className="panel-b stack small">
          <span><b>{o.buyerName}</b> · <a href={`https://wa.me/${o.buyerPhone}`}>{displayPhone(o.buyerPhone)}</a></span>
          <span>{o.address}, {o.city}</span>
          <span className="muted">Buyer&apos;s tracking link: <span className="code">{trackingLink(o)}</span></span>
        </div>
      </section>

      <section className="panel panel-b small">
        <div className="row between"><span>Items</span><span className="num">{naira(o.amountKobo)}</span></div>
        <div className="row between"><span>Oja fee ({escrowConfig().commissionBps / 100}%)</span><span className="num">−{naira(o.amountKobo - payoutKobo(o.amountKobo, escrowConfig()))}</span></div>
        {o.shippingKobo > 0 && <div className="row between"><span>Delivery ({o.courier})</span><span className="num">−{naira(o.shippingKobo)}</span></div>}
        <div className="row between"><b>You receive</b><b className="num">{naira(o.payoutKobo ?? shopPayoutKobo(o.amountKobo, o.shippingKobo, escrowConfig()))}</b></div>
      </section>
    </>
  );
}
