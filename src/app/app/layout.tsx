import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { TabBar } from "@/components/TabBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const waiting = await db.conversation.count({ where: { shopId: user.shopId, status: "OPEN", firstReplyAt: null } });
  return (
    <div className="app">
      <header className="topbar">
        <Link href="/app" className="brand">Oja</Link>
        <div className="shopname">
          <b>{user.shop.name}</b>
          <br />
          {user.name} · {user.role === "OWNER" ? "Owner" : "Sales rep"}
        </div>
      </header>
      <TabBar waiting={waiting} />
      <main className="content">{children}</main>
    </div>
  );
}
