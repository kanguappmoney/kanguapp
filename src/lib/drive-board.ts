import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Fonte única do "quadro de embarque" de uma execução: as paradas da perna em
// andamento, com o estado de cada aluno (pendente / embarcou / ausente). Usado
// pelo Modo Direção (DriveScreen) e pela home (bloco vivo quando a rota roda) —
// sem duas cópias divergentes da mesma resolução.

export type StopState = "pending" | "boarded" | "absent";

export interface BoardStop {
  studentId: string;
  position: number;
  name: string;
  address: string | null;
  photoUrl: string | null;
  state: StopState;
}

// Execução como já é lida pelas telas (com a relação routes aninhada).
interface ExecutionRow {
  id: string;
  route_id: string;
  leg: string | null;
  routes: { name: string; direction: string } | { name: string; direction: string }[];
}

function routeOf(exec: ExecutionRow) {
  return Array.isArray(exec.routes) ? exec.routes[0] : exec.routes;
}

// Perna do trajeto: na 'both' vem do execution.leg; no legado de uma perna, do
// direction (ponte de compatibilidade) — mesma regra da DriveScreen.
export function kindOf(exec: ExecutionRow): "pickup" | "dropoff" {
  const route = routeOf(exec);
  if (route.direction === "both") return exec.leg as "pickup" | "dropoff";
  return route.direction === "outbound" ? "pickup" : "dropoff";
}

// Nome da rota já com a perna explícita na 'both' ("Turma Manhã • ida").
export function boardRouteName(exec: ExecutionRow): string {
  const route = routeOf(exec);
  if (route.direction !== "both") return route.name;
  return `${route.name} • ${kindOf(exec) === "pickup" ? "ida" : "volta"}`;
}

// Resolve as paradas + estado de uma execução. withPhotos liga a URL assinada
// da foto de cada aluno (a home usa; o Modo Direção não precisa).
export async function resolveBoardStops(
  supabase: SupabaseClient,
  exec: ExecutionRow,
  opts: { withPhotos?: boolean } = {},
): Promise<BoardStop[]> {
  const route = routeOf(exec);
  const kind = kindOf(exec);

  // Na 'both' filtra pela perna; no legado as paradas já são de uma perna só.
  let stopsQuery = supabase
    .from("route_stops")
    .select(
      "student_id, position, students(full_name, pickup_address, dropoff_address, photo_path)",
    )
    .eq("route_id", exec.route_id)
    .order("position");
  if (route.direction === "both") stopsQuery = stopsQuery.eq("kind", kind);
  const { data: stops } = await stopsQuery;

  const { data: events } = await supabase
    .from("route_events")
    .select("student_id, type")
    .eq("execution_id", exec.id)
    .in("type", ["embarked", "disembarked", "student_absent"]);

  const stateByStudent = new Map<string, "boarded" | "absent">();
  for (const e of events ?? []) {
    if (!e.student_id) continue;
    stateByStudent.set(
      e.student_id,
      e.type === "student_absent" ? "absent" : "boarded",
    );
  }

  return Promise.all(
    (stops ?? []).map(async (s) => {
      const st = (
        Array.isArray(s.students) ? s.students[0] : s.students
      ) as {
        full_name: string;
        pickup_address: string | null;
        dropoff_address: string | null;
        photo_path: string | null;
      };
      let photoUrl: string | null = null;
      if (opts.withPhotos && st.photo_path) {
        const { data } = await supabase.storage
          .from("student-photos")
          .createSignedUrl(st.photo_path, 3600);
        photoUrl = data?.signedUrl ?? null;
      }
      return {
        studentId: s.student_id,
        position: s.position,
        name: st.full_name,
        address: kind === "pickup" ? st.pickup_address : st.dropoff_address,
        photoUrl,
        state: (stateByStudent.get(s.student_id) ?? "pending") as StopState,
      };
    }),
  );
}

export interface ActiveBoard {
  executionId: string;
  routeName: string;
  kind: "pickup" | "dropoff";
  stops: BoardStop[];
  nextStop: BoardStop | null; // 1ª parada ainda pendente (a "próxima parada")
  boardedCount: number;
  total: number;
}

// O quadro da execução EM ANDAMENTO do motorista hoje (se houver). RLS
// (route_executions_all_owner) já recorta às execuções das rotas do próprio
// dono. Se mais de uma perna roda, pega a iniciada mais recentemente.
export async function getActiveDriverBoard(): Promise<ActiveBoard | null> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: exec } = await supabase
    .from("route_executions")
    .select("id, route_id, leg, status, started_at, routes(name, direction)")
    .eq("status", "in_progress")
    .eq("service_date", today)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!exec) return null;

  const stops = await resolveBoardStops(supabase, exec as ExecutionRow, {
    withPhotos: true,
  });
  const nextStop = stops.find((s) => s.state === "pending") ?? null;
  const boardedCount = stops.filter((s) => s.state === "boarded").length;

  return {
    executionId: exec.id,
    routeName: boardRouteName(exec as ExecutionRow),
    kind: kindOf(exec as ExecutionRow),
    stops,
    nextStop,
    boardedCount,
    total: stops.length,
  };
}
