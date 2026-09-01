"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, Ban, Bus } from "lucide-react";
import { applyRouteReview } from "@/lib/actions/review";

interface Suspension {
  student_id: string;
  name: string;
  g1_forced: boolean;
}

export function SuspensionReview({
  routeId,
  suspensions,
}: {
  routeId: string;
  suspensions: Suspension[];
}) {
  // Sugestão inicial: pular os blocked que NÃO são G1. G1 nunca entra na lista.
  const [skip, setSkip] = useState<Set<string>>(
    () => new Set(suspensions.filter((s) => !s.g1_forced).map((s) => s.student_id)),
  );
  const [pending, start] = useTransition();

  function toggle(id: string) {
    setSkip((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirm() {
    start(() => applyRouteReview(routeId, [...skip]));
  }

  return (
    <div className="space-y-3">
      {suspensions.map((s) => {
        if (s.g1_forced) {
          return (
            <div
              key={s.student_id}
              className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4"
            >
              <ShieldCheck className="h-5 w-5 shrink-0 text-green-700" />
              <div>
                <p className="font-semibold text-navy-900">{s.name}</p>
                <p className="text-sm text-green-800">
                  Vai levar — volta de quem embarcou (G1). Inadimplência não tira
                  a volta.
                </p>
              </div>
            </div>
          );
        }
        const willSkip = skip.has(s.student_id);
        return (
          <div
            key={s.student_id}
            className={`rounded-2xl border p-4 ${
              willSkip ? "border-amber-200 bg-amber-50" : "border-navy-900/10 bg-white"
            }`}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-navy-900">{s.name}</p>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  willSkip ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"
                }`}
              >
                {willSkip ? "Vai pular" : "Vai levar"}
              </span>
            </div>
            <button
              onClick={() => toggle(s.student_id)}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold ${
                willSkip
                  ? "bg-navy-900 text-yellow-400"
                  : "border border-navy-900/15 text-navy-900"
              }`}
            >
              {willSkip ? (
                <>
                  <Bus className="h-4 w-4" /> Levar mesmo assim
                </>
              ) : (
                <>
                  <Ban className="h-4 w-4" /> Pular esta parada
                </>
              )}
            </button>
          </div>
        );
      })}

      <button
        onClick={confirm}
        disabled={pending}
        className="w-full rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900 disabled:opacity-60"
      >
        {pending ? "Iniciando…" : "Confirmar e iniciar rota"}
      </button>
    </div>
  );
}
