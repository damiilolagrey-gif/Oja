import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { naira } from "@/lib/format";
import { can, dispatchOverdue, DISPUTE_REASONS, escrowConfig, STATUS_LABEL, STATUS_TONE } from "@/lib/escrow";
import { paystackConfigured, verifyTransaction } from "@/lib/paystack";
import { markPaid } from "@/lib/services/orders";
import { OrderSteps } from "@/components/OrderSteps";
import { ActionForm, Submit } from "@/components/ActionForm";
import { buyerCancel, buyerReport, confirmReceived } from "@/app/actions/orders";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your order", robots: { index: false } };

const when = (d: Date) => d.toLocaleString("en-NG", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });

export default async function Track({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let o = await db.order.findUnique({ where: { buyerToken: token }, include: { shop: true } });
  if (!o) notFound();
  // Back from Paystack: confirm the payment now rather than waiting for the webhook.
  if (o.status === "PENDING" && paystackConfigured()) {
    const v = await verifyTransaction(o.reference);
    if (v.ok && v.data.status === "success") {
      await markPaid(o.reference, v.data.amount);
      o = (await db.order.findUnique({ where: { buyerToken: token }, include: { shop: true } }))!;
    }
  }
  const cfg = escrowConfig();
  const now = new Date();

  return (
    <main className="store">
      <div className="stack" style={{ gap: 4 }}>
        <span className="small muted">Order <span className="code">{o.reference}</span> · {o.shop.name}</span>
        <h1 style={{ fontSize: 22 }}>{o.quantity > 1 ? `${o.quantity} × ` : ""}{o.itemName}</h1>
        <span><span className={`pill ${STATUS_TONE[o.status]}`}>{STATUS_LABEL[o.status]}</span>{o.simulated && <span className="pill plain" style={{ marginLeft: 6 }}>Test order</span>}</span>
      </div>

      {["PAID", "SHIPPED", "DELIVERED", "RELEASED", "DISPUTED"].includes(o.status) && <OrderSteps status={o.status} />}

      <section className="panel panel-b stack">
        {o.status === "PENDING" && <p>We haven&apos;t received your payment yet. If you paid, this page updates within a few minutes.</p>}
        {o.status === "PAID" && <p>Your {naira(o.totalKobo)} is held safely. {o.shop.name} has been told to dispatch your order.</p>}
        {o.status === "SHIPPED" && <p>On its way with <b>{o.courier}</b>{o.trackingNote ? `: ${o.trackingNote}` : ""}.{o.trackingUrl && <> <a href={o.trackingUrl} target="_blank" rel="noreferrer">Track the rider</a>.</>} Check the item when it arrives before you confirm.</p>}
        {o.status === "DELIVERED" && o.releaseAt && (
          <p>Marked delivered. If there&apos;s a problem, report it before <b>{when(o.releaseAt)}</b>. After that the shop is paid automatically.</p>
        )}
        {o.status === "DISPUTED" && <p>You reported: <b>{o.disputeReason}</b>. Your payment is frozen while the Oja team looks into it. We&apos;ll contact you on {o.buyerPhone.replace(/^234/, "0")}.</p>}
        {o.status === "RELEASED" && <p>Done. {o.shop.name} has been paid.{o.resolutionNote ? ` ${o.resolutionNote}.` : ""}</p>}
        {o.status === "REFUNDED" && <p>{naira(o.totalKobo)} has been refunded to the card or account you paid with.{o.resolutionNote ? ` ${o.resolutionNote}.` : ""}</p>}
        {o.status === "CANCELLED" && <p>This checkout was never paid, so nothing was charged.</p>}

        {can(o.status, "confirm") && (
          <form action={confirmReceived}>
            <input type="hidden" name="token" value={token} />
            <button className="btn primary block">I&apos;ve received it and it&apos;s fine, pay the shop</button>
          </form>
        )}
        {o.status !== "PAID" && can(o.status, "dispute") && (
          <details>
            <summary className="btn block">Report a problem</summary>
            <ActionForm action={buyerReport}>
              <input type="hidden" name="token" value={token} />
              <label className="field">What went wrong?
                <select className="input" name="reason" required defaultValue="">
                  <option value="" disabled>Choose one</option>
                  {DISPUTE_REASONS.filter(r => r !== "Shop hasn't dispatched").map(r => <option key={r}>{r}</option>)}
                </select>
              </label>
              <label className="field">Tell us more<textarea className="input" name="detail" rows={3} placeholder="What's different from what you ordered?" /></label>
              <p className="small muted">Keep the item and its packaging. We may ask for photos on WhatsApp.</p>
              <Submit className="btn primary block" pendingText="Sending…">Report and freeze payment</Submit>
            </ActionForm>
          </details>
        )}
        {dispatchOverdue(o, now, cfg) && (
          <form action={buyerCancel}>
            <input type="hidden" name="token" value={token} />
            <p className="small muted">{o.shop.name} hasn&apos;t dispatched within {cfg.dispatchHours} hours, so you can cancel for a full refund.</p>
            <button className="btn block">Cancel and refund me</button>
          </form>
        )}
      </section>

      <section className="panel panel-b small">
        <div className="row between"><span>Items</span><span className="num">{naira(o.amountKobo)}</span></div>
        <div className="row between"><span>Buyer protection</span><span className="num">{naira(o.feeKobo)}</span></div>
        <div className="row between"><b>Paid</b><b className="num">{naira(o.totalKobo)}</b></div>
        <p className="muted" style={{ margin: "8px 0 0" }}>Delivering to {o.address}, {o.city}</p>
      </section>
      <p className="foot">Bookmark this page to track your order. Protected by Oja SafePay.</p>
    </main>
  );
}
