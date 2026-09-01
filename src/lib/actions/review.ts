"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Aplica as decisões da Revisão de hoje (G1/G2 na função apply_route_review)
// e inicia a rota. skipIds = os alunos que o motorista confirmou pular.
export async function applyRouteReview(routeId: string, skipIds: string[]) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_route_review", {
    p_route_id: routeId,
    p_skip_student_ids: skipIds,
  });
  if (error)
    redirect(`/motorista/rotas?erro=${encodeURIComponent(error.message)}`);
  redirect(`/motorista/rota/${data}`);
}
