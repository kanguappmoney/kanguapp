"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteRoute, type DeleteRouteState } from "@/lib/actions/routes";

const initial: DeleteRouteState = { error: null };

// "Apagar rota" com confirmação: zona de perigo separada do formulário. Avisa o que sai junto (paradas,
// exceções e o histórico de viagens da rota); alunos, faturas e ausências não são apagados.
export function DeleteRouteButton({
  routeId,
  routeName,
  tripCount,
}: {
  routeId: string;
  routeName: string;
  tripCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteRoute, initial);

  return (
    <section className="rounded-2xl border border-red-200 bg-red-50/60 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-red-800">Zona de perigo</h2>
      {!open ? (
        <>
          <p className="mt-1 text-sm text-red-900/70">Apague esta rota se ela não existe mais.</p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-300 bg-white py-3 font-semibold text-red-700"
          >
            <Trash2 className="h-4 w-4" /> Apagar rota
          </button>
        </>
      ) : (
        <form action={action} className="mt-2 space-y-3">
          <input type="hidden" name="route_id" value={routeId} />
          <p className="text-sm text-red-900">
            Apagar <b>{routeName}</b>? Isso remove a rota, as paradas e as exceções
            {tripCount > 0
              ? `, além de ${tripCount} ${tripCount === 1 ? "viagem" : "viagens"} do histórico dela`
              : ""}
            . Alunos, faturas e ausências continuam. Não dá para desfazer.
          </p>
          {state.error && (
            <p className="rounded-lg bg-white px-3 py-2 text-sm text-red-700">{state.error}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-xl border border-navy-900/15 bg-white py-3 font-semibold text-navy-900"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Apagando…" : "Apagar de vez"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
