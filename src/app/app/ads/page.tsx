import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { naira } from "@/lib/format";
import { campaignResults } from "@/lib/services/ads";
import { PLATFORMS, STATUS_LABEL, placesLine, verdict, type CampaignState, type Platform } from "@/lib/ads";
import { StudioNav } from "../studio/StudioNav";

export const dynamic = "force-dynamic";

const PILL: Record<CampaignState, string> = { DRAFT: "plain", ACTIVE: "good", PAUSED: "gold", ENDED: "plain" };

export default async function Ads() {
  const user = await requirePermission("ads");
  const campaigns = await db.campaign.findMany({
    where: { shopId: user.shopId },
    orderBy: { createdAt: "desc" },
    include: { product: { select: { name: true } } },
  });
  const res = await campaignResults(campaigns);
  const totals = [...res.values()].reduce((t, r) => ({ chats: t.chats + r.chats, orders: t.orders + r.orders, revenue: t.revenue + r.revenueKobo }), { chats: 0, orders: 0, revenue: 0 });

  return (
    <>
      <StudioNav on="ads" />
      <div className="row between">
        <div className="stack" style={{ gap: 4 }}>
          <h1>Campaigns</h1>
          <p className="muted">Set the budget and who sees your ads on Facebook, Instagram, Google and TikTok, and see which ads bring chats and sales.</p>
        </div>
        <Link className="btn primary" href="/app/ads/new">New campaign</Link>
      </div>

      <p className="notice">
        <b>Test mode.</b> Your ad accounts aren&apos;t connected yet, so campaigns don&apos;t go live on the platforms by themselves. Each one gives you a tracked
        WhatsApp link to use when you boost a post or run the ad yourself, and every chat and sale from it is counted here.{" "}
        <Link href="/app/ads/accounts">See what each platform needs</Link>.
      </p>

      {campaigns.length > 0 && (
        <div className="kpis">
          <div className="panel kpi"><span className="lab">Chats from ads</span><span className="val num">{totals.chats}</span></div>
          <div className="panel kpi"><span className="lab">Orders from ads</span><span className="val num">{totals.orders}</span></div>
          <div className="panel kpi"><span className="lab">Sales from ads</span><span className="val num">{naira(totals.revenue)}</span></div>
          <div className="panel kpi"><span className="lab">Running now</span><span className="val num">{campaigns.filter(c => c.status === "ACTIVE").length}</span></div>
        </div>
      )}

      <section className="panel list">
        {campaigns.length === 0 && (
          <div className="item">
            <b>No campaigns yet</b>
            <p className="muted small">Start one from a product&apos;s ads in <Link href="/app/studio">Make ads</Link>, or press New campaign.</p>
          </div>
        )}
        {campaigns.map(c => {
          const r = res.get(c.id)!;
          const state = c.status as CampaignState;
          return (
            <Link key={c.id} href={`/app/ads/${c.id}`} className="item">
              <div className="row between">
                <b>{c.name}</b>
                <span className={`pill ${PILL[state]}`}>{STATUS_LABEL[state]}</span>
              </div>
              <span className="small muted num">
                {PLATFORMS[c.platform as Platform].label} · {naira(c.dailyBudgetKobo)} a day for {c.days} {c.days === 1 ? "day" : "days"} · {placesLine(c.locations)}
                {c.product ? ` · ${c.product.name}` : ""}
              </span>
              <span className="small">{verdict(r)}</span>
            </Link>
          );
        })}
      </section>
    </>
  );
}
