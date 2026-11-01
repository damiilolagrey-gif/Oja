import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { PLATFORMS, PLATFORM_KEYS } from "@/lib/ads";
import { StudioNav } from "../../studio/StudioNav";

export const dynamic = "force-dynamic";

export default async function AdAccounts() {
  const user = await requirePermission("ads");
  const accounts = await db.adAccount.findMany({ where: { shopId: user.shopId } });

  return (
    <>
      <StudioNav on="ads" />
      <Link href="/app/ads" className="small">← Campaigns</Link>
      <div className="stack" style={{ gap: 4 }}>
        <h1>Ad accounts</h1>
        <p className="muted">
          You pay each platform with your own card, straight from your account with them. Once an account is approved and connected here, your campaigns
          go live on that platform and its spend, views and clicks show up next to your chats and sales.
        </p>
      </div>

      {PLATFORM_KEYS.map(k => {
        const p = PLATFORMS[k];
        const a = accounts.find(x => x.platform === k);
        const connected = a?.status === "connected";
        return (
          <section key={k} className="panel">
            <div className="panel-h">
              <h2>{p.label}</h2>
              <span className={`pill ${connected ? "good" : "plain"}`}>{connected ? `Connected${a?.name ? `: ${a.name}` : ""}` : "Not connected"}</span>
            </div>
            <div className="panel-b">
              <p className="small muted">Ads show on {p.places}.</p>
              <div>
                <b className="small">What you need first</b>
                <ol className="small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {p.needs.map(n => <li key={n}>{n}</li>)}
                </ol>
              </div>
              <button className="btn" disabled aria-describedby={`why-${k}`}>Connect {p.short}</button>
              <p id={`why-${k}`} className="hint">Connecting opens once Oja&apos;s own {p.short} app is approved. Until then, use the tracked link on each campaign.</p>
            </div>
          </section>
        );
      })}
    </>
  );
}
