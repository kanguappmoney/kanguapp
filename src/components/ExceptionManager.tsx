"use client";

import { useActionState, useEffect, useState } from "react";
import { CalendarOff, CalendarPlus, Trash2 } from "lucide-react";
import {
  addException,
  removeException,
  type ExceptionState,
} from "@/lib/actions/exceptions";
import { isoDowOf } from "@/lib/day";
import { routeRunsToday } from "@/lib/recurrence";

export interface ExceptionRow {
  id: string;
  date: string;
  kind: "skip" | "extra";
  reason: string | null;
}

const initial: ExceptionState = { error: null };

const WD_LABEL = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

// Formata 'YYYY-MM-DD' como 'dd/mm' + dia da semana, sem cair em fuso (a data é
// pura, não um instante — meio-dia UTC evita o -1 dia).
function prettyDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${d}/${m} · ${WD_LABEL[isoDowOf(date)]}`;
}

export function ExceptionManager({
  routeId,
  weekdays,
  today,
  exceptions,
}: {
  routeId: string;
  weekdays: number[];
  today: string;
  exceptions: ExceptionRow[];
}) {
  const [state, action, pending] = useActionState(addException, initial);
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState<"skip" | "extra">("skip");

  // Sugestão contextual: neste dia a rota RODA pela regra semanal? (só a regra —
  // ignora exceções, é o que decide qual tipo faz sentido). Se roda, o desvio útil
  // é 'skip' (feriado); se não roda, é 'extra' (reposição). Pré-seleciona o tipo.
  const runsByRule = date
    ? routeRunsToday(weekdays, null, isoDowOf(date))
    : false;
  useEffect(() => {
    setKind(runsByRule ? "skip" : "extra");
  }, [runsByRule]);

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-4">
        <input type="hidden" name="route_id" value={routeId} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="kind" value={kind} />

        <div>
          <span className="mb-1.5 block text-sm font-medium text-navy-800">Dia</span>
          <input
            type="date"
            value={date}
            min={today}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3 outline-none focus:border-navy-700 focus:ring-2 focus:ring-yellow-400/40"
          />
          {date && (
            <p className="mt-1.5 text-xs text-navy-700/60">
              {runsByRule
                ? "Neste dia a rota normalmente roda — marque um feriado para não rodar."
                : "Neste dia a rota normalmente não roda — marque uma reposição para rodar."}
            </p>
          )}
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-navy-800">
            Tipo
          </span>
          <div className="grid grid-cols-2 gap-2">
            <KindButton
              active={kind === "skip"}
              onClick={() => setKind("skip")}
              icon={CalendarOff}
              title="Feriado"
              subtitle="não roda"
            />
            <KindButton
              active={kind === "extra"}
              onClick={() => setKind("extra")}
              icon={CalendarPlus}
              title="Reposição"
              subtitle="roda"
            />
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-navy-800">
            Motivo <span className="text-navy-700/50">(opcional)</span>
          </span>
          <input
            name="reason"
            placeholder="Ex.: Feriado municipal"
            className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3 outline-none focus:border-navy-700 focus:ring-2 focus:ring-yellow-400/40"
          />
        </label>

        {state.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900 disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Adicionar exceção"}
        </button>
      </form>

      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-700/50">
          Próximas exceções
        </h2>
        {exceptions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-navy-900/15 p-3 text-sm text-navy-700/60">
            Nenhuma exceção marcada. A rota segue a agenda semanal.
          </p>
        ) : (
          <ul className="space-y-2">
            {exceptions.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-3 rounded-xl border border-navy-900/10 bg-white px-3 py-2.5"
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    e.kind === "skip"
                      ? "bg-navy-900/5 text-navy-700/70"
                      : "bg-yellow-400/25 text-navy-900"
                  }`}
                >
                  {e.kind === "skip" ? (
                    <CalendarOff className="h-4 w-4" />
                  ) : (
                    <CalendarPlus className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-navy-900">
                    {prettyDate(e.date)}
                    <span className="ml-2 text-xs font-normal text-navy-700/60">
                      {e.kind === "skip" ? "não roda" : "roda"}
                    </span>
                  </p>
                  {e.reason && (
                    <p className="truncate text-xs text-navy-700/50">{e.reason}</p>
                  )}
                </div>
                <form action={removeException.bind(null, e.id, routeId)}>
                  <button
                    type="submit"
                    aria-label="Remover exceção"
                    className="p-1.5 text-navy-700/50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function KindButton({
  active,
  onClick,
  icon: Icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof CalendarOff;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left ${
        active
          ? "border-navy-900 bg-navy-900/[0.04] ring-2 ring-yellow-400/40"
          : "border-navy-900/15"
      }`}
    >
      <Icon className="h-5 w-5 shrink-0 text-navy-700/70" />
      <span>
        <span className="block text-sm font-semibold text-navy-900">{title}</span>
        <span className="block text-xs text-navy-700/60">{subtitle}</span>
      </span>
    </button>
  );
}
