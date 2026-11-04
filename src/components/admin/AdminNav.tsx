"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/visao-geral", label: "Visão geral" },
  { href: "/admin/motoristas", label: "Motoristas" },
  { href: "/admin/responsaveis", label: "Responsáveis" },
  { href: "/admin/captacao", label: "Captação" },
  { href: "/admin/buscas", label: "Buscas" },
  { href: "/admin/assinaturas", label: "Assinaturas" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto" aria-label="Seções do admin">
      {TABS.map((t) => {
        const active = path === t.href || path.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold ${
              active ? "bg-yellow-400 text-navy-900" : "text-navy-700/70 hover:bg-navy-900/5"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
