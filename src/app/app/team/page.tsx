import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { naira } from "@/lib/format";
import { repStats } from "@/lib/metrics";
import { ActionForm, Submit } from "@/components/ActionForm";
import { addRep, setMissLimit, setRepActive } from "@/app/actions/team";
import { AutoSubmitLimit } from "./AutoSubmitLimit";

export const dynamic = "force-dynamic";

const PERIODS = { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days" } as const;

function periodStart(p: keyof typeof PERIODS, now: Date) {
  if (p === "today") {
    const lagos = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
    return new Date(now.getTime() - (lagos.getHours() * 60 + lagos.getMinutes()) * 60000);
  }
  return new Date(now.getTime() - (p === "7d" ? 7 : 30) * 24 * 3600 * 1000);
}

export default async function Team({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const user = await requireUser();
  const raw = (await searchParams).p;
  const period: keyof typeof PERIODS = raw === "7d" || raw === "30d" ? raw : "today";
  const now = new Date();
  const limit = user.shop.missLimitMinutes;
  const [users, convs] = await Promise.all([
    db.user.findMany({ where: { shopId: user.shopId }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    db.conversation.findMany({ where: { shopId: user.shopId, startedAt: { gte: periodStart(period, now) } } }),
  ]);
  const isOwner = user.role === "OWNER";
  const fmt = (v: number | null) => (v == null ? "–" : `${Math.round(v)} min`);

  return (
    <>
      <div className="row between">
        <h1>Team</h1>
        <div className="row">
          {Object.entries(PERIODS).map(([k, label]) => (
            <a key={k} href={`/app/team?p=${k}`} className={`btn ${period === k ? "primary" : ""}`} style={{ minHeight: 36 }}>{label}</a>
          ))}
        </div>
      </div>
      {isOwner && <AutoSubmitLimit action={setMissLimit} value={limit} />}

      <div className="grid-cards">
        {users.filter(u => u.active).map(u => {
          const s = repStats(convs.filter(c => c.repId === u.id), now, limit);
          return (
            <section key={u.id} className="panel panel-b">
              <div className="row between">
                <div><b>{u.name}</b><div className="small muted">{u.role === "OWNER" ? "Owner" : "Sales rep"} · {s.chats} chats</div></div>
                {s.waitingNow ? <span className={`pill ${s.missed ? "bad" : "gold"}`}>{s.waitingNow} waiting</span> : <span className="pill good">All answered</span>}
              </div>
              <div className="rep-stats">
                <div><span>Avg first reply</span><b className="num" style={{ color: (s.avgFirstReplyMin ?? 0) > limit ? "var(--bad)" : undefined }}>{fmt(s.avgFirstReplyMin)}</b></div>
                <div><span>Missed chats</span><b className="num" style={{ color: s.missed ? "var(--bad)" : undefined }}>{s.missed}</b></div>
                <div><span>Close rate</span><b className="num">{Math.round(s.closeRate * 100)}%</b></div>
                <div><span>Sales</span><b className="num">{naira(s.revenueKobo)}</b></div>
              </div>
            </section>
          );
        })}
      </div>

      {isOwner && (
        <>
          <details className="panel">
            <summary className="panel-h"><h2>Add a sales rep</h2><span className="btn primary">Add</span></summary>
            <div className="panel-b">
              <p className="small muted">They log in on their own phone. Every chat they handle is timed and counted here.</p>
              <ActionForm action={addRep}>
                <label className="field">Name<input className="input" name="name" required /></label>
                <label className="field">Email<input className="input" name="email" type="email" autoComplete="off" required /></label>
                <label className="field">Temporary password<input className="input" name="password" type="text" autoComplete="off" minLength={8} required /></label>
                <Submit>Add rep</Submit>
              </ActionForm>
            </div>
          </details>

          <section className="panel list">
            {users.filter(u => u.role === "REP").map(u => (
              <form key={u.id} action={setRepActive} className="item row between">
                <input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="active" value={String(!u.active)} />
                <span><b>{u.name}</b> <span className="small muted">{u.email}</span></span>
                <button className="btn ghost">{u.active ? "Remove access" : "Restore access"}</button>
              </form>
            ))}
          </section>
        </>
      )}
    </>
  );
}
