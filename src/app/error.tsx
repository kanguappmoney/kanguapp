"use client";

import { useEffect } from "react";

// Tela de erro do app (no lugar do "Application error" genérico do Next): explica em português, oferece
// "Tentar de novo" e mostra a mensagem técnica em letra pequena para facilitar o diagnóstico por print.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 text-center">
      <h1 className="text-xl font-bold text-navy-900">Algo deu errado</h1>
      <p className="mt-2 max-w-xs text-sm text-navy-700/70">
        Não foi possível abrir esta tela. Toque em &quot;Tentar de novo&quot;. Se continuar, envie um print desta tela
        ao suporte.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-xl bg-yellow-400 px-6 py-3 font-semibold text-navy-900"
      >
        Tentar de novo
      </button>
      <a href="/motorista" className="mt-3 text-sm font-medium text-navy-700/70 underline">
        Voltar ao início
      </a>
      <pre className="mt-6 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-navy-900/5 p-3 text-left text-[11px] leading-snug text-navy-700/70">
        {error.message || "(sem mensagem)"}
        {error.digest ? `\ndigest: ${error.digest}` : ""}
        {error.stack ? `\n${error.stack.split("\n").slice(1, 4).join("\n")}` : ""}
      </pre>
    </main>
  );
}
