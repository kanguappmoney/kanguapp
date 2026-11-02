"use client";

import { useFormStatus } from "react-dom";

// Botão de submit que mostra o estado da server action do <form> pai: enquanto
// ela roda, troca o rótulo e desabilita (evita toque duplo). Para ações que
// gravam e depois redirecionam (ex.: "Iniciar ida"), em que o loading.tsx só
// entra após o redirect — sem isto a tela ficava parada sem nenhum sinal.
export function PendingSubmit({
  children,
  pendingLabel,
  className = "",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} disabled:opacity-70`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
