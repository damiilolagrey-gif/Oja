import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ago, naira } from "@/lib/format";
import { waitingMinutes } from "@/lib/metrics";
import { whatsappConnected } from "@/lib/meta";
import { ActionForm, Submit } from "@/components/ActionForm";
import { simulateBuyerMessage } from "@/app/actions/inbox";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "mine", label: "Mine" },
  { key: "closed", label: "Closed" },
] as const;

export default async function Inbox({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const user = await requireUser();
  const f = (await searchParams).f ?? "open";
  const now = new Date();
  const convs = await db.conversation.findMany({
    where: {
      shopId: user.shopId,
      ...(f === "closed" ? { status: { in: ["WON", "LOST"] } } : { status: "OPEN" }),
      ...(f === "mine" ? { repId: user.id } : {}),
    },
    include: { contact: true, rep: true, product: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { lastBuyerAt: "desc" },
    take: 100,
  });
  const rows = convs
    .map(c => ({ c, w: waitingMinutes(c, now) }))
    .sort((a, b) => (b.w ?? -1) - (a.w ?? -1));

  return (
    <>
      <div className="row between">
        <h1>Inbox</h1>
        <div className="row">
          {FILTERS.map(x => (
            <Link key={x.key} href={`/app/inbox?f=${x.key}`} className={`btn ${f === x.key ? "primary" : ""}`} style={{ minHeight: 36 }}>{x.label}</Link>
          ))}
        </div>
      </div>

      <section className="panel list">
        {rows.length === 0 && <p className="item muted">No chats here.</p>}
        {rows.map(({ c, w }) => (
          <Link key={c.id} href={`/app/inbox/${c.id}`} className="item">
            <div className="row between">
              <span className="row"><span className={`ch ${c.channel}`}>{c.channel === "INSTAGRAM" ? "IG" : "WA"}</span><b>{c.contact.name}</b></span>
              {w != null ? (
                <span className={`pill ${w > user.shop.missLimitMinutes ? "bad" : w > 10 ? "gold" : "plain"}`}>{ago(w)}</span>
              ) : c.status === "WON" ? (
                <span className="pill good">Paid {naira(c.amountKobo ?? 0)}</span>
              ) : c.status === "LOST" ? (
                <span className="pill plain">Lost</span>
              ) : (
                <span className="pill plain">Replied</span>
              )}
            </div>
            <span className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.messages[0]?.text}</span>
            <span className="row small muted">
              {c.product && <span>{c.product.name}</span>}
              <span>{c.rep ? c.rep.name.split(" ")[0] : "Unassigned"}</span>
              {c.source === "ALERT" && <span className="pill gold">from alert</span>}
            </span>
          </Link>
        ))}
      </section>

      {!whatsappConnected(user.shop) && (
        <details className="panel">
          <summary className="panel-h"><h2>Test with a pretend buyer</h2><span className="btn">Try</span></summary>
          <div className="panel-b">
            <p className="small muted">Until WhatsApp and Instagram are connected, use this to see how a buyer&apos;s message lands in the inbox. Use the same number you put on a waitlist to test a reply to a restock alert.</p>
            <ActionForm action={simulateBuyerMessage}>
              <label className="field">Channel
                <select className="input" name="channel" defaultValue="WHATSAPP"><option value="WHATSAPP">WhatsApp</option><option value="INSTAGRAM">Instagram DM</option></select>
              </label>
              <label className="field">Buyer&apos;s name<input className="input" name="name" placeholder="Ngozi" /></label>
              <label className="field">WhatsApp number (WhatsApp only)<input className="input" name="phone" type="tel" inputMode="tel" placeholder="0803 123 4567" /></label>
              <label className="field">Message<input className="input" name="text" placeholder="YES" required /></label>
              <Submit className="btn">Send as buyer</Submit>
            </ActionForm>
          </div>
        </details>
      )}
    </>
  );
}
