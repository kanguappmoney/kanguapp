"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Route,
  Users,
  Wallet,
  User,
  CreditCard,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// Ícones lucide vivem aqui (Client Component) — não podem ser passados de um
// Server Component (layout) como props.
const NAV: Record<"driver" | "guardian", NavItem[]> = {
  driver: [
    { href: "/motorista", label: "Início", icon: Home },
    { href: "/motorista/rotas", label: "Rotas", icon: Route },
    { href: "/motorista/alunos", label: "Alunos", icon: Users },
    { href: "/motorista/financeiro", label: "Financeiro", icon: Wallet },
    { href: "/motorista/perfil", label: "Perfil", icon: User },
  ],
  guardian: [
    { href: "/responsavel", label: "Início", icon: Home },
    { href: "/responsavel/rotas", label: "Rotas", icon: Route },
    { href: "/responsavel/pagamentos", label: "Pagamentos", icon: CreditCard },
    { href: "/responsavel/perfil", label: "Perfil", icon: User },
  ],
};

export function BottomNav({ role }: { role: "driver" | "guardian" }) {
  const pathname = usePathname();
  const items = NAV[role];

  // Ativo = o item cujo href é o match mais específico (mais longo). Evita que
  // o item raiz (/motorista) fique ativo em /motorista/alunos.
  const activeHref = items
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav
      className="sticky bottom-0 z-10 grid border-t border-navy-900/10 bg-white"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const active = item.href === activeHref;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium ${
              active ? "text-yellow-400" : "text-navy-700/40"
            }`}
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
