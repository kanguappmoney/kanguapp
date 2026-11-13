"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { reopenRoute } from "@/lib/actions/drive";
import { PendingSubmit } from "@/components/PendingSubmit";

// "Reabrir rota": desfaz um encerramento acidental (mesmo dia). Pede confirmação antes.
export function ReopenRouteButton({ executionId, label }: { executionId: string; label?: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-navy-900/15 py-2 text-sm font-semibold text-navy-900"
      >
        <RotateCcw className="h-4 w-4" />
        Reabrir {label ?? "rota"}
      </button>
    );
  }

  // Confirmação em folha (largura total): a perna ocupa só meia coluna, então um aviso inline ficava espremido.
  return (
    <>
      <button
        type="button"
        disabled
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-navy-900/15 py-2 text-sm font-semibold text-navy-900 opacity-60"
      >
        <RotateCcw className="h-4 w-4" />
        Reabrir {label ?? "rota"}
      </button>
      <div className="fixed inset-0 z-50 flex items-end bg-black/40" role="dialog" aria-modal="true">
        <div className="mx-auto w-full max-w-md rounded-t-3xl bg-white p-5">
          <h2 className="text-lg font-bold text-navy-900">Reabrir {label ?? "rota"}</h2>
          <p className="mt-2 text-sm text-navy-700/70">
            Os embarques já registrados continuam. Você volta ao Modo Direção de onde parou.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-xl border border-navy-900/15 py-3 font-semibold text-navy-900"
            >
              Voltar
            </button>
            <form action={reopenRoute.bind(null, executionId)} className="flex-1">
              <PendingSubmit
                pendingLabel="Reabrindo…"
                className="w-full rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900"
              >
                Reabrir
              </PendingSubmit>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
