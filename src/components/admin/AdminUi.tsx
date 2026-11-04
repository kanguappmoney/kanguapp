import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Badge({
  tone,
  children,
}: {
  tone: "green" | "red" | "amber" | "gray";
  children: React.ReactNode;
}) {
  const cls = {
    green: "bg-green-100 text-green-800",
    red: "bg-red-100 text-red-800",
    amber: "bg-yellow-400/25 text-navy-900",
    gray: "bg-navy-900/5 text-navy-700/70",
  }[tone];
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

// Tabela com rolagem horizontal (telas estreitas).
export function AdminTable({
  head,
  children,
  empty,
}: {
  head: string[];
  children: React.ReactNode;
  empty?: string;
}) {
  const rows = Array.isArray(children) ? children.length : children ? 1 : 0;
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-navy-900/10 text-xs uppercase tracking-wide text-navy-700/60">
          <tr>
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-navy-900/5">{children}</tbody>
      </table>
      {rows === 0 && (
        <p className="px-4 py-8 text-center text-sm text-navy-700/60">{empty ?? "Nada por aqui."}</p>
      )}
    </div>
  );
}

export function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}

export function Pager({
  base,
  page,
  pages,
}: {
  base: string; // ex.: "/admin/buscas" ou "/admin/captacao?status=pending"
  page: number;
  pages: number;
}) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sep = base.includes("?") ? "&" : "?";
    return p <= 1 ? base : `${base}${sep}pagina=${p}`;
  };
  return (
    <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Paginação">
      {page > 1 ? (
        <Link href={href(page - 1)} className="flex items-center gap-1 rounded-xl border border-navy-900/15 bg-white px-3 py-2 font-semibold">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
        </Link>
      ) : (
        <span />
      )}
      <span className="text-navy-700/70">
        Página {page} de {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className="flex items-center gap-1 rounded-xl border border-navy-900/15 bg-white px-3 py-2 font-semibold">
          Próxima <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
      Não foi possível carregar: {message}
    </p>
  );
}

// Card de número da Visão Geral: valor grande + legenda + detalhe opcional.
export function StatCard({
  label,
  value,
  detail,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm" data-testid={testId}>
      <p className="text-xs font-semibold uppercase tracking-wide text-navy-700/60">{label}</p>
      <p className="mt-1 font-display text-3xl text-navy-900">{value}</p>
      {detail && <p className="mt-1 text-xs text-navy-700/60">{detail}</p>}
    </div>
  );
}

// Caixa de gráfico com título.
export function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h3 className="font-semibold text-navy-900">{title}</h3>
      {hint && <p className="mb-3 text-xs text-navy-700/60">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </section>
  );
}
