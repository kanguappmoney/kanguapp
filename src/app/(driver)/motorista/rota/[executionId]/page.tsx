import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DriveScreen, type DriveStop } from "@/components/DriveScreen";
import { resolveBoardStops, kindOf, boardRouteName } from "@/lib/drive-board";
import { getRouteLineCoords } from "@/lib/route-path";
import type { GeoPoint } from "@/lib/geo";

export default async function ModoDirecaoPage({
  params,
}: {
  params: Promise<{ executionId: string }>;
}) {
  const { executionId } = await params;
  const supabase = await createClient();

  const { data: execution } = await supabase
    .from("route_executions")
    .select("id, status, route_id, leg, service_date, routes(name, direction)")
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
  // usa o mesmo helper. Aqui a foto serve só à bolinha da próxima parada no mapa.
  const kind = kindOf(execution);
  const board = await resolveBoardStops(supabase, execution, { withPhotos: true });
  const driveStops: DriveStop[] = board.map((s) => ({
    studentId: s.studentId,
    position: s.position,
    name: s.name,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    state: s.state,
    photoUrl: s.photoUrl,
  }));
  const routeName = boardRouteName(execution);

  // Extensão da G1 (só na volta): quem embarcou na IDA de hoje não pode ser
  // marcado ausente na volta — só "Desembarcou". Busca os student_ids que têm
  // `embarked` na execução de pickup da mesma rota + dia. O trigger no banco é o
  // backstop à prova de bypass; aqui é o gate de UI (esconde o "Ausente").
  let embarkedIdaIds: string[] = [];
  if (kind === "dropoff") {
    const { data: idaExecs } = await supabase
      .from("route_executions")
      .select("id")
      .eq("route_id", execution.route_id)
      .eq("service_date", execution.service_date)
      .eq("leg", "pickup");
    const idaIds = (idaExecs ?? []).map((e) => e.id);
    if (idaIds.length) {
      const { data: ev } = await supabase
        .from("route_events")
        .select("student_id")
        .in("execution_id", idaIds)
        .eq("type", "embarked");
      embarkedIdaIds = [
        ...new Set((ev ?? []).map((e) => e.student_id).filter(Boolean) as string[]),
      ];
    }
  }

  // --- Mapa do Modo Direção 2.0 (server): escola compartilhada como âncora + a
  // linha da rota (Directions). A lista de coords não vai pro cliente pronta —
  // só a linha resultante. Sem token/coord/Directions, o mapa degrada (sem linha
  // ou sem mapa); a tela nunca depende disso.
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  const schools = board
    .filter((s) => s.schoolLat != null && s.schoolLng != null)
    .map((s) => ({ lat: s.schoolLat as number, lng: s.schoolLng as number }));
  const key = (p: GeoPoint) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
  const anchor: GeoPoint | null =
    schools.length && schools.every((p) => key(p) === key(schools[0]))
      ? schools[0]
      : null;

  const stopCoords = board
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({ lat: s.lat as number, lng: s.lng as number }));
  const ordered = anchor
    ? kind === "pickup"
      ? [...stopCoords, anchor]
      : [anchor, ...stopCoords]
    : stopCoords;
  const line = await getRouteLineCoords(token, ordered);

  return (
    <DriveScreen
      executionId={executionId}
      routeName={routeName}
      kind={kind}
      active={execution.status === "in_progress" && trackingMode === "map"}
      inProgress={execution.status === "in_progress"}
      stops={driveStops}
      mapToken={token}
      mapLine={line}
      mapAnchor={anchor}
      embarkedIdaIds={embarkedIdaIds}
    />
  );
}
