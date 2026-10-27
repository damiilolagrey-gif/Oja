import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ago, naira } from "@/lib/format";
import { recoveredByAlerts, waitingMinutes } from "@/lib/metrics";
import { whatsappConnected } from "@/lib/meta";
import { followUpDue } from "@/lib/followup";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  const shop = user.shop;
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const [convs, products, waitingCount, alertsSent, held, recent] = await Promise.all([
    db.conversation.findMany({ where: { shopId: shop.id, startedAt: { gte: since } }, include: { contact: true, rep: true } }),
    db.product.findMany({
      where: { shopId: shop.id, archived: false, waitlist: { some: { status: "WAITING" } } },
      include: { _count: { select: { waitlist: { where: { status: "WAITING" } } } } },
    }),
    db.waitlistEntry.count({ where: { status: "WAITING", product: { shopId: shop.id, archived: false } } }),
    db.waitlistEntry.count({ where: { alertedAt: { gte: since }, product: { shopId: shop.id } } }),
    db.order.aggregate({ where: { shopId: shop.id, status: { in: ["PAID", "SHIPPED", "DELIVERED", "DISPUTED"] } }, _sum: { amountKobo: true }, _count: true }),
    db.conversation.findMany({
      where: { shopId: shop.id, status: "OPEN", lastBuyerAt: { gte: new Date(now.getTime() - 24 * 3600_000) } },
      include: { contact: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
  ]);
  const followUps = recent
    .map(c => ({ c, f: followUpDue(c, now) }))
    .filter(x => x.f.due)
    .sort((a, b) => a.f.hoursLeft - b.f.hoursLeft);
  const recovered = recoveredByAlerts(convs);
  const replied = convs.filter(c => c.firstReplyAt);
  const avg = replied.length ? replied.reduce((s, c) => s + (c.firstReplyAt!.getTime() - c.startedAt.getTime()), 0) / replied.length / 60000 : null;
  const unanswered = convs
    .map(c => ({ c, w: waitingMinutes(c, now) }))
    .filter((x): x is { c: (typeof convs)[number]; w: number } => x.w != null)
    .sort((a, b) => b.w - a.w);
  const mostWanted = [...products].sort((a, b) => b._count.waitlist - a._count.waitlist).slice(0, 5);

  return (
    <>
      <div className="stack" style={{ gap: 4 }}>
        <h1>Hello, {user.name.split(" ")[0]}</h1>
        <p className="muted">Last 30 days at {shop.name}</p>
      </div>

      {!whatsappConnected(shop) && user.role === "OWNER" && (
        <p className="notice">
          WhatsApp isn&apos;t connected yet, so alerts and replies are simulated. <Link href="/app/settings">Connect it in Settings</Link>.
        </p>
      )}

      <div className="kpis">
        <div className="panel kpi hero">
          <span className="lab">Sales recovered by restock alerts</span>
          <span className="val num">{naira(recovered.kobo)}</span>
          <span className="sub small">{recovered.orders} {recovered.orders === 1 ? "order" : "orders"} from {alertsSent} {alertsSent === 1 ? "alert" : "alerts"}</span>
        </div>
        <Link href="/app/orders" className="panel kpi" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="lab">Held in SafePay</span>
          <span className="val num">{naira(held._sum.amountKobo ?? 0)}</span>
          <span className="sub small">{held._count} open {held._count === 1 ? "order" : "orders"}</span>
        </Link>
        <div className="panel kpi">
          <span className="lab">Buyers waiting for restocks</span>
          <span className="val num">{waitingCount}</span>
        </div>
        <div className="panel kpi">
          <span className="lab">Average first reply</span>
          <span className="val num">{avg == null ? "–" : `${Math.round(avg)} min`}</span>
        </div>
        <div className="panel kpi">
          <span className="lab">Chats with no reply</span>
          <span className="val num" style={{ color: unanswered.some(u => u.w > shop.missLimitMinutes) ? "var(--bad)" : undefined }}>
            {unanswered.length}
          </span>
        </div>
      </div>

      <section className="panel">
        <div className="panel-h"><h2>Waiting for a reply</h2><Link href="/app/inbox" className="small">Inbox</Link></div>
        <div className="list">
          {unanswered.length === 0 && <p className="item muted">Everyone has had a reply.</p>}
          {unanswered.slice(0, 5).map(({ c, w }) => (
            <Link key={c.id} href={`/app/inbox/${c.id}`} className="item">
              <div className="row between">
                <span className="row"><span className={`ch ${c.channel}`}>{c.channel === "INSTAGRAM" ? "IG" : "WA"}</span><b>{c.contact.name}</b></span>
                <span className={`pill ${w > shop.missLimitMinutes ? "bad" : "gold"}`}>{ago(w)}</span>
              </div>
              <span className="small muted">{c.rep ? `Assigned to ${c.rep.name}` : "Unassigned"}</span>
            </Link>
          ))}
        </div>
      </section>

      {followUps.length > 0 && (
        <section className="panel">
          <div className="panel-h"><h2>Follow up before it&apos;s too late</h2></div>
          <div className="list">
            {followUps.slice(0, 5).map(({ c, f }) => (
              <Link key={c.id} href={`/app/inbox/${c.id}`} className="item">
                <div className="row between">
                  <span className="row"><span className={`ch ${c.channel}`}>{c.channel === "INSTAGRAM" ? "IG" : "WA"}</span><b>{c.contact.name}</b></span>
                  <span className={`pill ${f.hoursLeft < 4 ? "bad" : "gold"}`}>{Math.max(1, Math.floor(f.hoursLeft))}h left</span>
                </div>
                <span className="small muted">Went quiet after your last message. Free replies stop 24 hours after their last message.</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-h"><h2>Most-wanted sold-out items</h2><Link href="/app/products" className="small">Products</Link></div>
        <div className="list">
          {mostWanted.length === 0 && (
            <p className="item muted">No waitlists yet. Share your shop link in your Instagram bio so buyers can tap &quot;Notify me&quot;.</p>
          )}
          {mostWanted.map(p => (
            <Link key={p.id} href={`/app/products/${p.id}`} className="item">
              <div className="row between"><b>{p.name}</b><span className="pill gold">{p._count.waitlist} waiting</span></div>
              <span className="small muted">{p.stock ? `${p.stock} in stock` : "Sold out"} · {naira(p.priceKobo * p._count.waitlist)} in demand</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
