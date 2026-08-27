"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      className="sticky bottom-0 z-10 grid border-t border-navy-900/10 bg-white"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 py-2 text-xs ${
              active ? "text-navy-900" : "text-navy-700/50"
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
            {active && (
              <span className="mt-0.5 h-0.5 w-6 rounded-full bg-yellow-400" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
