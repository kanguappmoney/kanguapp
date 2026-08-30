"use server";

import { createClient } from "@/lib/supabase/server";

export type OccurrenceType = "traffic" | "delay" | "breakdown" | "vehicle_change";

// Registra a ocorrência e notifica os pais vinculados — tudo na função
// SECURITY DEFINER register_occurrence (valida dono, insere, faz o fan-out).
export async function registerOccurrence(
  executionId: string,
  type: OccurrenceType,
  note: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("register_occurrence", {
    p_execution_id: executionId,
    p_type: type,
    p_note: note.trim() || null,
  });
  return { error: error?.message ?? null };
}
