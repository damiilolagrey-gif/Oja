import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { naira, timeOfDay } from "@/lib/format";
import { repStats } from "@/lib/metrics";
import { can, ROLE_HELP, ROLE_LABEL } from "@/lib/permissions";
import { ActionForm, Submit } from "@/components/ActionForm";
import { addRep, setMissLimit, setRepActive, setRole } from "@/app/actions/team";
import { AutoSubmitLimit } from "./AutoSubmitLimit";
import { PERIODS, periodFrom, periodStart } from "./period";

export const dynamic = "force-dynamic";

export default async function Team({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const user = await requireUser();
  const period = periodFrom((await searchParams).p);
  const now = new Date();
  const limit = user.shop.missLimitMinutes;
  const seeAll = can(user.role, "reports");
  const manage = can(user.role, "team");
  const [users, convs, recent] = await Promise.all([
    db.user.findMany({ where: { shopId: user.shopId }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    db.conversation.findMany({ where: { shopId: user.shopId, startedAt: { gte: periodStart(period, now) } } }),
    seeAll
      ? db.activity.findMany({ where: { shopId: user.shopId }, orderBy: { createdAt: "desc" }, take: 8, include: { user: true } })
      : Promise.resolve([]),
  ]);
  const fmt = (v: number | null) => (v == null ? "–" : `${Math.round(v)} min`);
  // Reps see their own scorecard; owners and managers see everyone's.
  const shown = users.filter(u => u.active && (seeAll || u.id === user.id));

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
      {manage && <AutoSubmitLimit action={setMissLimit} value={limit} />}

      <div className="grid-cards">
        {shown.map(u => {
          const s = repStats(convs.filter(c => c.repId === u.id), now, limit);
          return (
            <section key={u.id} className="panel panel-b">
              <div className="row between">
                <div><b>{u.name}</b><div className="small muted">{ROLE_LABEL[u.role]} · {s.chats} chats</div></div>
                {s.waitingNow ? <span className={`pill ${s.missed ? "bad" : "gold"}`}>{s.waitingNow} waiting</span> : <span className="pill good">All answered</span>}
              </div>
              <div className="rep-stats">
                <div><span>Avg first reply</span><b className="num" style={{ color: (s.avgFirstReplyMin ?? 0) > limit ? "var(--bad)" : undefined }}>{fmt(s.avgFirstReplyMin)}</b></div>
                <div><span>Missed chats</span><b className="num" style={{ color: s.missed ? "var(--bad)" : undefined }}>{s.missed}</b></div>
                <div><span>Close rate</span><b className="num">{Math.round(s.closeRate * 100)}%</b></div>
                <div><span>Sales</span><b className="num">{naira(s.revenueKobo)}</b></div>
              </div>
              {seeAll && <Link href={`/app/team/activity?u=${u.id}&p=${period}`} className="small">See {u.id === user.id ? "your" : `${u.name.split(" ")[0]}'s`} activity →</Link>}
            </section>
          );
        })}
      </div>

      {seeAll && (
        <section className="panel">
          <div className="panel-h"><h2>Recent activity</h2><Link href="/app/team/activity" className="btn">See all</Link></div>
          <div className="list">
            {recent.length === 0 && <p className="item muted">Nothing yet. Every reply, sale, stock change and login by your team shows here.</p>}
            {recent.map(a => (
              <div key={a.id} className="item">
                <span><b>{a.user?.name ?? "Someone"}</b> {lower(a.summary)}</span>
                <span className="small muted"> · {timeOfDay(a.createdAt)}{a.device ? ` · ${a.device}` : ""}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {manage && (
        <>
          <details className="panel">
            <summary className="panel-h"><h2>Add a team member</h2><span className="btn primary">Add</span></summary>
            <div className="panel-b">
              <p className="small muted">They log in on their own phone. Every chat they handle is timed, and everything they do is in the activity log.</p>
              <ActionForm action={addRep}>
                <label className="field">Name<input className="input" name="name" required /></label>
                <label className="field">Email<input className="input" name="email" type="email" autoComplete="off" required /></label>
                <label className="field">Temporary password<input className="input" name="password" type="text" autoComplete="off" minLength={8} required /></label>
                <label className="field">Role
                  <select className="input" name="role" defaultValue="REP">
                    <option value="REP">Sales rep</option>
                    <option value="MANAGER">Manager</option>
                  </select>
                  <span className="hint">Sales rep: {ROLE_HELP.REP} Manager: {ROLE_HELP.MANAGER}</span>
                </label>
                <Submit>Add</Submit>
              </ActionForm>
            </div>
          </details>

          <section className="panel list">
            {users.filter(u => u.role !== "OWNER").map(u => (
              <div key={u.id} className="item stack" style={{ gap: 8 }}>
                <span><b>{u.name}</b> <span className="small muted">{u.email}{!u.active ? " · access removed" : ""}</span></span>
                <span className="row" style={{ flexWrap: "wrap" }}>
                  {u.active && (
                    <form action={setRole} className="row">
                      <input type="hidden" name="id" value={u.id} />
                      <select className="input" name="role" defaultValue={u.role} aria-label={`${u.name}'s role`} style={{ minHeight: 36 }}>
                        <option value="REP">Sales rep</option>
                        <option value="MANAGER">Manager</option>
                      </select>
                      <button className="btn ghost">Change</button>
                    </form>
                  )}
                  <form action={setRepActive}>
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="active" value={String(!u.active)} />
                    <button className="btn ghost">{u.active ? "Remove access" : "Restore access"}</button>
                  </form>
                </span>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
