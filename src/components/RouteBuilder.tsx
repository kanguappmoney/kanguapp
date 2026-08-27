"use client";

import { useActionState, useState } from "react";
import { createRoute, type RouteFormState } from "@/lib/actions/routes";

interface Student {
  id: string;
  full_name: string;
  school: string | null;
}

const initial: RouteFormState = { error: null };

export function RouteBuilder({ students }: { students: Student[] }) {
  const [state, action, pending] = useActionState(createRoute, initial);
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<"outbound" | "inbound">("outbound");
  // Ordem = ordem de seleção. Alunos selecionados, na sequência de embarque.
  const [ordered, setOrdered] = useState<string[]>([]);

  const byId = new Map(students.map((s) => [s.id, s]));

  function toggle(id: string) {
    setOrdered((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function move(idx: number, dir: -1 | 1) {
    setOrdered((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  const unselected = students.filter((s) => !ordered.includes(s.id));

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="student_ids" value={JSON.stringify(ordered)} />
      <input type="hidden" name="direction" value={direction} />

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-navy-800">
          Nome da rota
        </span>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Turma Manhã — Ida"
          className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3 outline-none focus:border-navy-700 focus:ring-2 focus:ring-yellow-400/40"
        />
      </label>

      <div>
        <span className="mb-1 block text-sm font-medium text-navy-800">
          Sentido
        </span>
        <div className="grid grid-cols-2 gap-2">
          {(["outbound", "inbound"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className={`rounded-xl border py-2.5 text-sm font-semibold ${
                direction === d
                  ? "border-navy-900 bg-navy-900/[0.04] text-navy-900 ring-2 ring-yellow-400/40"
                  : "border-navy-900/15 text-navy-700/70"
              }`}
            >
              {d === "outbound" ? "Ida (embarque)" : "Volta (desembarque)"}
            </button>
          ))}
        </div>
      </div>

      {ordered.length > 0 && (
        <div>
          <span className="mb-1 block text-sm font-medium text-navy-800">
            Ordem das paradas
          </span>
          <div className="space-y-2">
            {ordered.map((id, idx) => {
              const s = byId.get(id)!;
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
                    className="px-1.5 text-navy-700/60 disabled:opacity-30"
                    disabled={idx === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, 1)}
                    className="px-1.5 text-navy-700/60 disabled:opacity-30"
                    disabled={idx === ordered.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    className="px-1.5 text-red-600"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <span className="mb-1 block text-sm font-medium text-navy-800">
          {ordered.length ? "Adicionar mais alunos" : "Selecione os alunos"}
        </span>
        {students.length === 0 ? (
          <p className="rounded-xl border border-dashed border-navy-900/15 p-3 text-sm text-navy-700/60">
            Cadastre alunos antes de montar a rota.
          </p>
        ) : (
          <div className="space-y-2">
            {unselected.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                className="flex w-full items-center justify-between rounded-xl border border-navy-900/10 bg-white px-3 py-2 text-left"
              >
                <span>
                  <span className="block text-sm font-medium text-navy-900">
                    {s.full_name}
                  </span>
                  {s.school && (
                    <span className="block text-xs text-navy-700/50">
                      {s.school}
                    </span>
                  )}
                </span>
                <span className="text-navy-700/40">＋</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-navy-900 py-3 font-semibold text-yellow-400 disabled:opacity-60"
      >
        {pending ? "Salvando…" : "Salvar rota"}
      </button>
    </form>
  );
}
