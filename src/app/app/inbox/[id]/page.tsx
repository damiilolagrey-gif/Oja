import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ago, naira, timeOfDay } from "@/lib/format";
import { waitingMinutes } from "@/lib/metrics";
import { ActionForm, Submit } from "@/components/ActionForm";
import { closeLost, closeSale, reply, updateConversation } from "@/app/actions/inbox";
import { AutoSubmitSelect } from "./AutoSubmitSelect";
import { QuickReplies } from "./QuickReplies";

export const dynamic = "force-dynamic";

export default async function Chat({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const c = await db.conversation.findFirst({
    where: { id, shopId: user.shopId },
    include: { contact: true, product: true, messages: { orderBy: { createdAt: "asc" }, include: { rep: true } } },
  });
  if (!c) notFound();
  const [reps, products] = await Promise.all([
    db.user.findMany({ where: { shopId: user.shopId, active: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { shopId: user.shopId, archived: false }, orderBy: { name: "asc" } }),
  ]);
  const w = waitingMinutes(c, new Date());
  const shop = user.shop;
  const quick = [
    c.product && c.product.stock > 0 && `${c.product.name} is ${naira(c.product.priceKobo)}.${shop.bankDetails ? ` Pay to ${shop.bankDetails} and send your receipt here.` : ""}`,
    c.product && c.product.stock === 0 && `Sorry, ${c.product.name} is sold out right now. Tap here and we'll WhatsApp you once it's back: ${process.env.APP_URL ?? ""}/s/${shop.slug}/notify/${c.product.id}?ref=${c.channel === "INSTAGRAM" ? "ig-dm" : "wa"}`,
    "Payment received, thank you! We'll dispatch today.",
    "Where should we deliver to?",
  ].filter((x): x is string => Boolean(x));

  return (
    <>
      <Link href="/app/inbox" className="small">← Inbox</Link>
      <div className="stack" style={{ gap: 6 }}>
        <div className="row between">
          <h1 style={{ fontSize: 22 }}>{c.contact.name}</h1>
          <span className={`ch ${c.channel}`}>{c.channel === "INSTAGRAM" ? "Instagram" : "WhatsApp"}</span>
        </div>
        <div className="row">
          <AutoSubmitSelect action={updateConversation} conversationId={c.id} name="repId" value={c.repId ?? ""} label="Rep"
            options={reps.map(r => ({ value: r.id, label: r.name }))} />
          <AutoSubmitSelect action={updateConversation} conversationId={c.id} name="productId" value={c.productId ?? ""} label="Product"
            options={[{ value: "", label: "No product" }, ...products.map(p => ({ value: p.id, label: p.name }))]} />
        </div>
        {w != null && <span className={`pill ${w > shop.missLimitMinutes ? "bad" : "gold"}`} style={{ justifySelf: "start" }}>Waiting {ago(w)} for a first reply</span>}
      </div>

      <div className="thread">
        {c.messages.map(m => (
          <div key={m.id} className={`msg ${m.author === "SYSTEM" ? "SYSTEM" : m.direction}`}>
            {m.text}
            <small>
              {m.author === "REP" ? m.rep?.name.split(" ")[0] : m.author === "SYSTEM" ? "Oja" : c.contact.name} · {timeOfDay(m.createdAt)}
              {m.deliveryStatus === "simulated" && " · simulated"}
              {m.deliveryStatus === "failed" && " · not delivered"}
            </small>
          </div>
        ))}
      </div>

      {c.status === "OPEN" ? (
        <div className="composer">
          <QuickReplies options={quick} />
          <ActionForm action={reply} className="send">
            <input type="hidden" name="conversationId" value={c.id} />
            <input className="input" id="reply-text" name="text" placeholder="Reply…" autoComplete="off" required />
            <Submit pendingText="…">Send</Submit>
          </ActionForm>
          <details>
            <summary className="small muted" style={{ padding: "6px 0" }}>Close this chat</summary>
            <div className="stack" style={{ paddingTop: 8 }}>
              <ActionForm action={closeSale} className="row">
                <input type="hidden" name="conversationId" value={c.id} />
                <input className="input" name="amount" inputMode="decimal" defaultValue={c.product ? c.product.priceKobo / 100 : ""} placeholder="Amount paid (₦)" style={{ flex: 1, minWidth: 0 }} />
                <Submit className="btn primary">Mark paid</Submit>
              </ActionForm>
              <form action={closeLost}>
                <input type="hidden" name="conversationId" value={c.id} />
                <button className="btn ghost">Mark as lost</button>
              </form>
            </div>
          </details>
        </div>
      ) : (
        <p className={`notice ${c.status === "WON" ? "good" : ""}`}>
          {c.status === "WON" ? `Paid ${naira(c.amountKobo ?? 0)}` : "Marked as lost"}. A new message from {c.contact.name} opens a new chat.
        </p>
      )}
    </>
  );
}
