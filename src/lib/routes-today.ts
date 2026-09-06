import { createClient } from "@/lib/supabase/server";
import { saoPauloDay } from "@/lib/day";
import { routeRunsToday, type ExceptionKind } from "@/lib/recurrence";

// Fonte única das "rotas + execuções de hoje por perna". Consumida pela home
// (operar: iniciar/continuar) e pela /rotas (gerenciar). Evita duas cópias
// divergentes da mesma leitura. RLS (routes_all_owner) já recorta às rotas do
// próprio motorista — a home nunca vê rota de outro dono.

export interface RouteWithStops {
  id: string;
  name: string;
  direction: string;
  weekdays: number[] | null;
  route_stops: { kind: string }[] | null;
}

export interface TodayExec {
  id: string;
  route_id: string;
  leg: string | null;
  status: string;
}

// Chave da execução de uma perna. Legado (uma perna) usa 'single'.
export function execKey(routeId: string, leg: string | null) {
  return `${routeId}:${leg ?? "single"}`;
}

export async function getRoutesWithTodayExecs(): Promise<{
  routes: RouteWithStops[];
  execByLeg: Map<string, TodayExec>;
  // Rotas que RODAM hoje pela recorrência (route_runs_on espelhado). Só a home
  // filtra por isto; a /rotas ignora e mostra todas. NÃO inclui "tem execução
  // hoje" — a home combina os dois (rota iniciada num dia extra fica visível).
  runsTodayIds: Set<string>;
}> {
  const supabase = await createClient();

  // "Hoje" no fuso de São Paulo (uma computação): a MESMA data casa a execução
  // do dia e o dia-da-semana da recorrência — não podem divergir. (De quebra,
  // corrige o UTC latente que o match de execução tinha aqui.)
  const { date: today, isoDow } = saoPauloDay();

  const { data: routes } = await supabase
    .from("routes")
    .select("id, name, direction, weekdays, route_stops(kind)")
    .order("created_at", { ascending: false });

  const list = (routes ?? []) as RouteWithStops[];
  const routeIds = list.map((r) => r.id);

  const { data: execs } = routeIds.length
    ? await supabase
        .from("route_executions")
        .select("id, route_id, leg, status")
        .eq("service_date", today)
        .in("route_id", routeIds)
    : { data: [] as TodayExec[] };

  const execByLeg = new Map<string, TodayExec>(
    (execs ?? []).map((e) => [execKey(e.route_id, e.leg), e as TodayExec]),
  );

  // Exceções de HOJE do conjunto de rotas, numa query só (esparsas: no dia
  // comum não retorna nada). Uma exceção por (rota, data) — unique no banco.
  const { data: exceptions } = routeIds.length
    ? await supabase
        .from("route_exceptions")
        .select("route_id, kind")
        .eq("date", today)
        .in("route_id", routeIds)
    : { data: [] as { route_id: string; kind: ExceptionKind }[] };

  const exceptionByRoute = new Map<string, ExceptionKind>(
    (exceptions ?? []).map((e) => [e.route_id, e.kind as ExceptionKind]),
  );

  const runsTodayIds = new Set<string>(
    list
      .filter((r) =>
        routeRunsToday(r.weekdays, exceptionByRoute.get(r.id) ?? null, isoDow),
      )
      .map((r) => r.id),
  );

  return { routes: list, execByLeg, runsTodayIds };
}
