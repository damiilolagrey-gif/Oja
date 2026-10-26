import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { naira } from "@/lib/format";
import { displayPhone } from "@/lib/phone";
import { ActionForm, Submit } from "@/components/ActionForm";
import { adminResolve } from "@/app/actions/orders";

export const dynamic = "force-dynamic";

/** Oja staff only (ADMIN_EMAILS): settle disputes across every shop. */
export default async function Admin() {
  await requireAdmin();
  const [disputes, stuck] = await Promise.all([
    db.order.findMany({ where: { status: "DISPUTED" }, include: { shop: true }, orderBy: { disputedAt: "asc" } }),
    db.order.findMany({ where: { status: "RELEASED", payoutStatus: { in: ["failed", "awaiting_account"] } }, include: { shop: true } }),
  ]);

  return (
    <>
      <div className="stack" style={{ gap: 4 }}>
        <h1>Disputes</h1>
        <p className="muted">Oldest first. Talk to both sides on WhatsApp, then refund the buyer or release to the shop.</p>
      </div>
      {disputes.length === 0 && <p className="notice good">No open disputes.</p>}
      {disputes.map(o => (
        <section key={o.id} className="panel">
          <div className="panel-h"><h2>{o.itemName}</h2><span className="pill bad">{o.disputeReason}</span></div>
          <div className="panel-b stack small">
            <span className="num">{naira(o.totalKobo)} · <span className="code">{o.reference}</span>{o.simulated ? " · test" : ""}</span>
            {o.disputeDetail && <q>{o.disputeDetail}</q>}
            <span>Buyer: <b>{o.buyerName}</b> <a href={`https://wa.me/${o.buyerPhone}`}>{displayPhone(o.buyerPhone)}</a></span>
            <span>Shop: <b>{o.shop.name}</b>{o.shop.whatsappNumber && <> <a href={`https://wa.me/${o.shop.whatsappNumber}`}>{displayPhone(o.shop.whatsappNumber)}</a></>}</span>
            <span className="muted">Dispatched with {o.courier ?? "—"}{o.trackingNote ? ` (${o.trackingNote})` : ""}</span>
            <ActionForm action={adminResolve}>
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="decision" value="refund" />
              <label className="field">Decision note (shown to buyer and shop)<input className="input" name="note" required /></label>
              <Submit className="btn primary" pendingText="Refunding…">Refund buyer</Submit>
            </ActionForm>
            <ActionForm action={adminResolve}>
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="decision" value="release" />
              <label className="field">Decision note<input className="input" name="note" required /></label>
              <Submit className="btn" pendingText="Releasing…">Release to shop</Submit>
            </ActionForm>
          </div>
        </section>
      ))}

      {stuck.length > 0 && (
        <section className="panel">
          <div className="panel-h"><h2>Payouts not sent</h2></div>
          <div className="list">
            {stuck.map(o => (
              <div key={o.id} className="item">
                <b>{o.shop.name}</b>
                <span className="small muted num">{naira(o.payoutKobo ?? 0)} · {o.payoutStatus === "failed" ? "transfer failed, retried hourly" : "shop has no payout account yet"}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
