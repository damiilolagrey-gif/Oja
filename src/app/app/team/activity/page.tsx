import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { timeOfDay } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/permissions";
import { PERIODS, periodFrom, periodStart } from "../period";

export const dynamic = "force-dynamic";

const TARGET_LINK: Record<string, (id: string) => string> = {
  conversation: id => `/app/inbox/${id}`,
  order: id => `/app/orders/${id}`,
  product: id => `/app/products/${id}`,
};

const day = (d: Date) => d.toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" });

export default async function Activity({ searchParams }: { searchParams: Promise<{ u?: string; p?: string }> }) {
  const user = await requirePermission("reports");
  const sp = await searchParams;
  const period = periodFrom(sp.p ?? "7d");
  const staff = await db.user.findMany({ where: { shopId: user.shopId }, orderBy: { name: "asc" } });
  const who = staff.find(s => s.id === sp.u) ?? null;
  const rows = await db.activity.findMany({
    where: { shopId: user.shopId, createdAt: { gte: periodStart(period, new Date()) }, ...(who ? { userId: who.id } : {}) },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { user: true },
  });
  const byDay = new Map<string, typeof rows>();
  for (const r of rows) byDay.set(day(r.createdAt), [...(byDay.get(day(r.createdAt)) ?? []), r]);
  const q = (u: string | null, p: string) => `/app/team/activity?${new URLSearchParams({ ...(u ? { u } : {}), p })}`;

  return (
    <>
      <Link href="/app/team" className="small">← Team</Link>
      <h1>{who ? `${who.name}'s activity` : "Team activity"}</h1>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <Link href={q(null, period)} className={`btn ${!who ? "primary" : ""}`} style={{ minHeight: 36 }}>Everyone</Link>
        {staff.map(s => (
          <Link key={s.id} href={q(s.id, period)} className={`btn ${who?.id === s.id ? "primary" : ""}`} style={{ minHeight: 36 }}>
            {s.name.split(" ")[0]}{!s.active ? " (removed)" : ""}
          </Link>
        ))}
      </div>
      <div className="row">
        {Object.entries(PERIODS).map(([k, label]) => (
          <Link key={k} href={q(who?.id ?? null, k)} className={`btn ${period === k ? "primary" : ""}`} style={{ minHeight: 36 }}>{label}</Link>
        ))}
      </div>

      {rows.length === 0 && <p className="muted">No activity in this period.</p>}
      {[...byDay.entries()].map(([d, items]) => (
        <section key={d} className="panel">
          <div className="panel-h"><h2 style={{ fontSize: 15 }}>{d}</h2><span className="small muted">{items.length} actions</span></div>
          <div className="list">
            {items.map(a => {
              const href = a.targetType && a.targetId ? TARGET_LINK[a.targetType]?.(a.targetId) : undefined;
              return (
                <div key={a.id} className="item">
                  <div className="row between">
                    <span>{href ? <Link href={href} style={{ color: "inherit" }}>{a.summary}</Link> : a.summary}</span>
                    <span className="small muted num">{timeOfDay(a.createdAt)}</span>
                  </div>
                  <span className="small muted">
                    {a.user ? `${a.user.name} (${ROLE_LABEL[a.user.role]})` : "Removed user"}{a.device ? ` · ${a.device}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {rows.length === 300 && <p className="small muted">Showing the latest 300. Pick a shorter period or one person to see more.</p>}
    </>
  );
}
