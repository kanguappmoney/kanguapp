"use client";

import { useState, useTransition } from "react";
import { setOpenRequests } from "@/lib/actions/capture";

// "Receber pedidos pela vitrine" (Frente E.1): liga/desliga o link de captação GENÉRICO
// que o botão "Solicitar vaga" do perfil público usa. Desligado por padrão.
export function OpenRequestsToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setOn(next); // otimista; volta se o servidor recusar
    setError(null);
    startTransition(async () => {
      const res = await setOpenRequests(next);
      if (res.error) {
        setOn(!next);
        setError(res.error);
      }
    });
  }

  return (
    <div className="mt-3">
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-yellow-400/40 bg-cream p-4">
        <span>
          <span className="block text-sm font-semibold text-navy-900">
            Receber pedidos pela vitrine
          </span>
          <span className="block text-xs text-navy-700/60">
            {on
              ? "Ligado: seu perfil mostra “Solicitar vaga”. Cada pedido cai em Cadastros a aprovar."
              : "Desligado: seu perfil mostra só o WhatsApp."}
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={on}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
          aria-label="Receber pedidos pela vitrine"
          className="relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-navy-900/20 transition-colors checked:bg-yellow-400 disabled:opacity-60 before:absolute before:left-0.5 before:top-0.5 before:h-5 before:w-5 before:rounded-full before:bg-white before:shadow before:transition-transform checked:before:translate-x-5"
        />
      </label>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
