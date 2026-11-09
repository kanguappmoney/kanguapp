import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { saoPauloToday } from "@/lib/day";
import { RouteBuilder, type RouteToEdit } from "@/components/RouteBuilder";
import { DeleteRouteButton } from "@/components/DeleteRouteButton";
import { IconBadge } from "@/components/patterns";

export default async function EditarRotaPage({
  params,
}: {
  params: Promise<{ routeId: string }>;
}) {
  const { routeId } = await params;
  const supabase = await createClient();

  // RLS só devolve a rota do próprio motorista (routes_all_owner). Rota de outro
  // dono ou inexistente → notFound.
  const { data: route } = await supabase
    .from("routes")
    .select(
      "id, name, direction, shift, weekdays, pickup_target_time, route_stops(student_id, position, kind)",
    )
    .eq("id", routeId)
    .maybeSingle();

  if (!route) notFound();
  // Rota antiga de uma perna (outbound/inbound) também edita: a lista dela vira a ida ou a volta, e ao salvar
  // ela passa a ser "ida e volta".
  const legacy = route.direction !== "both";

  // Separa as duas listas, cada uma ordenada por sua própria numeração.
  const stops = (route.route_stops ?? []) as {
    student_id: string;
    position: number;
    kind: "pickup" | "dropoff";
  }[];
  const ordered = (kind: "pickup" | "dropoff") =>
    stops
      .filter((s) => legacy || s.kind === kind)
      .sort((a, b) => a.position - b.position)
      .map((s) => s.student_id);
  // Legada: todas as paradas formam UMA lista — a ida (outbound) ou a volta (inbound).
  const legacyIsPickup = route.direction === "outbound";

  const toEdit: RouteToEdit = {
    id: route.id,
    name: route.name,
    shift: route.shift ?? "",
    legacy,
    pickup: legacy ? (legacyIsPickup ? ordered("pickup") : []) : ordered("pickup"),
    dropoff: legacy ? (legacyIsPickup ? [] : ordered("dropoff")) : ordered("dropoff"),
    weekdays: (route.weekdays ?? []) as number[],
    pickupTargetTime: route.pickup_target_time
      ? String(route.pickup_target_time).slice(0, 5)
      : "",
  };

  const { data: students } = await supabase
    .from("students")
    .select("id, full_name, school, shift, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, school_lat, school_lng")
    .eq("status", "active")
    .order("full_name");

  // Resumo de exceções (feriado/reposição): contagem das próximas (hoje pra
  // frente, mesmo recorte da sub-tela dedicada) + atalho pra gerenciar. A UI de
  // exceções vive em /excecoes — aqui é só a porta de entrada de dentro do editar.
  const { count: excecoesCount } = await supabase
    .from("route_exceptions")
    .select("id", { count: "exact", head: true })
    .eq("route_id", routeId)
    .gte("date", saoPauloToday());

  const { count: tripCount } = await supabase
    .from("route_executions")
    .select("id", { count: "exact", head: true })
    .eq("route_id", routeId);

  return (
    <>
      <header className="flex items-center gap-3 border-b border-navy-900/10 bg-white px-4 pb-5 pt-6 text-navy-900">
        <Link href="/motorista/rotas" className="text-navy-900/70">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-lg font-bold text-navy-900">Editar rota</h1>
      </header>
      <div className="px-4 pb-8">
        <RouteBuilder students={students ?? []} route={toEdit} />

        {/* 5 · Exceções — atalho para a sub-tela (feriado/reposição). */}
        <Link
          href={`/motorista/rotas/${routeId}/excecoes`}
          className="mt-4 flex items-center gap-3 rounded-2xl bg-cream p-4"
        >
          <IconBadge icon={CalendarClock} />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-navy-900">Exceções</span>
            <span className="block text-sm text-navy-700/70">
              {excecoesCount
                ? `${excecoesCount} ${excecoesCount === 1 ? "marcada" : "marcadas"} — feriados e reposições`
                : "Feriados e reposições que fogem da agenda"}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-navy-700/40" />
        </Link>

        <div className="mt-4">
          <DeleteRouteButton routeId={routeId} routeName={route.name} tripCount={tripCount ?? 0} />
        </div>
      </div>
    </>
  );
}
