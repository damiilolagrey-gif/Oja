import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { naira } from "@/lib/format";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/escrow";

export const dynamic = "force-dynamic";

const needsShop = ["PAID", "SHIPPED"] as const;

export default async function Orders() {
  const user = await requireUser();
  const shop = user.shop;
  const orders = await db.order.findMany({
    where: { shopId: shop.id, status: { notIn: ["PENDING", "CANCELLED"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const held = orders.filter(o => ["PAID", "SHIPPED", "DELIVERED", "DISPUTED"].includes(o.status)).reduce((s, o) => s + o.amountKobo, 0);
  const paidOut = orders.filter(o => o.status === "RELEASED").reduce((s, o) => s + (o.payoutKobo ?? 0), 0);
  const todo = orders.filter(o => (needsShop as readonly string[]).includes(o.status));

  return (
    <>
      <div className="stack" style={{ gap: 4 }}>
        <h1>Orders</h1>
        <p className="muted">Paid through your SafePay link. Money is held until the buyer confirms delivery.</p>
      </div>

      {!shop.payoutAccountNumber && user.role === "OWNER" && (
        <p className="notice">Add the bank account we pay you into. <Link href="/app/settings#payouts">Set up payouts</Link>.</p>
      )}

      <div className="kpis">
        <div className="panel kpi hero"><span className="lab">Held in SafePay</span><span className="val num">{naira(held)}</span><span className="sub small">Paid to you as buyers confirm</span></div>
        <div className="panel kpi"><span className="lab">Paid out to you</span><span className="val num">{naira(paidOut)}</span></div>
        <div className="panel kpi"><span className="lab">To dispatch or deliver</span><span className="val num">{todo.length}</span></div>
      </div>

      <section className="panel">
        <div className="panel-h"><h2>All orders</h2></div>
        <div className="list">
          {orders.length === 0 && (
            <p className="item muted">No SafePay orders yet. Share your shop link, or send the &quot;Pay safely&quot; quick reply from a chat.</p>
          )}
          {orders.map(o => (
            <Link key={o.id} href={`/app/orders/${o.id}`} className="item">
              <div className="row between">
                <b>{o.quantity > 1 ? `${o.quantity} × ` : ""}{o.itemName}</b>
                <span className={`pill ${STATUS_TONE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
              </div>
              <span className="small muted num">{o.buyerName} · {o.city} · {naira(o.amountKobo)}{o.simulated ? " · test" : ""}</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
