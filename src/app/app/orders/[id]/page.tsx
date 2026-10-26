import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { naira } from "@/lib/format";
import { displayPhone } from "@/lib/phone";
import { can, escrowConfig, payoutKobo, STATUS_LABEL, STATUS_TONE } from "@/lib/escrow";
import { trackingLink } from "@/lib/services/orders";
import { OrderSteps } from "@/components/OrderSteps";
import { ActionForm, Submit } from "@/components/ActionForm";
import { deliverOrder, shipOrder } from "@/app/actions/orders";

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
            <ActionForm action={shipOrder}>
              <p className="small muted">The buyer has paid {naira(o.totalKobo)} into SafePay. Dispatch it, then tell the buyer who is delivering.</p>
              <input type="hidden" name="id" value={o.id} />
              <label className="field">Who is delivering<input className="input" name="courier" placeholder="GIG Logistics, Kwik, or our rider Musa" required /></label>
              <label className="field">Tracking number or rider phone (optional)<input className="input" name="tracking" /></label>
              <Submit>Mark dispatched</Submit>
            </ActionForm>
          )}
          {can(o.status, "deliver") && (
            <form action={deliverOrder}>
              <input type="hidden" name="id" value={o.id} />
              <p className="small muted">Sent with {o.courier} on {when(o.shippedAt)}. Once it&apos;s delivered, the buyer has {escrowConfig().releaseHours} hours to report a problem, then you&apos;re paid.</p>
              <button className="btn primary">Mark delivered</button>
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
        <div className="row between"><b>You receive</b><b className="num">{naira(o.payoutKobo ?? payoutKobo(o.amountKobo, escrowConfig()))}</b></div>
      </section>
    </>
  );
}
