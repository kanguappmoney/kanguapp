"use client";

import { useState, useTransition } from "react";
import { setStopState, endRoute } from "@/lib/actions/drive";

type StopState = "pending" | "boarded" | "absent";

export interface DriveStop {
  studentId: string;
  position: number;
  name: string;
  address: string | null;
  state: StopState;
}

export function DriveScreen({
  executionId,
  routeName,
  kind,
  stops: initial,
}: {
  executionId: string;
  routeName: string;
  kind: "pickup" | "dropoff";
  stops: DriveStop[];
}) {
  const [stops, setStops] = useState(initial);
  const [, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const boardVerb = kind === "pickup" ? "Embarcou" : "Desembarcou";
  const doneCount = stops.filter((s) => s.state !== "pending").length;
  const allHandled = doneCount === stops.length;

  function set(studentId: string, state: StopState) {
    setStops((prev) =>
      prev.map((s) => (s.studentId === studentId ? { ...s, state } : s)),
    );
    startTransition(() => setStopState(executionId, studentId, state, kind));
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-navy-900 px-4 pb-4 pt-6 text-white">
        <p className="text-sm text-white/60">Modo direção</p>
        <h1 className="text-lg font-bold">{routeName}</h1>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-white/70">
            <span>
              {doneCount} de {stops.length} paradas
            </span>
            <span>{Math.round((doneCount / (stops.length || 1)) * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/15">
            <div
              className="h-2 rounded-full bg-yellow-400 transition-all"
              style={{ width: `${(doneCount / (stops.length || 1)) * 100}%` }}
            />
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-3 px-4 py-4">
        {stops.map((s) => (
          <div
            key={s.studentId}
            className={`rounded-2xl border p-4 ${
              s.state === "boarded"
                ? "border-green-200 bg-green-50"
                : s.state === "absent"
                  ? "border-amber-200 bg-amber-50"
                  : "border-navy-900/10 bg-white"
            }`}
          >
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-yellow-400">
                {s.position}
              </span>
              <div className="flex-1">
                <p className="font-semibold text-navy-900">{s.name}</p>
                {s.address && (
                  <p className="text-xs text-navy-700/60">{s.address}</p>
                )}
              </div>
              {s.state === "boarded" && <span className="text-green-700">✓</span>}
              {s.state === "absent" && (
                <span className="text-xs font-medium text-amber-700">
                  Ausente
                </span>
              )}
            </div>

            {s.state === "pending" ? (
              <div className="flex gap-2">
                <button
                  onClick={() => set(s.studentId, "boarded")}
                  className="flex-1 rounded-xl bg-navy-900 py-2.5 font-semibold text-yellow-400"
                >
                  {boardVerb}
                </button>
                <button
                  onClick={() => set(s.studentId, "absent")}
                  className="rounded-xl border border-navy-900/15 px-4 py-2.5 text-sm font-medium text-navy-700/70"
                >
                  Ausente
                </button>
              </div>
            ) : (
              <button
                onClick={() => set(s.studentId, "pending")}
                className="w-full rounded-xl border border-navy-900/10 py-2 text-sm font-medium text-navy-700/60"
              >
                Desfazer
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="sticky bottom-0 border-t border-navy-900/10 bg-white p-4">
        <button
          onClick={() => setConfirming(true)}
          className="w-full rounded-xl bg-navy-900 py-3 font-semibold text-yellow-400"
        >
          Encerrar rota
        </button>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-20 flex items-end bg-black/40">
          <div className="w-full rounded-t-3xl bg-white p-5">
            <h2 className="text-lg font-bold text-navy-900">Encerrar rota</h2>
            <p className="mt-2 text-sm text-navy-700/70">
              Confirme com uma olhada na van: <b>nenhum aluno ficou a bordo</b>.
            </p>
            {!allHandled && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Atenção: {stops.length - doneCount}{" "}
                {stops.length - doneCount === 1
                  ? "parada ainda não foi marcada"
                  : "paradas ainda não foram marcadas"}
                .
              </p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-xl border border-navy-900/15 py-3 font-semibold text-navy-900"
              >
                Voltar
              </button>
              <form action={() => endRoute(executionId)} className="flex-1">
                <button className="w-full rounded-xl bg-navy-900 py-3 font-semibold text-yellow-400">
                  Confirmar e encerrar
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
