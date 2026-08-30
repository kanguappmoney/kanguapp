"use client";

import { useState, useTransition } from "react";
import { TriangleAlert, Clock, Wrench, Bus, CircleCheck } from "lucide-react";
import {
  registerOccurrence,
  type OccurrenceType,
} from "@/lib/actions/occurrences";

const TYPES: { value: OccurrenceType; label: string; icon: typeof Clock }[] = [
  { value: "traffic", label: "Trânsito", icon: TriangleAlert },
  { value: "delay", label: "Atraso", icon: Clock },
  { value: "breakdown", label: "Pane", icon: Wrench },
  { value: "vehicle_change", label: "Troca de veículo", icon: Bus },
];

export function OccurrenceSheet({ executionId }: { executionId: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<OccurrenceType | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    setType(null);
    setNote("");
    setError(null);
    setDone(false);
  }

  function submit() {
    if (!type) return setError("Escolha o tipo de ocorrência.");
    setError(null);
    startTransition(async () => {
      const res = await registerOccurrence(executionId, type, note);
      if (res.error) setError(res.error);
      else setDone(true);
    });
  }

  return (
    <>
      <button
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="w-full rounded-xl border border-navy-900/15 py-2.5 text-sm font-semibold text-navy-900"
      >
        Registrar ocorrência
      </button>

      {open && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/40">
          <div className="w-full rounded-t-3xl bg-white p-5">
            {done ? (
              <div className="py-4 text-center">
                <CircleCheck className="mx-auto h-10 w-10 text-green-600" />
                <p className="mt-2 font-semibold text-navy-900">
                  Ocorrência registrada
                </p>
                <p className="text-sm text-navy-700/60">
                  As famílias da rota foram avisadas.
                </p>
                <button
                  onClick={() => setOpen(false)}
                  className="mt-4 w-full rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-bold text-navy-900">
                  Registrar ocorrência
                </h2>
                <p className="mb-3 text-sm text-navy-700/60">
                  As famílias da rota recebem um aviso.
                </p>

                <div className="grid grid-cols-2 gap-2">
                  {TYPES.map((t) => {
                    const Icon = t.icon;
                    const active = type === t.value;
                    return (
                      <button
                        key={t.value}
                        onClick={() => setType(t.value)}
                        className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm font-semibold ${
                          active
                            ? "border-navy-900 bg-navy-900/[0.04] text-navy-900 ring-2 ring-yellow-400/40"
                            : "border-navy-900/15 text-navy-700/70"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Observação (opcional) — só para seu registro"
                  rows={2}
                  className="mt-3 w-full rounded-xl border border-navy-900/15 bg-white px-3 py-2 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-yellow-400/40"
                />

                {error && (
                  <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </p>
                )}

                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-xl border border-navy-900/15 py-3 font-semibold text-navy-900"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={submit}
                    disabled={pending}
                    className="flex-1 rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900 disabled:opacity-60"
                  >
                    {pending ? "Enviando…" : "Notificar famílias"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
