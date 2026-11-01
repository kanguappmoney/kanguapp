"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { Fuel, Wrench, Package, Trash2 } from "lucide-react";
import { addExpense, deleteExpense, type ExpenseState } from "@/lib/actions/expenses";
import { centsToBRL } from "@/lib/money";
import { CATEGORY_COLORS, Donut } from "@/components/charts";

// R11 — aba "Despesas" do Financeiro: lançar, listar e somar por categoria
// as despesas do mês selecionado. Categoria só as 3 fixas.

export interface Expense {
  id: string;
  category: "combustivel" | "manutencao" | "outros";
  amount_cents: number;
  expense_date: string;
  note: string | null;
}

const CATEGORY: Record<Expense["category"], { label: string; icon: typeof Fuel }> = {
  combustivel: { label: "Combustível", icon: Fuel },
  manutencao: { label: "Manutenção", icon: Wrench },
  outros: { label: "Outros", icon: Package },
};

const initial: ExpenseState = { error: null };

function brDate(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

export function ExpensesPanel({
  expenses,
  defaultDate,
  monthLabel,
}: {
  expenses: Expense[];
  defaultDate: string; // data sugerida no formulário (dentro do mês selecionado)
  monthLabel: string;
}) {
  const [deleting, startTransition] = useTransition();

  const totalCents = expenses.reduce((a, e) => a + e.amount_cents, 0);
  const byCategory = (Object.keys(CATEGORY) as Expense["category"][]).map((c) => ({
    category: c,
    cents: expenses.filter((e) => e.category === c).reduce((a, e) => a + e.amount_cents, 0),
  }));

  return (
    <div className="space-y-5">
      {/* Totais do mês selecionado */}
      <div className="rounded-2xl bg-navy-900 p-5 text-white">
        <p className="text-sm text-white/60">Despesas em {monthLabel}</p>
        <p className="mt-1 text-3xl font-bold">{centsToBRL(totalCents)}</p>
      </div>

      {/* Por categoria: donut + legenda (nome e valor sempre visíveis) */}
      <div className="flex items-center gap-4 rounded-2xl border border-navy-900/5 bg-white p-4 shadow-sm">
        <Donut
          size={104}
          label={byCategory
            .map(({ category, cents }) => `${CATEGORY[category].label} ${centsToBRL(cents)}`)
            .join(", ")}
          slices={byCategory.map(({ category, cents }) => ({
            key: category,
            label: CATEGORY[category].label,
            value: cents,
            color: CATEGORY_COLORS[category],
            display: centsToBRL(cents),
          }))}
        />
        <ul className="min-w-0 flex-1 space-y-2">
          {byCategory.map(({ category, cents }) => {
            const { label } = CATEGORY[category];
            return (
              <li key={category} className="flex items-center gap-2 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: CATEGORY_COLORS[category] }}
                />
                <span className="min-w-0 flex-1 truncate text-navy-700/80">{label}</span>
                <span className="shrink-0 font-semibold text-navy-900">{centsToBRL(cents)}</span>
              </li>
            );
          })}
          {totalCents === 0 && (
            <li className="text-xs text-navy-700/50">Sem despesas no mês.</li>
          )}
        </ul>
      </div>

      {/* Lançar despesa (mesmo formulário do "+ Nova despesa" da Visão Geral) */}
      <ExpenseForm defaultDate={defaultDate} />

      {/* Lista do mês */}
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-700/50">
          Lançadas no mês
        </h2>
        {expenses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-navy-900/15 p-4 text-center text-sm text-navy-700/60">
            Nenhuma despesa lançada em {monthLabel}.
          </div>
        ) : (
          <ul className="space-y-2">
            {expenses.map((e) => {
              const { label, icon: Icon } = CATEGORY[e.category];
              return (
                <li
                  key={e.id}
                  className="flex items-center gap-3 rounded-2xl border border-navy-900/5 bg-white p-3 shadow-sm"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yellow-400/20 text-navy-900">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-navy-900">
                      {label} • {centsToBRL(e.amount_cents)}
                    </p>
                    <p className="truncate text-xs text-navy-700/50">
                      {brDate(e.expense_date)}
                      {e.note ? ` • ${e.note}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => startTransition(() => deleteExpense(e.id))}
                    disabled={deleting}
                    aria-label="Excluir despesa"
                    className="p-2 text-navy-700/40 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// Formulário de despesa — fonte única: a sub-aba Despesas e o "+ Nova despesa"
// (sheet) da Visão Geral usam este mesmo componente. `onSaved` (opcional) é
// chamado após salvar com sucesso (o sheet fecha); o formulário sempre limpa.
export function ExpenseForm({
  defaultDate,
  onSaved,
}: {
  defaultDate: string;
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState(addExpense, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      onSaved?.();
    }
    // onSaved muda a cada render do pai; só o resultado da action importa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="space-y-3 rounded-2xl border border-navy-900/5 bg-white p-4 shadow-sm"
    >
      <p className="font-semibold text-navy-900">Nova despesa</p>
      <label className="block text-sm">
        <span className="mb-1 block text-navy-700/70">Categoria</span>
        <select
          name="category"
          required
          defaultValue="combustivel"
          className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-2.5"
        >
          {(Object.keys(CATEGORY) as Expense["category"][]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY[c].label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="mb-1 block text-navy-700/70">Valor (R$)</span>
          <input
            name="amount"
            inputMode="decimal"
            required
            placeholder="0,00"
            className="w-full rounded-xl border border-navy-900/15 px-3 py-2.5"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-navy-700/70">Data</span>
          <input
            name="expense_date"
            type="date"
            required
            defaultValue={defaultDate}
            className="w-full rounded-xl border border-navy-900/15 px-3 py-2.5"
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-navy-700/70">Observação (opcional)</span>
        <input
          name="note"
          placeholder="Ex.: troca de óleo"
          className="w-full rounded-xl border border-navy-900/15 px-3 py-2.5"
        />
      </label>
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900 disabled:opacity-60"
      >
        {pending ? "Salvando…" : "Adicionar despesa"}
      </button>
    </form>
  );
}
