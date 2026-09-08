import { createClient } from "@/lib/supabase/server";
import { saoPauloToday } from "@/lib/day";
import { regionParams } from "@/lib/geo-region";
import { execKey, type RouteWithStops, type TodayExec } from "@/lib/routes-today";

// Sugestão de horário de saída de casa (perna de IDA). "Saia até HH:MM para não
// atrasar o 1º aluno." Informativo, NUNCA bloqueia. Só server: as coordenadas e o
// endereço do motorista não vão pro cliente. Cálculo:
//   leave_by = pickup_target_time − duração(casa → 1º aluno) − 10min
// Origem = driver_profiles.address geocodificado (não GPS). Directions perfil
// `driving` (sem trânsito — driving-traffic fica fora, mesma exclusão do v1).
// Cache 1x por rota por dia em route_departure_suggestions.

const MARGIN_MIN = 10;
const GEO_TIMEOUT_MS = 1500;
const DIRECTIONS_TIMEOUT_MS = 1500;

export interface DepartureSuggestion {
  leaveBy: string; // "HH:MM"
  studentName: string;
}

function hhmm(totalMinutes: number): string {
  const m = ((totalMinutes % 1440) + 1440) % 1440; // normaliza p/ [0,1440)
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function timeToMinutes(t: string): number | null {
  const m = /^(\d{2}):(\d{2})/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(id);
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

async function geocode(
  address: string,
  token: string,
): Promise<{ lat: number; lng: number } | null> {
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json` +
    `?access_token=${token}&country=br&language=pt&limit=1&types=address,place,locality,neighborhood` +
    regionParams();
  const res = await fetchWithTimeout(url, GEO_TIMEOUT_MS);
  if (!res) return null;
  const json = (await res.json()) as { features?: { center: [number, number] }[] };
  const c = json.features?.[0]?.center; // [lng, lat]
  return c ? { lat: c[1], lng: c[0] } : null;
}

async function drivingDurationSeconds(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  token: string,
): Promise<number | null> {
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?overview=false&access_token=${token}`;
  const res = await fetchWithTimeout(url, DIRECTIONS_TIMEOUT_MS);
  if (!res) return null;
  const json = (await res.json()) as {
    code?: string;
    routes?: { duration?: number }[];
  };
  if (json.code !== "Ok") return null;
  const d = json.routes?.[0]?.duration;
  return typeof d === "number" ? d : null;
}

// Sugestões por rota para a home. Só rotas de hoje com pickup_target_time, com
// perna de ida NÃO iniciada, 1º aluno da ida com coordenada, e motorista com
// endereço geocodificável. Qualquer furo → aquela rota fica sem sugestão (nunca
// quebra). Reusa cache; senão calcula e grava.
export async function getDepartureSuggestions(
  routes: RouteWithStops[],
  execByLeg: Map<string, TodayExec>,
): Promise<Map<string, DepartureSuggestion>> {
  const out = new Map<string, DepartureSuggestion>();

  // Elegíveis: tem alvo, tem perna de ida (both/outbound), ida não começou hoje.
  const eligible = routes.filter((r) => {
    if (!r.pickup_target_time) return false;
    if (r.direction !== "both" && r.direction !== "outbound") return false;
    const legKey = r.direction === "both" ? execKey(r.id, "pickup") : execKey(r.id, null);
    const exec = execByLeg.get(legKey);
    return !exec; // sem execução da ida hoje = ainda não iniciada
  });
  if (!eligible.length) return out;

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  if (!token) return out;

  const supabase = await createClient();
  const today = saoPauloToday();

  // Cache existente do dia para as rotas elegíveis (1 query).
  const ids = eligible.map((r) => r.id);
  const { data: cached } = await supabase
    .from("route_departure_suggestions")
    .select("route_id, leave_by, first_student_name")
    .eq("service_date", today)
    .in("route_id", ids);
  const cacheByRoute = new Map(
    (cached ?? []).map((c) => [c.route_id as string, c]),
  );

  // Endereço do motorista, geocodificado uma vez (origem comum a todas as rotas).
  let origin: { lat: number; lng: number } | null | undefined;
  const originFor = async (): Promise<{ lat: number; lng: number } | null> => {
    if (origin !== undefined) return origin;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("driver_profiles")
      .select("address")
      .eq("user_id", user?.id ?? "")
      .maybeSingle();
    origin = profile?.address ? await geocode(profile.address, token) : null;
    return origin;
  };

  for (const r of eligible) {
    const hit = cacheByRoute.get(r.id);
    if (hit) {
      out.set(r.id, {
        leaveBy: String(hit.leave_by).slice(0, 5),
        studentName: hit.first_student_name as string,
      });
      continue;
    }

    const target = timeToMinutes(r.pickup_target_time as string);
    if (target == null) continue;

    // 1º aluno da lista de ida (menor position, kind pickup) com coordenada.
    const { data: firstStop } = await supabase
      .from("route_stops")
      .select("students(full_name, pickup_lat, pickup_lng)")
      .eq("route_id", r.id)
      .eq("kind", "pickup")
      .order("position")
      .limit(1)
      .maybeSingle();
    const st = firstStop?.students
      ? (Array.isArray(firstStop.students) ? firstStop.students[0] : firstStop.students)
      : null;
    if (!st || st.pickup_lat == null || st.pickup_lng == null) continue;

    const from = await originFor();
    if (!from) continue; // sem endereço do motorista geocodificável → sem sugestão

    const dur = await drivingDurationSeconds(
      from,
      { lat: st.pickup_lat, lng: st.pickup_lng },
      token,
    );
    if (dur == null) continue; // Directions falhou/lenta → sem sugestão (não quebra)

    const leaveByMin = target - Math.round(dur / 60) - MARGIN_MIN;
    const leaveBy = hhmm(leaveByMin);
    const studentName = st.full_name as string;

    // Grava o cache do dia (idempotente por PK route_id+service_date).
    await supabase.from("route_departure_suggestions").upsert({
      route_id: r.id,
      service_date: today,
      leave_by: leaveBy,
      first_student_name: studentName,
      duration_seconds: Math.round(dur),
    });

    out.set(r.id, { leaveBy, studentName });
  }

  return out;
}
