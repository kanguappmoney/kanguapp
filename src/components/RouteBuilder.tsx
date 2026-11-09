"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown, X, Plus, RotateCcw, Wand2, Info } from "lucide-react";
import {
  createRoute,
  updateRoute,
  type RouteFormState,
} from "@/lib/actions/routes";
import {
  nearestNeighborOrder,
  optimizeViaMapbox,
  MAX_OPT_WAYPOINTS,
  type Stop,
} from "@/lib/route-optimize";
import type { GeoPoint } from "@/lib/geo";

interface Student {
  id: string;
  full_name: string;
  school: string | null;
  shift: "morning" | "afternoon" | "integral" | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  school_lat: number | null;
  school_lng: number | null;
}

type Shift = "morning" | "afternoon" | "integral";

// Rota carregada do banco para edição. Sem isto, o builder está em modo criação.
export interface RouteToEdit {
  id: string;
  name: string;
  shift: Shift | ""; // rota antiga pode não ter turno: o motorista escolhe ao editar
  legacy?: boolean; // rota antiga de uma perna: ao salvar vira "ida e volta"
  pickup: string[];
  dropoff: string[];
  weekdays: number[];
  pickupTargetTime: string; // "HH:MM" ou "" (âncora da sugestão de saída)
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
  // Horário-alvo de começar a pegar (perna de ida). Ancora a sugestão de "saia
  // até HH:MM" na home. Opcional — vazio = sem sugestão.
  const [pickupTargetTime, setPickupTargetTime] = useState(
    route?.pickupTargetTime ?? "",
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
  // Também NÃO zera quando o turno estava vazio (rota antiga sem turno): a 1ª escolha de turno preserva as
  // listas que a rota já tem.
  const prevShift = useRef<Shift | "">(route?.shift ?? "");
  useEffect(() => {
    const prev = prevShift.current;
    prevShift.current = shift;
    if (prev === "" || prev === shift) return;
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

  const field =
    "w-full rounded-xl border border-white/20 bg-white px-3 py-3 text-navy-900 outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/40";

  return (
    <form action={action} className="space-y-4">
      {editing && <input type="hidden" name="route_id" value={route!.id} />}
      <input type="hidden" name="pickup_ids" value={JSON.stringify(pickup)} />
      <input type="hidden" name="dropoff_ids" value={JSON.stringify(dropoff)} />
      <input type="hidden" name="weekdays" value={JSON.stringify(weekdays)} />
      <input type="hidden" name="pickup_target_time" value={pickupTargetTime} />
      <input type="hidden" name="shift" value={shift} />

      {route?.legacy && (
        <div className="flex items-start gap-2 rounded-2xl bg-cream px-4 py-3 text-sm text-navy-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Esta é uma rota antiga de uma perna só. Ao salvar, ela passa a ser de <b>ida e volta</b>: escolha o turno e
            confira as duas listas abaixo.
          </span>
        </div>
      )}

      {/* 1 · Dados da rota — azul-marinho (identificação principal) */}
      <section className="space-y-4 rounded-2xl bg-navy-900 p-4 text-white">
        <SectionHead n={1} title="Dados da rota" onDark />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-white/80">Nome da rota</span>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Turma Manhã"
            className={field}
          />
        </label>
        <div>
          <span className="mb-1 block text-sm font-medium text-white/80">Turno</span>
          <div className="grid grid-cols-3 gap-2">
            {(["morning", "afternoon", "integral"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setShift(s)}
                aria-pressed={shift === s}
                className={`rounded-xl border py-2.5 text-sm font-semibold ${
                  shift === s
                    ? "border-yellow-400 bg-yellow-400 text-navy-900"
                    : "border-white/20 bg-white/10 text-white/80"
                }`}
              >
                {SHIFT_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 2 · Quando roda — creme (agenda) */}
      <section className="space-y-4 rounded-2xl bg-cream p-4">
        <SectionHead n={2} title="Quando roda" />
        <div>
          <span className="mb-1 block text-sm font-medium text-navy-800">Dias da semana</span>
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
                      ? "border-navy-900 bg-navy-900 text-white"
                      : "border-navy-900/15 bg-white text-navy-700/60"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {weekdays.length === 0 && (
            <p className="mt-1.5 text-xs text-navy-700/60">
              Sem dias fixos: a rota não aparece na home, mas você pode iniciá-la num dia extra em Rotas.
            </p>
          )}
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-navy-800">
            Horário de começar a pegar <span className="text-navy-700/50">(opcional)</span>
          </span>
          <input
            type="time"
            value={pickupTargetTime}
            onChange={(e) => setPickupTargetTime(e.target.value)}
            className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3 outline-none focus:border-navy-700 focus:ring-2 focus:ring-yellow-400/40"
          />
          <span className="mt-1 block text-xs text-navy-700/60">
            A home sugere a que horas você deve sair de casa para não atrasar o 1º aluno. Sem isto, a sugestão não
            aparece.
          </span>
        </label>
      </section>

      {!shift ? (
        <p className="rounded-2xl border border-dashed border-navy-900/20 p-4 text-sm text-navy-700/70">
          Escolha o turno para ver os alunos que fazem parte dele.
        </p>
      ) : pool.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-navy-900/20 p-4 text-sm text-navy-700/70">
          Nenhum aluno ativo neste turno. Cadastre alunos ou aprove cadastros da captação primeiro.
        </p>
      ) : (
        <>
          {/* 3 · Ida — azul-marinho */}
          <Leg
            n={3}
            tone="navy"
            title="Ida (embarque)"
            emptyHint="Adicione quem a van pega de manhã."
            ordered={pickup}
            pool={pool}
            byId={byId}
            onChange={setPickup}
            legKind="pickup"
          />
          {/* 4 · Volta — creme */}
          <Leg
            n={4}
            tone="cream"
            title="Volta (desembarque)"
            emptyHint="Proposta: a ida invertida. Ajuste quem só vai / só volta."
            ordered={dropoff}
            pool={pool}
            byId={byId}
            onChange={touchVolta}
            legKind="dropoff"
            headerAction={
              pickup.length > 0 ? (
                <button
                  type="button"
                  onClick={reseedVolta}
                  className="flex items-center gap-1 text-xs font-medium text-navy-700/70"
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
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
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

// Cabeçalho de seção: número em círculo + título (amarelo sobre azul-marinho, navy sobre creme).
function SectionHead({ n, title, onDark = false }: { n: number; title: string; onDark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          onDark ? "bg-yellow-400 text-navy-900" : "bg-navy-900 text-yellow-400"
        }`}
      >
        {n}
      </span>
      <h2
        className={`text-sm font-bold uppercase tracking-wide ${onDark ? "text-yellow-400" : "text-navy-900"}`}
      >
        {title}
      </h2>
    </div>
  );
}

// Coordenada da criança para esta perna (embarque usa pickup, desembarque dropoff).
function legPoint(s: Student, legKind: "pickup" | "dropoff"): GeoPoint | null {
  const lat = legKind === "pickup" ? s.pickup_lat : s.dropoff_lat;
  const lng = legKind === "pickup" ? s.pickup_lng : s.dropoff_lng;
  return lat != null && lng != null ? { lat, lng } : null;
}

// Âncora = a escola, SÓ quando toda a turma vai pra mesma (coordenadas iguais).
// Escolas diferentes → null (TSP aberto, com aviso). Arredonda p/ tolerar ruído.
function sharedSchoolAnchor(students: Student[]): GeoPoint | null {
  const pts = students.map((s) =>
    s.school_lat != null && s.school_lng != null
      ? { lat: s.school_lat, lng: s.school_lng }
      : null,
  );
  if (pts.some((p) => p === null)) return null;
  const key = (p: GeoPoint) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
  const first = pts[0] as GeoPoint;
  return pts.every((p) => key(p as GeoPoint) === key(first)) ? first : null;
}

function Leg({
  n,
  tone,
  title,
  emptyHint,
  ordered,
  pool,
  byId,
  onChange,
  legKind,
  headerAction,
}: {
  n: number;
  tone: "navy" | "cream";
  title: string;
  emptyHint: string;
  ordered: string[];
  pool: Student[];
  byId: Map<string, Student>;
  onChange: (next: string[]) => void;
  legKind: "pickup" | "dropoff";
  headerAction?: React.ReactNode;
}) {
  const unselected = pool.filter((s) => !ordered.includes(s.id));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  function move(idx: number, dir: -1 | 1) {
    const next = [...ordered];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  }

  // "Sugerir ordem": reordena a lista pela sequência mais eficiente. Alunos sem
  // coordenada NUNCA somem — vão pro fim com aviso. Optimization API acima do
  // limite ou sem token/falha → cai no vizinho-mais-próximo local. MOSTRA, nunca
  // impõe: só reordena o array editável; persiste apenas ao Salvar.
  async function suggest() {
    setBusy(true);
    setNote(null);
    try {
      const withCoord: Stop[] = [];
      const without: string[] = [];
      for (const id of ordered) {
        const s = byId.get(id);
        const p = s ? legPoint(s, legKind) : null;
        if (s && p) withCoord.push({ id, point: p });
        else without.push(id);
      }

      if (withCoord.length < 2) {
        setNote("Poucos alunos com localização para sugerir uma ordem.");
        return;
      }

      const students = withCoord.map((w) => byId.get(w.id)!) as Student[];
      const anchor = sharedSchoolAnchor(students);
      const anchorRole = legKind === "pickup" ? "end" : "start"; // ida termina / volta começa na escola
      const capacity = anchor ? MAX_OPT_WAYPOINTS - 1 : MAX_OPT_WAYPOINTS;
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

      const notes: string[] = [];
      let orderIds: string[] | null = null;

      // Optimization API só até o limite de waypoints; acima, fallback direto.
      if (token && withCoord.length <= capacity) {
        orderIds = await optimizeViaMapbox(withCoord, anchor, anchorRole, token);
        if (!orderIds) notes.push("usei a estimativa local (Mapbox indisponível)");
      } else if (withCoord.length > capacity) {
        notes.push(`muitas paradas (>${capacity}), usei a estimativa local`);
      }

      // Fallback local (sem token, acima do limite, ou API falhou).
      if (!orderIds) orderIds = nearestNeighborOrder(withCoord, anchor);

      if (!anchor) notes.push("escolas diferentes: ordem sem âncora na escola");
      if (without.length)
        notes.push(
          `${without.length} sem localização ${without.length === 1 ? "foi" : "foram"} pro fim`,
        );

      onChange([...orderIds, ...without]);
      setNote(notes.length ? `Ordem sugerida — ${notes.join("; ")}.` : "Ordem sugerida.");
    } finally {
      setBusy(false);
    }
  }

  const dark = tone === "navy";
  const wand = dark ? "text-white/80" : "text-navy-700/70";

  return (
    <section className={`rounded-2xl p-4 ${dark ? "bg-navy-900 text-white" : "bg-cream"}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <SectionHead n={n} title={title} onDark={dark} />
        <div className="flex items-center gap-3">
          {headerAction}
          {ordered.length >= 2 && (
            <button
              type="button"
              onClick={suggest}
              disabled={busy}
              className={`flex items-center gap-1 text-xs font-medium disabled:opacity-50 ${wand}`}
            >
              <Wand2 className="h-3.5 w-3.5" />
              {busy ? "Sugerindo…" : "Sugerir ordem"}
            </button>
          )}
        </div>
      </div>

      {note && (
        <p className={`mb-2 rounded-lg px-2.5 py-1.5 text-xs ${dark ? "bg-white/10 text-white/90" : "bg-white text-navy-800"}`}>
          {note}
        </p>
      )}

      {ordered.length === 0 ? (
        <p className={`mb-2 text-xs ${dark ? "text-white/60" : "text-navy-700/60"}`}>{emptyHint}</p>
      ) : (
        <div className="mb-3 space-y-2">
          {ordered.map((id, idx) => {
            const s = byId.get(id);
            if (!s) return null;
            return (
              <div key={id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    dark ? "bg-yellow-400 text-navy-900" : "bg-navy-900 text-yellow-400"
                  }`}
                >
                  {idx + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-navy-900">{s.full_name}</span>
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
        <>
          <p className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${dark ? "text-white/60" : "text-navy-700/60"}`}>
            Adicionar à {legKind === "pickup" ? "ida" : "volta"}
          </p>
          <div className="space-y-2">
            {unselected.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange([...ordered, s.id])}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left ${
                  dark ? "border-white/15 bg-white/10" : "border-navy-900/10 bg-white/60"
                }`}
              >
                <span>
                  <span className={`block text-sm font-medium ${dark ? "text-white" : "text-navy-900"}`}>
                    {s.full_name}
                  </span>
                  {s.school && (
                    <span className={`block text-xs ${dark ? "text-white/60" : "text-navy-700/60"}`}>{s.school}</span>
                  )}
                </span>
                <Plus className={`h-4 w-4 ${dark ? "text-yellow-400" : "text-navy-900"}`} />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
