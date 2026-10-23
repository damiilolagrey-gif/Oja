"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const icons: Record<string, React.ReactNode> = {
  home: <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  products: <path d="M4 7h16l-1.5 13h-13zM9 7a3 3 0 0 1 6 0" />,
  inbox: <path d="M4 5h16v11H9l-5 4z" />,
  team: <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-6 9a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6 6 0 0 1 3 6" />,
  settings: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4.9a7.5 7.5 0 0 0-2-1.2L14.5 3h-5l-.4 2.5a7.5 7.5 0 0 0-2 1.2l-2.4-.9-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-.9a7.5 7.5 0 0 0 2 1.2l.4 2.5h5l.4-2.5a7.5 7.5 0 0 0 2-1.2l2.4.9 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" />,
};

const tabs = [
  { href: "/app", label: "Home", icon: "home" },
  { href: "/app/products", label: "Products", icon: "products" },
  { href: "/app/inbox", label: "Inbox", icon: "inbox" },
  { href: "/app/team", label: "Team", icon: "team" },
  { href: "/app/settings", label: "Settings", icon: "settings" },
];

export function TabBar({ waiting }: { waiting: number }) {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label="Main">
      {tabs.map(t => {
        const active = t.href === "/app" ? path === "/app" : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
              {icons[t.icon]}
            </svg>
            <span>{t.label}</span>
            {t.icon === "inbox" && waiting > 0 && <span className="badge">{waiting}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
