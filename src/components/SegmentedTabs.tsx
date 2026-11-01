import Link from "next/link";

// Abas de navegação em controle segmentado (fundo cinza, aba ativa branca).
// Extraído do Financeiro (era o único padrão de abas de navegação do app) para
// reuso. Cada aba é um link — a aba ativa vive na URL, sem estado de cliente.
// Largura proporcional ao rótulo (flex-auto): rótulos longos não truncam.
export function SegmentedTabs({
  tabs,
  active,
}: {
  tabs: { key: string; label: string; href: string }[];
  active: string;
}) {
  return (
    <nav className="flex gap-0.5 rounded-xl bg-navy-900/5 p-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={`flex-auto whitespace-nowrap rounded-lg px-2 py-2 text-center text-xs font-semibold ${
            active === t.key ? "bg-white text-navy-900 shadow-sm" : "text-navy-700/60"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
