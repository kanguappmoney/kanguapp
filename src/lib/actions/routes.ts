"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RouteFormState = { error: string | null };

function today() {
  return new Date().toISOString().slice(0, 10);
}

const SHIFTS = ["morning", "afternoon", "integral"] as const;
type Shift = (typeof SHIFTS)[number];

function parseIds(raw: FormDataEntryValue | null): string[] {
  try {
    const v = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// Cria uma rota "encorpada" (Rotas 2.0): direction='both', com DUAS listas —
// ida (kind='pickup') e volta (kind='dropoff') — ordenadas de forma independente.
// Conjuntos distintos: quem só vai fica só na ida; quem só volta, só na volta.
export async function createRoute(
  _prev: RouteFormState,
  formData: FormData,
): Promise<RouteFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const name = String(formData.get("name") ?? "").trim();
  const shift = String(formData.get("shift") ?? "");
  if (!name) return { error: "Dê um nome à rota." };
  if (!SHIFTS.includes(shift as Shift))
    return { error: "Escolha o turno da rota." };

  const pickupIds = parseIds(formData.get("pickup_ids"));
  const dropoffIds = parseIds(formData.get("dropoff_ids"));
  if (!pickupIds.length && !dropoffIds.length)
    return { error: "Adicione ao menos um aluno na ida ou na volta." };

  const { data: route, error: routeError } = await supabase
    .from("routes")
    .insert({ driver_id: user.id, name, direction: "both", shift: shift as Shift })
    .select("id")
    .single();
  if (routeError) return { error: routeError.message };

  // Cada perna com sua própria numeração 1..N (unique route_id,kind,position).
  const stops = [
    ...pickupIds.map((student_id, i) => ({
      route_id: route.id,
      student_id,
      position: i + 1,
      kind: "pickup" as const,
    })),
    ...dropoffIds.map((student_id, i) => ({
      route_id: route.id,
      student_id,
      position: i + 1,
      kind: "dropoff" as const,
    })),
  ];

  const { error: stopsError } = await supabase.from("route_stops").insert(stops);
  if (stopsError) return { error: stopsError.message };

  revalidatePath("/motorista/rotas");
  redirect("/motorista/rotas");
}

// Perna da execução: 'pickup' (ida) ou 'dropoff' (volta). Só a rota 'both' roda
// por perna; nas rotas antigas de uma perna ela chega undefined (leg null no
// banco) e tudo segue como antes — ponte de compatibilidade.
type Leg = "pickup" | "dropoff";

// Ausências são declaradas por trip_leg (outbound/inbound/both). Uma ausência da
// ida (outbound) vale para a perna pickup; a da volta (inbound) para a dropoff;
// 'both' vale para as duas. Recorta a checagem de ausência à perna em execução.
const LEG_TO_TRIP: Record<Leg, string[]> = {
  pickup: ["outbound", "both"],
  dropoff: ["inbound", "both"],
};

// "Iniciar rota": se há ausências informadas p/ hoje, passa pela Revisão de
// hoje (G2) primeiro. Sem ausências, inicia direto (zero atrito no dia normal).
export async function startOrReview(routeId: string, leg?: Leg) {
  const supabase = await createClient();

  // Recorta as paradas à perna em execução (a 'both' tem duas listas). Sem perna
  // (rota antiga), lê todas as paradas como antes.
  let stopQuery = supabase
    .from("route_stops")
    .select("student_id")
    .eq("route_id", routeId);
  if (leg) stopQuery = stopQuery.eq("kind", leg);
  const { data: stops } = await stopQuery;

  const studentIds = stops?.map((s) => s.student_id) ?? [];
  let hasAbsences = false;
  let hasBlocked = false;
  if (studentIds.length) {
    let absQuery = supabase
      .from("absences")
      .select("id", { count: "exact", head: true })
      .eq("service_date", today())
      .in("student_id", studentIds);
    // Numa perna específica, só ausências daquela perna disparam a revisão.
    if (leg) absQuery = absQuery.in("leg", LEG_TO_TRIP[leg]);
    const { count: absCount } = await absQuery;
    hasAbsences = (absCount ?? 0) > 0;

    // Alunos suspensos (blocked) na rota → há suspensões a revisar (G1/G2).
    const { count: blkCount } = await supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .in("id", studentIds)
      .eq("pay_status", "blocked");
    hasBlocked = (blkCount ?? 0) > 0;
  }

  // Sem ausências e sem suspensões → inicia direto (zero atrito). Senão, revisão.
  if (hasAbsences || hasBlocked) {
    const q = leg ? `?leg=${leg}` : "";
    redirect(`/motorista/rotas/${routeId}/revisao${q}`);
  }
  await startExecution(routeId, leg);
}

// Cria/retoma a execução de hoje (da perna) e coloca em andamento (G4 passa a
// valer). Numa rota 'both' cada perna é uma execução independente no mesmo dia.
export async function startExecution(routeId: string, leg?: Leg) {
  const supabase = await createClient();

  // Retoma a execução da MESMA perna (o índice único é por rota+dia+perna).
  let existingQuery = supabase
    .from("route_executions")
    .select("id, status")
    .eq("route_id", routeId)
    .eq("service_date", today());
  existingQuery = leg
    ? existingQuery.eq("leg", leg)
    : existingQuery.is("leg", null);
  const { data: existing } = await existingQuery.maybeSingle();

  let executionId = existing?.id;

  if (!executionId) {
    const { data: created, error } = await supabase
      .from("route_executions")
      .insert({
        route_id: routeId,
        service_date: today(),
        leg: leg ?? null,
        status: "in_progress",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) redirect(`/motorista/rotas?erro=${encodeURIComponent(error.message)}`);
    executionId = created!.id;
    await supabase
      .from("route_events")
      .insert({ execution_id: executionId, type: "route_started" });
  } else if (existing!.status !== "in_progress" && existing!.status !== "completed") {
    await supabase
      .from("route_executions")
      .update({ status: "in_progress", started_at: new Date().toISOString() })
      .eq("id", executionId);
    await supabase
      .from("route_events")
      .insert({ execution_id: executionId, type: "route_started" });
  }

  redirect(`/motorista/rota/${executionId}`);
}
