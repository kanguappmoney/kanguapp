import { createClient } from "@/lib/supabase/server";

// Fonte única das "rotas + execuções de hoje por perna". Consumida pela home
// (operar: iniciar/continuar) e pela /rotas (gerenciar). Evita duas cópias
// divergentes da mesma leitura. RLS (routes_all_owner) já recorta às rotas do
// próprio motorista — a home nunca vê rota de outro dono.

export interface RouteWithStops {
  id: string;
  name: string;
  direction: string;
  route_stops: { kind: string }[] | null;
}

export interface TodayExec {
  id: string;
  route_id: string;
  leg: string | null;
  status: string;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Chave da execução de uma perna. Legado (uma perna) usa 'single'.
export function execKey(routeId: string, leg: string | null) {
  return `${routeId}:${leg ?? "single"}`;
}

export async function getRoutesWithTodayExecs(): Promise<{
  routes: RouteWithStops[];
  execByLeg: Map<string, TodayExec>;
}> {
  const supabase = await createClient();

  const { data: routes } = await supabase
    .from("routes")
    .select("id, name, direction, route_stops(kind)")
    .order("created_at", { ascending: false });

  const list = (routes ?? []) as RouteWithStops[];
  const routeIds = list.map((r) => r.id);

  const { data: execs } = routeIds.length
    ? await supabase
        .from("route_executions")
        .select("id, route_id, leg, status")
        .eq("service_date", today())
        .in("route_id", routeIds)
    : { data: [] as TodayExec[] };

  const execByLeg = new Map<string, TodayExec>(
    (execs ?? []).map((e) => [execKey(e.route_id, e.leg), e as TodayExec]),
  );

  return { routes: list, execByLeg };
}
