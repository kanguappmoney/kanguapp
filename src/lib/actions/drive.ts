"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type StopState = "pending" | "boarded" | "absent";

// Marca a parada de um aluno com um toque. Idempotente: limpa eventos anteriores
// do aluno nesta execução e grava o novo estado. Alimenta a Linha do tempo (G6).
export async function setStopState(
  executionId: string,
  studentId: string,
  state: StopState,
  kind: "pickup" | "dropoff",
) {
  const supabase = await createClient();

  await supabase
    .from("route_events")
    .delete()
    .eq("execution_id", executionId)
    .eq("student_id", studentId)
    .in("type", ["embarked", "disembarked", "student_absent"]);

  if (state !== "pending") {
    const type =
      state === "absent"
        ? "student_absent"
        : kind === "pickup"
          ? "embarked"
          : "disembarked";
    await supabase
      .from("route_events")
      .insert({ execution_id: executionId, student_id: studentId, type });
  }

  revalidatePath(`/motorista/rota/${executionId}`);
}

// Emite a posição atual da van (Modo Mapa, G4/G6). UPSERT por execução — não
// guarda histórico. A RLS `is_driver_of_execution` é o gate final: só o motorista
// dono da execução escreve; a leitura pelo pai passa por `guardian_can_see_live_position`
// (in_progress + modo 'map'). O throttle de custo vive no cliente (ver geo.ts).
export async function updatePosition(
  executionId: string,
  pos: {
    lat: number;
    lng: number;
    heading?: number | null;
    speed?: number | null;
    accuracy?: number | null;
  },
) {
  const supabase = await createClient();

  await supabase.from("live_positions").upsert(
    {
      execution_id: executionId,
      lat: pos.lat,
      lng: pos.lng,
      heading: pos.heading ?? null,
      speed: pos.speed ?? null,
      accuracy: pos.accuracy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "execution_id" },
  );
  // Sem revalidatePath: escrita de alta frequência; o pai relê por polling.
}

// Encerra a rota: registra o fim e marca a execução como concluída.
// O checklist "nenhum aluno ficou na van" é confirmado na tela antes de chamar.
export async function endRoute(executionId: string) {
  const supabase = await createClient();

  await supabase
    .from("route_events")
    .insert({ execution_id: executionId, type: "route_ended" });

  await supabase
    .from("route_executions")
    .update({ status: "completed", ended_at: new Date().toISOString() })
    .eq("id", executionId);

  redirect("/motorista");
}
