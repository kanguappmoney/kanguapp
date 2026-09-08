import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { HomeContent } from "@/components/HomeContent";
import { getRoutesWithTodayExecs } from "@/lib/routes-today";
import { getActiveDriverBoard } from "@/lib/drive-board";
import { buildRouteMapUrl } from "@/lib/route-path";

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Saudação pelo horário local (região do piloto: São Paulo, UTC-3).
function greeting() {
  const hour = Number(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hour12: false,
    }),
  );
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export default async function DriverHome() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  // Foto do motorista (URL assinada, bucket privado) para o avatar do cabeçalho.
  let avatarUrl: string | null = null;
  const { data: profile } = await supabase
    .from("driver_profiles")
    .select("photo_path")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();
  if (profile?.photo_path) {
    const { data } = await supabase.storage
      .from("driver-photos")
      .createSignedUrl(profile.photo_path, 3600);
    avatarUrl = data?.signedUrl ?? null;
  }

  // Chip da placa (dado real do perfil). Só a identificação do veículo — sem
  // status "online" (isso dependeria de GPS ao vivo, que a home não tem).
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("plate, model")
    .eq("driver_id", user?.id ?? "")
    .limit(1)
    .maybeSingle();
  const vehicleLabel = vehicle
    ? [vehicle.model, vehicle.plate].filter(Boolean).join(" ") || null
    : null;

  // Contadores reais. Alunos ativos dão a contagem e a base das ausências de hoje.
  const { data: activeStudents } = await supabase
    .from("students")
    .select("id")
    .eq("status", "active");
  const studentIds = (activeStudents ?? []).map((s) => s.id);
  const alunos = studentIds.length;

  let ausencias = 0;
  if (studentIds.length) {
    const { count } = await supabase
      .from("absences")
      .select("id", { count: "exact", head: true })
      .eq("service_date", today())
      .in("student_id", studentIds);
    ausencias = count ?? 0;
  }

  // Rotas + execuções de hoje (fonte única). A home só mostra em "Rota de hoje" o
  // que roda hoje pela recorrência OU já tem execução hoje — este segundo ramo
  // garante que uma rota iniciada num dia FORA da agenda (dia extra) não some da
  // home depois de começar. A /rotas ignora isto e lista todas (é lá que se
  // inicia fora da agenda). Paradas = soma das paradas das rotas de hoje.
  const { routes, execByLeg, runsTodayIds } = await getRoutesWithTodayExecs();
  const hasExecToday = (routeId: string) =>
    [...execByLeg.keys()].some((k) => k.startsWith(`${routeId}:`));
  const todayRoutes = routes.filter(
    (r) => runsTodayIds.has(r.id) || hasExecToday(r.id),
  );
  const paradas = todayRoutes.reduce(
    (n, r) => n + (r.route_stops?.length ?? 0),
    0,
  );

  // Bloco vivo: se há perna em andamento, a home mostra o quadro real dela.
  const board = await getActiveDriverBoard();

  // Mini-mapa da rota (traçado das paradas pendentes + escola). Server-side: a
  // Directions roda aqui com timeout; se falhar, a URL vem só com os pinos.
  const mapUrl = board
    ? await buildRouteMapUrl(process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "", board)
    : null;

  return (
    <HomeContent
      firstName={user?.fullName.split(" ")[0] ?? "motorista"}
      avatarUrl={avatarUrl}
      vehicleLabel={vehicleLabel}
      greeting={greeting()}
      alunos={alunos}
      ausencias={ausencias}
      paradas={paradas}
      board={board}
      mapUrl={mapUrl}
      routes={todayRoutes}
      execByLeg={execByLeg}
      routesEmptyText={
        routes.length === 0
          ? "Nenhuma rota ainda. Monte a primeira na aba Rotas."
          : "Nenhuma rota programada para hoje. Veja todas em Rotas."
      }
    />
  );
}
