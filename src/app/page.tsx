import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";

export default async function Landing() {
  if (await currentUser()) redirect("/app");
  return (
    <main className="landing">
      <span className="brand">Oja</span>
      <div className="stack">
        <h1>Make ads that sell. Run them everywhere your buyers are.</h1>
        <p className="muted">
          Type what you want, like &quot;Owambe ad for my adire, gold vibe&quot;, and get finished ad images, short videos and captions in
          seconds. Run them on Instagram, Facebook, TikTok, Google and more, and see which ad brought each WhatsApp order.
        </p>
      </div>
      <div className="row">
        <Link href="/signup" className="btn primary">Make your first ad free</Link>
        <Link href="/login" className="btn">Log in</Link>
      </div>
      <ul className="muted">
        <li><b>Ad studio</b>: images in every size, a 6-second video and captions for every platform, from one sentence</li>
        <li><b>Run campaigns</b> with a budget and audience, paid with your own card to each platform</li>
        <li><b>Know what sells</b>: every ad has its own WhatsApp link, so each chat and order is traced back to it</li>
        <li><b>Sell in the chat</b>: an AI assistant answers buyers, takes payment safely and books delivery</li>
        <li><b>Team and stock</b>: sales reps, activity log, restock alerts</li>
      </ul>
    </main>
  );
}
