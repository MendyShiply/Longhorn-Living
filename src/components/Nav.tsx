"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/loads", label: "Loads", icon: "🚚" },
  { href: "/scan", label: "Scan", icon: "📷" },
  { href: "/inventory", label: "Inventory", icon: "📦" },
  { href: "/listings", label: "Listings", icon: "🏷️" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function Nav({ businessName, userName }: { businessName: string; userName: string }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      {/* Desktop top bar */}
      <header className="no-print sticky top-0 z-20 hidden border-b border-stone-200 bg-white md:block">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link href="/" className="text-lg font-extrabold text-brand-500">
            {businessName}
          </Link>
          <nav className="flex gap-1">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  active(l.href) ? "bg-brand-50 text-brand-600" : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-stone-500">
            <span>{userName}</span>
            <form action="/auth/signout" method="post">
              <button className="text-stone-500 underline">Sign out</button>
            </form>
          </div>
        </div>
      </header>

      {/* Phone bottom tabs */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex flex-col items-center py-2 text-[11px] ${
              active(l.href) ? "font-semibold text-brand-600" : "text-stone-500"
            }`}
          >
            <span className="text-xl leading-none">{l.icon}</span>
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
