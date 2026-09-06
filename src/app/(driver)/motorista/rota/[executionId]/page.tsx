import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DriveScreen, type DriveStop } from "@/components/DriveScreen";
import { resolveBoardStops, kindOf, boardRouteName } from "@/lib/drive-board";

export default async function ModoDirecaoPage({
  params,
}: {
  params: Promise<{ executionId: string }>;
}) {
  const { executionId } = await params;
  const supabase = await createClient();

  const { data: execution } = await supabase
    .from("route_executions")
    .select("id, status, route_id, leg, routes(name, direction)")
    .eq("id", executionId)
    .single();

  if (!execution) notFound();
  if (execution.status === "completed") redirect("/motorista/rotas");

  // G6 + minimização de dado: só coletamos GPS quando o motorista está em modo
  // Mapa. Em Linha do tempo a posição nunca serviria (a RLS descartaria), então
  // não a gravamos — a forma mais segura de proteger um dado é não tê-lo.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("driver_profiles")
    .select("parent_tracking_mode")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();
  const trackingMode = profile?.parent_tracking_mode ?? "map";

  // Fonte única do quadro de embarque (resolve paradas da perna + estado). A home
  // usa o mesmo helper — sem foto aqui (o Modo Direção não exibe foto na lista).
  const kind = kindOf(execution);
  const board = await resolveBoardStops(supabase, execution);
  const driveStops: DriveStop[] = board.map((s) => ({
    studentId: s.studentId,
    position: s.position,
    name: s.name,
    address: s.address,
    state: s.state,
  }));
  const routeName = boardRouteName(execution);

  return (
    <DriveScreen
      executionId={executionId}
      routeName={routeName}
      kind={kind}
      active={execution.status === "in_progress" && trackingMode === "map"}
      stops={driveStops}
    />
  );
}
