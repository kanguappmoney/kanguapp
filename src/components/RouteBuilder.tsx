"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown, X, Plus, RotateCcw } from "lucide-react";
import {
  createRoute,
  updateRoute,
  type RouteFormState,
} from "@/lib/actions/routes";

interface Student {
  id: string;
  full_name: string;
  school: string | null;
  shift: "morning" | "afternoon" | "integral" | null;
}

type Shift = "morning" | "afternoon" | "integral";

// Rota carregada do banco para edição. Sem isto, o builder está em modo criação.
export interface RouteToEdit {
  id: string;
  name: string;
  shift: Shift;
  pickup: string[];
  dropoff: string[];
  weekdays: number[];
}

const SHIFT_LABEL: Record<Shift, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  integral: "Integral",
};

// Dias da semana em ISO dow (1=Seg … 7=Dom), na ordem visual Seg→Dom. Abreviação
// de 3 letras de propósito: a inicial única repetiria "S" em Seg/Sex/Sáb.
const WEEKDAYS: { dow: number; label: string }[] = [
  { dow: 1, label: "Seg" },
  { dow: 2, label: "Ter" },
  { dow: 3, label: "Qua" },
  { dow: 4, label: "Qui" },
  { dow: 5, label: "Sex" },
  { dow: 6, label: "Sáb" },
  { dow: 7, label: "Dom" },
];

// Default do transporte escolar: Seg–Sex (espelha o backfill da migration 029).
const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];

const initial: RouteFormState = { error: null };

export function RouteBuilder({
  students,
  route,
}: {
  students: Student[];
  route?: RouteToEdit;
}) {
  const editing = !!route;
  const [state, action, pending] = useActionState(
    editing ? updateRoute : createRoute,
    initial,
  );
  const [name, setName] = useState(route?.name ?? "");
  const [shift, setShift] = useState<Shift | "">(route?.shift ?? "");
  const [pickup, setPickup] = useState<string[]>(route?.pickup ?? []);
  const [dropoff, setDropoff] = useState<string[]>(route?.dropoff ?? []);
  // Dias em que a rota roda (recorrência R2). Criação nasce Seg–Sex; edição
  // hidrata do banco. Vazio é válido (rota que só roda em dia 'extra').
  const [weekdays, setWeekdays] = useState<number[]>(
    route?.weekdays ?? DEFAULT_WEEKDAYS,
  );
  // Na edição a volta veio do banco (não é proposta), então já nasce "tocada".
  const [voltaTouched, setVoltaTouched] = useState(editing);

  function toggleDay(dow: number) {
    setWeekdays((prev) =>
      prev.includes(dow)
        ? prev.filter((d) => d !== dow)
        : [...prev, dow].sort((a, b) => a - b),
    );
  }

  const byId = new Map(students.map((s) => [s.id, s]));

  // Pool do turno escolhido: alunos do turno + integrais (req 2).
  const pool = shift
    ? students.filter((s) => s.shift === shift || s.shift === "integral")
    : [];

  // Trocar de turno reinicia as listas (evita aluno de outro turno preso nelas).
  // Mas NÃO na hidratação inicial — senão apagaria as listas carregadas na
  // edição. Só dispara em troca real do usuário (a partir do 2º render).
  const shiftHydrated = useRef(false);
  useEffect(() => {
    if (!shiftHydrated.current) {
      shiftHydrated.current = true;
      return;
    }
    setPickup([]);
    setDropoff([]);
    setVoltaTouched(false);
  }, [shift]);

  // Proposta: volta = ida invertida, até o motorista mexer na volta (req 3).
  useEffect(() => {
    if (!voltaTouched) setDropoff([...pickup].reverse());
  }, [pickup, voltaTouched]);

  function touchVolta(next: string[]) {
    setVoltaTouched(true);
    setDropoff(next);
  }

  function reseedVolta() {
    setVoltaTouched(false);
    setDropoff([...pickup].reverse());
  }

  return (
    <form action={action} className="space-y-6">
      {editing && <input type="hidden" name="route_id" value={route!.id} />}
      <input type="hidden" name="pickup_ids" value={JSON.stringify(pickup)} />
      <input type="hidden" name="dropoff_ids" value={JSON.stringify(dropoff)} />
      <input type="hidden" name="weekdays" value={JSON.stringify(weekdays)} />
      <input type="hidden" name="shift" value={shift} />

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-navy-800">
          Nome da rota
        </span>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Turma Manhã"
          className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3 outline-none focus:border-navy-700 focus:ring-2 focus:ring-yellow-400/40"
        />
      </label>

      <div>
        <span className="mb-1 block text-sm font-medium text-navy-800">Turno</span>
        <div className="grid grid-cols-3 gap-2">
          {(["morning", "afternoon", "integral"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setShift(s)}
              className={`rounded-xl border py-2.5 text-sm font-semibold ${
                shift === s
                  ? "border-navy-900 bg-navy-900/[0.04] text-navy-900 ring-2 ring-yellow-400/40"
                  : "border-navy-900/15 text-navy-700/70"
              }`}
            >
              {SHIFT_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium text-navy-800">
          Dias da semana
        </span>
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map(({ dow, label }) => {
            const on = weekdays.includes(dow);
            return (
              <button
                key={dow}
                type="button"
                onClick={() => toggleDay(dow)}
                aria-pressed={on}
                className={`rounded-lg border py-2 text-xs font-semibold ${
                  on
                    ? "border-navy-900 bg-navy-900/[0.04] text-navy-900 ring-2 ring-yellow-400/40"
                    : "border-navy-900/15 text-navy-700/60"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {weekdays.length === 0 && (
          <p className="mt-1.5 text-xs text-navy-700/50">
            Sem dias fixos: a rota não aparece na home, mas você pode iniciá-la
            num dia extra em Rotas.
          </p>
        )}
      </div>

      {!shift ? (
        <p className="rounded-xl border border-dashed border-navy-900/15 p-3 text-sm text-navy-700/60">
          Escolha o turno para ver os alunos que fazem parte dele.
        </p>
      ) : pool.length === 0 ? (
        <p className="rounded-xl border border-dashed border-navy-900/15 p-3 text-sm text-navy-700/60">
          Nenhum aluno ativo neste turno. Cadastre alunos ou aprove cadastros da
          captação primeiro.
        </p>
      ) : (
        <>
          <Leg
            title="Ida (embarque)"
            emptyHint="Adicione quem a van pega de manhã."
            ordered={pickup}
            pool={pool}
            byId={byId}
            onChange={setPickup}
          />
          <Leg
            title="Volta (desembarque)"
            emptyHint="Proposta: a ida invertida. Ajuste quem só vai / só volta."
            ordered={dropoff}
            pool={pool}
            byId={byId}
            onChange={touchVolta}
            headerAction={
              pickup.length > 0 ? (
                <button
                  type="button"
                  onClick={reseedVolta}
                  className="flex items-center gap-1 text-xs font-medium text-navy-700/60"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Usar ida invertida
                </button>
              ) : null
            }
          />
        </>
      )}

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
        {pending ? "Salvando…" : editing ? "Salvar alterações" : "Salvar rota"}
      </button>
    </form>
  );
}

function Leg({
  title,
  emptyHint,
  ordered,
  pool,
  byId,
  onChange,
  headerAction,
}: {
  title: string;
  emptyHint: string;
  ordered: string[];
  pool: Student[];
  byId: Map<string, Student>;
  onChange: (next: string[]) => void;
  headerAction?: React.ReactNode;
}) {
  const unselected = pool.filter((s) => !ordered.includes(s.id));

  function move(idx: number, dir: -1 | 1) {
    const next = [...ordered];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  }

  return (
    <div className="rounded-2xl border border-navy-900/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-navy-900">{title}</span>
        {headerAction}
      </div>

      {ordered.length === 0 ? (
        <p className="mb-2 text-xs text-navy-700/50">{emptyHint}</p>
      ) : (
        <div className="mb-2 space-y-2">
          {ordered.map((id, idx) => {
            const s = byId.get(id);
            if (!s) return null;
            return (
              <div
                key={id}
                className="flex items-center gap-2 rounded-xl border border-navy-900/10 bg-white px-3 py-2"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-yellow-400 text-xs font-bold text-navy-900">
                  {idx + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-navy-900">
                  {s.full_name}
                </span>
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="p-1 text-navy-700/60 disabled:opacity-30"
                  aria-label="Subir"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === ordered.length - 1}
                  className="p-1 text-navy-700/60 disabled:opacity-30"
                  aria-label="Descer"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onChange(ordered.filter((x) => x !== id))}
                  className="p-1 text-red-600"
                  aria-label="Remover"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {unselected.length > 0 && (
        <div className="space-y-2">
          {unselected.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange([...ordered, s.id])}
              className="flex w-full items-center justify-between rounded-xl border border-navy-900/10 bg-white px-3 py-2 text-left"
            >
              <span>
                <span className="block text-sm font-medium text-navy-900">
                  {s.full_name}
                </span>
                {s.school && (
                  <span className="block text-xs text-navy-700/50">{s.school}</span>
                )}
              </span>
              <Plus className="h-4 w-4 text-navy-700/40" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
