"use client";

import { useEffect, useState } from "react";
import { isStaleBuildError, shouldAutoReload } from "@/lib/stale-build";

// Tela de erro do app (no lugar do "Application error" genérico do Next): explica em português, oferece
// "Tentar de novo" e mostra a mensagem técnica em letra pequena para facilitar o diagnóstico por print.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Versão do app trocada durante o uso (deploy novo): recarrega sozinho UMA vez para baixar a versão atual.
  const stale = isStaleBuildError(error.message);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    console.error(error);
    if (!stale) return;
    try {
      const last = Number(sessionStorage.getItem("kangu:stale-reload") ?? "") || null;
      if (shouldAutoReload(last, Date.now())) {
        sessionStorage.setItem("kangu:stale-reload", String(Date.now()));
        setReloading(true);
        window.location.reload();
      }
    } catch {
      // sem sessionStorage: cai na tela com o botão manual
    }
  }, [error, stale]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 text-center">
      <h1 className="text-xl font-bold text-navy-900">
        {stale ? "Nova versão do app" : "Algo deu errado"}
      </h1>
      <p className="mt-2 max-w-xs text-sm text-navy-700/70">
        {stale
          ? reloading
            ? "Atualizando para a versão mais recente…"
            : "O app foi atualizado enquanto você usava. Toque em \"Atualizar\" para continuar."
          : "Não foi possível abrir esta tela. Toque em \"Tentar de novo\". Se continuar, envie um print desta tela ao suporte."}
      </p>
      <button
        type="button"
        onClick={stale ? () => window.location.reload() : reset}
        className="mt-5 rounded-xl bg-yellow-400 px-6 py-3 font-semibold text-navy-900"
      >
        {stale ? "Atualizar" : "Tentar de novo"}
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
