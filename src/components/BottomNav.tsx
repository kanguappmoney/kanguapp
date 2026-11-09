"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Route,
  Users,
  Wallet,
  User,
  Settings,
  CreditCard,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/Logo";

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
    { href: "/motorista/perfil", label: "Configurações", icon: Settings },
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

  // Barra flutuante azul-marinho (cápsula solta das bordas). No motorista, o Início vira o botão central maior com
  // o ícone do canguru, saltando acima da barra; os outros quatro ficam dois de cada lado.
  const centerHome = role === "driver";
  const home = items[0];
  const rest = centerHome ? items.slice(1) : items;
  const left = centerHome ? rest.slice(0, Math.ceil(rest.length / 2)) : rest;
  const right = centerHome ? rest.slice(Math.ceil(rest.length / 2)) : [];

  const tab = (item: NavItem) => {
    const active = item.href === activeHref;
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`flex flex-1 flex-col items-center gap-1 whitespace-nowrap py-2 text-[10px] font-medium transition-colors ${
          active ? "text-yellow-400" : "text-white/55"
        }`}
      >
        <Icon className="h-5 w-5" />
        {item.label}
      </Link>
    );
  };

  const homeActive = home.href === activeHref;

  return (
    <div
      className="pointer-events-none sticky bottom-0 z-10 px-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <nav className="pointer-events-auto relative flex items-end rounded-full bg-navy-900 px-3 pt-1 shadow-[0_10px_30px_rgba(13,27,61,0.35)] ring-1 ring-white/10">
        {left.map(tab)}
        {centerHome && (
          <Link
            href={home.href}
            aria-label={home.label}
            aria-current={homeActive ? "page" : undefined}
            className="relative -mt-7 flex w-20 shrink-0 flex-col items-center pb-2"
          >
            <span
              className={`flex h-16 w-16 items-center justify-center rounded-full bg-yellow-400 ring-4 ring-navy-900 shadow-[0_8px_20px_rgba(255,208,0,0.45)] transition-transform active:scale-95 ${
                homeActive ? "outline outline-2 outline-offset-2 outline-yellow-400/70" : ""
              }`}
            >
              <Logo variant="icon" alt="" className="h-12 w-12 select-none" />
            </span>
            <span className={`mt-1 text-[10px] font-medium ${homeActive ? "text-yellow-400" : "text-white/55"}`}>
              {home.label}
            </span>
          </Link>
        )}
        {right.map(tab)}
      </nav>
    </div>
  );
}
