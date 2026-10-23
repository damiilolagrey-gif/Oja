import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";

export default async function Landing() {
  if (await currentUser()) redirect("/app");
  return (
    <main className="landing">
      <span className="brand">Oja</span>
      <div className="stack">
        <h1>Stop losing buyers to &quot;sold out&quot;.</h1>
        <p className="muted">
          For vendors who sell on Instagram and WhatsApp. When an item sells out, buyers join a waitlist. When you
          restock, Oja sends them a WhatsApp message and the sales come back to you.
        </p>
      </div>
      <div className="row">
        <Link href="/signup" className="btn primary">Create your shop free</Link>
        <Link href="/login" className="btn">Log in</Link>
      </div>
      <ul className="muted">
        <li><b>Waitlists</b> from Instagram DMs, comments and your shop page</li>
        <li><b>Restock alerts</b> on WhatsApp, with YES to reserve</li>
        <li><b>One inbox</b> for Instagram DMs and WhatsApp chats</li>
        <li><b>Rep scorecard</b>: who replies fast, who misses chats, who sells</li>
      </ul>
    </main>
  );
}
