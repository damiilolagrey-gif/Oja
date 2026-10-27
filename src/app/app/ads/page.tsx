import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { naira } from "@/lib/format";
import { aiConfigured } from "@/lib/ai";
import { AREAS, DAILY_BUDGETS_KOBO, DAYS, areaLabel, returnOnSpend } from "@/lib/ads";
import { metaAdsConnected, PLATFORMS } from "@/lib/metaAds";
import { ActionForm, Submit } from "@/components/ActionForm";
import { launchAd, toggleAd } from "@/app/actions/ads";
import { AiCaption } from "./AiCaption";

export const dynamic = "force-dynamic";

const SOLD = ["PAID", "SHIPPED", "DELIVERED", "RELEASED", "DISPUTED"] as const;
const STATUS = { ACTIVE: ["Running", "good"], PAUSED: ["Paused", "gold"], ENDED: ["Finished", ""], FAILED: ["Not accepted", "bad"] } as const;

export default async function Ads() {
  const user = await requireUser();
  const shop = user.shop;
  const isOwner = user.role === "OWNER";
  const [ads, products, sales] = await Promise.all([
    db.adCampaign.findMany({ where: { shopId: shop.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.product.findMany({ where: { shopId: shop.id, archived: false, stock: { gt: 0 } }, orderBy: { createdAt: "desc" } }),
    db.order.groupBy({
      by: ["adCampaignId"],
      where: { shopId: shop.id, adCampaignId: { not: null }, status: { in: [...SOLD] } },
      _sum: { amountKobo: true },
      _count: true,
    }),
  ]);
  const salesBy = new Map(sales.map(s => [s.adCampaignId, { kobo: s._sum.amountKobo ?? 0, count: s._count }]));
  const spent = ads.reduce((s, a) => s + a.spendKobo, 0);
  const sold = sales.reduce((s, x) => s + (x._sum.amountKobo ?? 0), 0);
  const roas = returnOnSpend(sold, spent);
  const connected = metaAdsConnected(shop);

  return (
    <>
      <div className="stack" style={{ gap: 4 }}>
        <h1>Ads</h1>
        <p className="muted">Promote a product on Facebook and Instagram. Buyers tap through to your Pay safely page, so you see which ads bring sales.</p>
      </div>

      {!connected && (
        <p className="notice">
          Test mode: ads aren&apos;t sent to Meta and spend is an estimate.
          {isOwner && <> <Link href="/app/settings#ads">Connect your Meta ad account</Link> to run real ads. Meta bills your card directly.</>}
        </p>
      )}

      <div className="kpis">
        <div className="panel kpi hero"><span className="lab">Sales from ads</span><span className="val num">{naira(sold)}</span><span className="sub small">Paid SafePay orders that came from an ad</span></div>
        <div className="panel kpi"><span className="lab">Spent on ads</span><span className="val num">{naira(spent)}</span></div>
        <div className="panel kpi"><span className="lab">Sales per ₦1 spent</span><span className="val num">{roas === null ? "–" : `₦${roas.toFixed(1)}`}</span></div>
      </div>

      {isOwner && (
        <section className="panel" id="new">
          <div className="panel-h"><h2>Promote a product</h2></div>
          <div className="panel-b">
            {products.length === 0 ? (
              <p className="small muted">Add a product with stock first. <Link href="/app/products">Products</Link></p>
            ) : (
              <ActionForm action={launchAd}>
                <label className="field">Product
                  <select className="input" name="productId" required defaultValue={products[0].id}>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} · {naira(p.priceKobo)}</option>)}
                  </select>
                </label>
                <div className="field">Show it on
                  <div className="row">
                    {Object.entries(PLATFORMS).map(([k, label]) => (
                      <label key={k} className="check"><input type="checkbox" name="platform" value={k} defaultChecked />{label}</label>
                    ))}
                  </div>
                </div>
                <label className="field">To people in
                  <select className="input" name="area" defaultValue="Lagos">
                    {AREAS.map(a => <option key={a} value={a}>{areaLabel(a)}</option>)}
                  </select>
                </label>
                <div className="row" style={{ gap: 12 }}>
                  <label className="field" style={{ flex: 1 }}>Daily budget
                    <select className="input" name="dailyKobo" defaultValue={DAILY_BUDGETS_KOBO[1]}>
                      {DAILY_BUDGETS_KOBO.map(b => <option key={b} value={b}>{naira(b)} a day</option>)}
                    </select>
                  </label>
                  <label className="field" style={{ flex: 1 }}>For
                    <select className="input" name="days" defaultValue={7}>
                      {DAYS.map(d => <option key={d} value={d}>{d} days</option>)}
                    </select>
                  </label>
                </div>
                <label className="field">Ad text
                  <textarea className="input" name="message" rows={4} maxLength={600} placeholder="What buyers read above the photo" required />
                </label>
                <AiCaption ai={aiConfigured()} />
                <p className="small muted">The product photo is used as the image. Most first ads do best at {naira(DAILY_BUDGETS_KOBO[1])} a day for a week.</p>
                <Submit pendingText={connected ? "Sending to Meta…" : "Starting…"}>{connected ? "Launch ad" : "Start test ad"}</Submit>
              </ActionForm>
            )}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-h"><h2>Your ads</h2></div>
        <div className="list">
          {ads.length === 0 && <p className="item muted">No ads yet. Promote your best seller to start.</p>}
          {ads.map(a => {
            const s = salesBy.get(a.id) ?? { kobo: 0, count: 0 };
            const r = returnOnSpend(s.kobo, a.spendKobo);
            const [label, tone] = STATUS[a.status];
            return (
              <div key={a.id} className="item">
                <div className="row between">
                  <b>{a.productName}</b>
                  <span className={`pill ${tone}`}>{label}{a.simulated ? " · test" : ""}</span>
                </div>
                <span className="small muted num">
                  {a.platforms.map(p => PLATFORMS[p as keyof typeof PLATFORMS] ?? p).join(" + ")} · {areaLabel(a.area)} · {naira(a.dailyKobo)}/day for {a.days} days
                </span>
                <span className="small num">
                  Spent {naira(a.spendKobo)}
                  {!a.simulated && ` · ${a.clicks.toLocaleString()} clicks`}
                  {` · ${s.count} sale${s.count === 1 ? "" : "s"} (${naira(s.kobo)})`}
                  {r !== null && ` · ₦${r.toFixed(1)} per ₦1`}
                </span>
                {a.error && <span className="error small">{a.error}</span>}
                {isOwner && (a.status === "ACTIVE" || a.status === "PAUSED") && (
                  <form action={toggleAd}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="btn ghost">{a.status === "ACTIVE" ? "Pause" : "Resume"}</button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
