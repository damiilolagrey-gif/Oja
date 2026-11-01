import Link from "next/link";

/** Switches between making ads (the studio) and running them (campaigns). */
export function StudioNav({ on }: { on: "studio" | "ads" }) {
  return (
    <nav className="subnav" aria-label="Ads">
      <Link href="/app/studio" aria-current={on === "studio" ? "page" : undefined}>Make ads</Link>
      <Link href="/app/ads" aria-current={on === "ads" ? "page" : undefined}>Campaigns</Link>
    </nav>
  );
}
