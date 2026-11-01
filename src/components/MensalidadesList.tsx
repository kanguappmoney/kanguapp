import Link from "next/link";
import { Pencil } from "lucide-react";
import { centsToBRL } from "@/lib/money";
import { PAY_CHIP, SHIFT_LABEL } from "@/lib/pay-status";

// Aba Mensalidades: consulta (sem editar valor aqui). "Editar" leva ao cadastro
// do aluno que já existe — nenhum formulário duplicado.
export interface MensalidadeRow {
  id: string;
  name: string;
  school: string;
  shift: string | null;
  feeCents: number | null;
  payStatus: string;
  routes: string[];
}

export function MensalidadesList({ rows, filtered }: { rows: MensalidadeRow[]; filtered: boolean }) {
  const total = rows.reduce((a, r) => a + (r.feeCents ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between px-1 text-sm">
        <span className="text-navy-700/60">
          {rows.length}{" "}
          {filtered
            ? `${rows.length === 1 ? "aluno" : "alunos"} no filtro`
            : rows.length === 1
              ? "aluno ativo"
              : "alunos ativos"}
        </span>
        <span className="font-semibold text-navy-900">{centsToBRL(total)}/mês</span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-navy-900/15 p-4 text-center text-sm text-navy-700/60">
          {filtered ? "Nenhum aluno com esses filtros." : "Nenhum aluno ativo."}
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const chip = PAY_CHIP[r.payStatus] ?? PAY_CHIP.ok;
            return (
              <li
                key={r.id}
                className="rounded-2xl border border-navy-900/5 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-navy-900">{r.name}</p>
                    <p className="truncate text-xs text-navy-700/60">
                      {r.school}
                      {r.shift ? ` • ${SHIFT_LABEL[r.shift] ?? r.shift}` : ""}
                      {r.routes.length ? ` • ${r.routes.join(", ")}` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${chip.cls}`}>
                    {chip.label}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-lg font-bold text-navy-900">
                    {r.feeCents != null ? (
                      centsToBRL(r.feeCents)
                    ) : (
                      <span className="text-sm font-medium text-navy-700/50">Sem mensalidade definida</span>
                    )}
                  </span>
                  <Link
                    href={`/motorista/alunos/${r.id}/editar`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-navy-700/70"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
