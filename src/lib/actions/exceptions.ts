"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { saoPauloToday } from "@/lib/day";

export type ExceptionState = { error: string | null };

// Exceções da recorrência (R3): desvios pontuais da agenda semanal — 'skip'
// (feriado: não roda num dia que rodaria) ou 'extra' (reposição: roda num dia que
// não rodaria). O modelo, a RLS dono-only e o route_runs_on já vêm da 029.
//
// Guarda inalterada (espírito do 100m): exceção só muda o que a home MOSTRA —
// NUNCA bloqueia iniciar. Nenhum trigger novo; a G2 não se aplica (não é
// route_stops, não congela com perna rodando: é calendário futuro).
export async function addException(
  _prev: ExceptionState,
  formData: FormData,
): Promise<ExceptionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const route_id = String(formData.get("route_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const kindRaw = String(formData.get("kind") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!route_id) return { error: "Rota não informada." };
  if (!date) return { error: "Escolha a data." };
  if (kindRaw !== "skip" && kindRaw !== "extra")
    return { error: "Escolha feriado ou reposição." };
  // Exceção retroativa não tem efeito prático (o dia já passou).
  if (date < saoPauloToday())
    return { error: "Escolha uma data de hoje em diante." };

  // A RLS (route_exceptions_all_owner, with check is_driver_of_route) recusa
  // gravar em rota de outro motorista — o portão real é o banco, não este if.
  const { error } = await supabase.from("route_exceptions").insert({
    route_id,
    date,
    kind: kindRaw,
    reason: reason || null,
  });

  if (error) {
    // unique(route_id, date): já existe um desvio nesse dia.
    if (error.code === "23505")
      return { error: "Já existe uma exceção nesse dia. Remova a atual antes." };
    return { error: error.message };
  }

  // A home e a /rotas leem a recorrência; um desvio de hoje muda o que aparece.
  revalidatePath(`/motorista/rotas/${route_id}/excecoes`);
  revalidatePath("/motorista/rotas");
  revalidatePath("/motorista");
  return { error: null };
}

// Remover um desvio: RLS dono-only recorta ao próprio motorista (delete numa
// exceção de rota alheia não acha linha). revalida os mesmos caminhos.
export async function removeException(exceptionId: string, routeId: string) {
  const supabase = await createClient();
  await supabase.from("route_exceptions").delete().eq("id", exceptionId);
  revalidatePath(`/motorista/rotas/${routeId}/excecoes`);
  revalidatePath("/motorista/rotas");
  revalidatePath("/motorista");
}
