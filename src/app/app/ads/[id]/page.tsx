import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { naira, ago, minutesBetween } from "@/lib/format";
import { campaignResults } from "@/lib/services/ads";
import { NEXT, PLATFORMS, STATUS_LABEL, campaignLink, placesLine, totalBudget, verdict, type CampaignState, type Platform } from "@/lib/ads";
import type { AdCopy } from "@/lib/creative";
import { ActionForm, Submit } from "@/components/ActionForm";
import { CopyButton } from "@/components/CopyButton";
import { moveCampaign, recordSpend } from "@/app/actions/ads";
import { StudioNav } from "../../studio/StudioNav";

export const dynamic = "force-dynamic";

const MOVE_LABEL = { start: "Start campaign", pause: "Pause", resume: "Resume", end: "End campaign" } as const;

/** The copy that fits the chosen platform, in the order its ad form asks for it. */
function copyFor(platform: Platform, c: AdCopy): { title: string; text: string }[] {
  switch (PLATFORMS[platform].copy) {
    case "meta":
      return [
        { title: "Primary text", text: c.facebook.primaryText },
        { title: "Headline", text: c.facebook.headline },
        { title: "Instagram caption", text: `${c.instagram.caption}\n\n${c.instagram.hashtags.join(" ")}`.trim() },
      ];
    case "google":
      return [
        { title: "Headlines", text: c.google.headlines.join("\n") },
        { title: "Descriptions", text: c.google.descriptions.join("\n") },
      ];
    case "status":
      return [{ title: "Status text", text: c.whatsappStatus }];
    case "caption":
      return [{ title: "Post caption", text: `${c.instagram.caption}\n\n${c.instagram.hashtags.join(" ")}`.trim() }];
    default:
      return [{ title: "Ad text", text: c.tiktok.adText }];
  }
}

const HOW: Record<Platform, string[]> = {
  META: [
    "On Instagram or Facebook, open the post you want to promote and press Boost (or create an ad in Ads Manager).",
    "For the button, choose Send WhatsApp message, or paste the tracked link as the website.",
    "Set the same daily budget, days, states and ages as here, and pay with your card.",
  ],
  GOOGLE: [
    "In Google Ads, start a Search, YouTube or Display campaign and paste the tracked link as the final URL.",
    "Paste the headlines and descriptions below, then set the same budget and locations.",
  ],
  TIKTOK: [
    "In TikTok Ads Manager (or Promote on a video), set the destination to the tracked link.",
    "Paste the ad text below and set the same budget, days, locations and ages.",
  ],
  SNAPCHAT: [
    "In Snapchat Ads Manager, create a Snap Ad with the video or Story-size image from the studio.",
    "Set the attachment to the tracked link, paste the ad text and set the same budget and audience.",
  ],
  X: [
    "In X Ads, create a campaign with the image or video from the studio and paste the tracked link as the website.",
    "Paste the ad text below and set the same budget, days and locations.",
  ],
  OPERA: [
    "In Opera Ad Manager (opera.com/ads), create a campaign for Nigeria with the square or landscape image.",
    "Use the tracked link as the landing page, paste the headline and text, and set the same budget.",
  ],
  WHATSAPP_STATUS: [
    "Post the story-size image or video from the studio to your WhatsApp Status and Channel, with the text below.",
    "Send the image and the tracked link to resellers and friends so they can post it too. Every chat from the link is counted.",
  ],
  INFLUENCER: [
    "Send the influencer or group admin the image or video from the studio, the caption below and the tracked link.",
    "Ask them to put the link in the post or their bio. Enter what you paid them as the spend so you see the cost per order.",
  ],
};

export default async function Campaign({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("ads");
  const c = await db.campaign.findFirst({
    where: { id, shopId: user.shopId },
    include: {
      product: true,
      creative: true,
      conversations: { orderBy: { startedAt: "desc" }, take: 10, include: { contact: { select: { name: true } } } },
    },
  });
  if (!c) notFound();
  const [res, creator] = await Promise.all([
    campaignResults([c]),
    c.createdById ? db.user.findUnique({ where: { id: c.createdById }, select: { name: true } }) : null,
  ]);
  const r = res.get(c.id)!;
  const state = c.status as CampaignState;
  const platform = c.platform as Platform;
  const link = campaignLink(user.shop, c.product, c.code, process.env.APP_URL ?? "");
  const copy = c.creative ? copyFor(platform, c.creative.copy as unknown as AdCopy) : null;
  const now = new Date();
  const dayOf = c.startedAt ? Math.min(c.days, Math.floor(minutesBetween(c.startedAt, c.endedAt ?? now) / 1440) + 1) : null;

  return (
    <>
      <StudioNav on="ads" />
      <Link href="/app/ads" className="small">← Campaigns</Link>
      <div className="stack" style={{ gap: 4 }}>
        <div className="row between">
          <h1>{c.name}</h1>
          <span className={`pill ${state === "ACTIVE" ? "good" : state === "PAUSED" ? "gold" : "plain"}`}>{STATUS_LABEL[state]}</span>
        </div>
        <p className="muted small num">
          {PLATFORMS[platform].label} · {c.dailyBudgetKobo ? <>{naira(c.dailyBudgetKobo)} a day for {c.days} {c.days === 1 ? "day" : "days"} (up to {naira(totalBudget(c.dailyBudgetKobo, c.days))})</> : <>{c.days} {c.days === 1 ? "day" : "days"}</>}
          {" · "}{placesLine(c.locations)} · ages {c.ageMin} to {c.ageMax}
          {dayOf && state !== "ENDED" ? ` · day ${dayOf} of ${c.days}` : ""}
        </p>
      </div>

      {NEXT[state].length > 0 && (
        <div className="row">
          {NEXT[state].map(m => (
            <form key={m} action={moveCampaign}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="move" value={m} />
              <button className={`btn ${m === "start" || m === "resume" ? "primary" : m === "end" ? "ghost" : ""}`}>{MOVE_LABEL[m]}</button>
            </form>
          ))}
        </div>
      )}
      {!c.live && state !== "ENDED" && PLATFORMS[platform].booking !== "self" && (
        <p className="notice small">
          Test mode: {PLATFORMS[platform].short} isn&apos;t connected, so {state === "DRAFT" ? "starting" : "this"} doesn&apos;t put the ad live by itself. Run it with the tracked link below and
          we&apos;ll count every chat and sale it brings. <Link href="/app/ads/accounts">Connect your account</Link>
        </p>
      )}

      <section className="panel">
        <div className="panel-h"><h2>Results</h2></div>
        <div className="panel-b">
          <div className="kpis">
            <div className="panel kpi"><span className="lab">Chats</span><span className="val num">{r.chats}</span></div>
            <div className="panel kpi"><span className="lab">Orders</span><span className="val num">{r.orders}</span></div>
            <div className="panel kpi"><span className="lab">Sales</span><span className="val num">{naira(r.revenueKobo)}</span></div>
            <div className="panel kpi"><span className="lab">Cost per order</span><span className="val num">{r.costPerOrderKobo !== null ? naira(r.costPerOrderKobo) : "–"}</span></div>
          </div>
          <p className="small">{verdict(r)}</p>
          <dl className="small muted" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", margin: 0 }}>
            <dt>Cost per chat</dt><dd className="num" style={{ margin: 0 }}>{r.costPerChatKobo !== null ? naira(r.costPerChatKobo) : "Add what you've spent"}</dd>
            <dt>Chats that bought</dt><dd className="num" style={{ margin: 0 }}>{r.chatToOrder !== null ? `${Math.round(r.chatToOrder * 100)}%` : "–"}</dd>
            <dt>Views and clicks</dt><dd style={{ margin: 0 }}>{c.live ? `${c.impressions.toLocaleString("en-NG")} views, ${c.clicks.toLocaleString("en-NG")} clicks` : `Shown once ${PLATFORMS[platform].short} is connected`}</dd>
          </dl>
          <ActionForm action={recordSpend}>
            <input type="hidden" name="id" value={c.id} />
            <label className="field">Spent so far (₦)
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input className="input num" name="spend" inputMode="numeric" defaultValue={c.spendKobo ? c.spendKobo / 100 : ""} placeholder="15000" style={{ flex: 1 }} />
                <Submit className="btn">Save</Submit>
              </div>
              <span className="hint">From {PLATFORMS[platform].short}&apos;s billing page or your card statement. Filled in for you once connected.</span>
            </label>
          </ActionForm>
        </div>
      </section>

      <section className="panel">
        <div className="panel-h"><h2>Tracked link</h2></div>
        <div className="panel-b">
          <div className="row" data-copy><span className="code" data-copy-text style={{ wordBreak: "break-all", flex: 1 }}>{link}</span><CopyButton text={link} label="Copy link" /></div>
          <p className="hint">
            {user.shop.whatsappNumber
              ? <>Opens a WhatsApp chat with your shop with <b>(ref {c.code})</b> already typed, so the chat is credited to this campaign and the AI assistant can sell straight away.</>
              : <>Opens your checkout page. Add your WhatsApp number in <Link href="/app/settings">Settings</Link> so ads open a WhatsApp chat instead.</>}
          </p>
          <div>
            <b className="small">How to run it now</b>
            <ol className="small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>{HOW[platform].map(s => <li key={s}>{s}</li>)}</ol>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2>Ad copy</h2>
          {c.product && <Link className="btn small" href={`/app/studio/${c.product.id}`}>{copy ? "More ads" : "Write ads"}</Link>}
        </div>
        <div className="panel-b">
          {!copy && <p className="small muted">No ad copy picked. {c.product ? "Write some in Make ads, with images in every size." : "Pick a product to get ready-made copy."}</p>}
          {copy?.map(b => (
            <div key={b.title} className="studio-block" data-copy>
              <div className="row between"><b className="small">{b.title}</b><CopyButton text={b.text} /></div>
              <p className="studio-text" data-copy-text>{b.text}</p>
            </div>
          ))}
          {c.creative && <p className="hint">From the &quot;{c.creative.angle}&quot; set. Download the image to go with it in <Link href={`/app/studio/${c.product?.id ?? ""}`}>Make ads</Link>.</p>}
        </div>
      </section>

      <section className="panel list">
        <div className="panel-h"><h2>Latest chats from this ad</h2></div>
        {c.conversations.length === 0 && <p className="item small muted">None yet. They show here the moment someone messages from the link.</p>}
        {c.conversations.map(v => (
          <Link key={v.id} href={`/app/inbox/${v.id}`} className="item">
            <div className="row between">
              <b>{v.contact.name}</b>
              <span className={`pill ${v.status === "WON" ? "good" : v.status === "LOST" ? "plain" : "gold"}`}>{v.status === "WON" ? "Bought" : v.status === "LOST" ? "Didn't buy" : "Open"}</span>
            </div>
            <span className="small muted">{ago(minutesBetween(v.startedAt, now)).replace(/^(?!just now)(.*)$/, "$1 ago")}</span>
          </Link>
        ))}
      </section>

      <p className="hint">Set up by {creator?.name ?? "a team member"} on {c.createdAt.toLocaleDateString("en-NG")}. Code {c.code}.</p>
    </>
  );
}
