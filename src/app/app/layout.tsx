import Link from "next/link";
import { db } from "@/lib/db";
import { isAdminEmail, requireUser } from "@/lib/session";
import { TabBar } from "@/components/TabBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [waiting, toShip] = await Promise.all([
    db.conversation.count({ where: { shopId: user.shopId, status: "OPEN", firstReplyAt: null } }),
    db.order.count({ where: { shopId: user.shopId, status: "PAID" } }),
  ]);
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
      <TabBar waiting={waiting} toShip={toShip} admin={isAdminEmail(user.email)} />
      <main className="content">{children}</main>
    </div>
  );
}
