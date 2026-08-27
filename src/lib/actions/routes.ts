"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RouteFormState = { error: string | null };

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Cria uma rota + a sequência de paradas. kind derivado do sentido:
// ida (outbound) = embarques (pickup); volta (inbound) = desembarques (dropoff).
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
  const direction = String(formData.get("direction") ?? "");
  if (!name) return { error: "Dê um nome à rota." };
  if (direction !== "outbound" && direction !== "inbound")
    return { error: "Escolha o sentido da rota." };

  let studentIds: string[] = [];
  try {
    studentIds = JSON.parse(String(formData.get("student_ids") ?? "[]"));
  } catch {
    studentIds = [];
  }
  if (!studentIds.length)
    return { error: "Selecione ao menos um aluno para a rota." };

  const { data: route, error: routeError } = await supabase
    .from("routes")
    .insert({ driver_id: user.id, name, direction })
    .select("id")
    .single();
  if (routeError) return { error: routeError.message };

  const kind = direction === "outbound" ? "pickup" : "dropoff";
  const stops = studentIds.map((student_id, i) => ({
    route_id: route.id,
    student_id,
    position: i + 1,
    kind,
  }));

  const { error: stopsError } = await supabase.from("route_stops").insert(stops);
  if (stopsError) return { error: stopsError.message };

  revalidatePath("/motorista/rotas");
  redirect("/motorista/rotas");
}

// "Iniciar rota": se há ausências informadas p/ hoje, passa pela Revisão de
// hoje (G2) primeiro. Sem ausências, inicia direto (zero atrito no dia normal).
export async function startOrReview(routeId: string) {
  const supabase = await createClient();

  const { data: stops } = await supabase
    .from("route_stops")
    .select("student_id")
    .eq("route_id", routeId);

  const studentIds = stops?.map((s) => s.student_id) ?? [];
  let hasAbsences = false;
  if (studentIds.length) {
    const { count } = await supabase
      .from("absences")
      .select("id", { count: "exact", head: true })
      .eq("service_date", today())
      .in("student_id", studentIds);
    hasAbsences = (count ?? 0) > 0;
  }

  if (hasAbsences) {
    redirect(`/motorista/rotas/${routeId}/revisao`);
  }
  await startExecution(routeId);
}

// Cria/retoma a execução de hoje e coloca em andamento (G4 passa a valer).
export async function startExecution(routeId: string) {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("route_executions")
    .select("id, status")
    .eq("route_id", routeId)
    .eq("service_date", today())
    .maybeSingle();

  let executionId = existing?.id;

  if (!executionId) {
    const { data: created, error } = await supabase
      .from("route_executions")
      .insert({
        route_id: routeId,
        service_date: today(),
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
