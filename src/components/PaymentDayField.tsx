"use client";

import { useState, useTransition } from "react";
import { CalendarDays } from "lucide-react";
import { setStudentPaymentDay } from "@/lib/actions/invoices";
import { IconBadge } from "@/components/patterns";
import { paymentDayLabel } from "@/lib/payment-day";

// Data de pagamento do aluno (dia do mês). Todo aluno tem: sem dia definido mostra "Adicionar data de
// pagamento" (e as faturas vencem no dia 10, o padrão); com dia, mostra "Dia N de cada mês" + Alterar.
export function PaymentDayField({
  studentId,
  initialDay,
}: {
  studentId: string;
  initialDay: number | null;
}) {
  const [day, setDay] = useState<number | null>(initialDay);
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState<string>(initialDay ? String(initialDay) : "10");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(next: number | null) {
    setError(null);
    startTransition(async () => {
      const r = await setStudentPaymentDay(studentId, next);
      if (r.error) {
        setError(r.error);
        return;
      }
      setDay(next);
      setEditing(false);
    });
  }

  return (
    <div className="rounded-2xl bg-cream p-4">
      <div className="flex items-center gap-3">
        <IconBadge icon={CalendarDays} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-navy-700/60">
            Data de pagamento
          </p>
          <p className="font-semibold text-navy-900">{paymentDayLabel(day)}</p>
          {day === null && (
            <p className="text-xs text-navy-700/60">Sem data definida, a fatura vence no dia 10.</p>
          )}
        </div>
      </div>

      {!editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-3 w-full rounded-xl bg-yellow-400 py-2.5 text-sm font-semibold text-navy-900"
        >
          {day === null ? "Adicionar data de pagamento" : "Alterar data de pagamento"}
        </button>
      )}

      {editing && (
        <div className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-navy-800">Vence todo dia</span>
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3 text-navy-900"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-navy-700/60">
              Em meses mais curtos, vence no último dia do mês.
            </span>
          </label>
          {error && <p className="rounded-lg bg-white px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              className="flex-1 rounded-xl border border-navy-900/15 bg-white py-2.5 text-sm font-semibold text-navy-900"
            >
              Cancelar
            </button>
            {day !== null && (
              <button
                type="button"
                disabled={pending}
                onClick={() => save(null)}
                className="rounded-xl border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 disabled:opacity-60"
              >
                Remover
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => save(Number(pick))}
              className="flex-1 rounded-xl bg-navy-900 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
