// Espelho em JS de route_runs_on(route, date) do banco (migration 029). O banco
// é a fonte de verdade (SQL/testes o consomem); aqui é filtro de APRESENTAÇÃO —
// a home decide o que MOSTRAR em "Rota de hoje", nunca o que bloquear (a
// recorrência mostra, nunca trava — herda do 100m). Puro de propósito: sem I/O,
// pra ser testado com os MESMOS vetores de docs/tests/recorrencia.sql e assim
// virar alarme se JS e SQL divergirem.

export type ExceptionKind = "skip" | "extra";

// Mesmas 3 ramificações do SQL, na mesma ordem de precedência: a exceção do dia
// manda sobre a regra — 'extra' força rodar, 'skip' força não rodar; sem exceção,
// cai no dia-da-semana (isoDow ∈ weekdays).
export function routeRunsToday(
  weekdays: number[] | null | undefined,
  todayException: ExceptionKind | null,
  isoDow: number,
): boolean {
  if (todayException === "extra") return true;
  if (todayException === "skip") return false;
  return (weekdays ?? []).includes(isoDow);
}
