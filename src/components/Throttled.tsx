import { TriangleAlert } from "lucide-react";

// Resposta quando o limite de requisições por IP da vitrine pública é atingido.
export function Throttled({ seconds }: { seconds: number }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
      <TriangleAlert className="h-8 w-8 text-navy-900" aria-hidden />
      <h1 className="mt-3 font-display text-lg text-navy-900">Muitas buscas em pouco tempo</h1>
      <p className="mt-1 text-sm text-navy-700/70">
        Aguarde cerca de {seconds} {seconds === 1 ? "segundo" : "segundos"} e tente de novo.
      </p>
    </main>
  );
}
