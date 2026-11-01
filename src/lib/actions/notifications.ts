"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Marca como lidos todos os avisos não-lidos do usuário (ao abrir a tela).
// RLS (notifications_update_self) garante que só mexe nos próprios.
export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  // Só os contadores: a home do pai e o sininho do cabeçalho do motorista. NÃO
  // revalida a própria tela de avisos do pai, para os itens "novo" continuarem
  // destacados na visualização atual (o AvisoList também congela o estado).
  revalidatePath("/responsavel");
  revalidatePath("/motorista", "layout");
}
