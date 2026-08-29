"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AbsenceState = { error: string | null };

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Responsável informa que o filho não vai num dia/trajeto. RLS (absences_insert_
// guardian) garante que só dá pra informar ausência de aluno vinculado.
export async function reportAbsence(
  _prev: AbsenceState,
  formData: FormData,
): Promise<AbsenceState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const student_id = String(formData.get("student_id") ?? "");
  const service_date = String(formData.get("service_date") ?? "");
  const legRaw = String(formData.get("leg") ?? "both");
  const leg =
    legRaw === "outbound" || legRaw === "inbound" || legRaw === "both"
      ? legRaw
      : "both";

  if (!student_id) return { error: "Selecione a criança." };
  if (!service_date) return { error: "Escolha a data." };
  if (service_date < today())
    return { error: "Não dá para informar ausência em data passada." };

  const { error } = await supabase.from("absences").insert({
    student_id,
    reported_by: user.id,
    service_date,
    leg,
  });

  if (error) {
    // Violação de unique (student_id, service_date, leg) = já informada.
    if (error.code === "23505")
      return { error: "Essa ausência já foi informada." };
    return { error: error.message };
  }

  revalidatePath("/responsavel/ausencias");
  return { error: null };
}

// Desfazer a ausência — só ATÉ o início da rota daquele dia (G-operacional:
// depois que a rota começou, o motorista já se organizou por ela).
export async function undoAbsence(absenceId: string): Promise<AbsenceState> {
  const supabase = await createClient();

  const { data: absence } = await supabase
    .from("absences")
    .select("student_id, service_date")
    .eq("id", absenceId)
    .single();
  if (!absence) return { error: "Ausência não encontrada." };

  // Alguma execução da(s) rota(s) desse aluno já começou/terminou nesse dia?
  const { data: stops } = await supabase
    .from("route_stops")
    .select("route_id")
    .eq("student_id", absence.student_id);
  const routeIds = stops?.map((s) => s.route_id) ?? [];

  if (routeIds.length) {
    const { count } = await supabase
      .from("route_executions")
      .select("id", { count: "exact", head: true })
      .eq("service_date", absence.service_date)
      .in("route_id", routeIds)
      .in("status", ["in_progress", "completed"]);
    if ((count ?? 0) > 0)
      return { error: "A rota já começou — não dá mais para desfazer." };
  }

  const { error } = await supabase.from("absences").delete().eq("id", absenceId);
  if (error) return { error: error.message };

  revalidatePath("/responsavel/ausencias");
  return { error: null };
}
