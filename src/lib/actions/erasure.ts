"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ErasureState = { error: string | null; done?: boolean };

// O responsável vinculado pede a exclusão dos dados da criança. Quem decide é o admin (nada some sozinho).
export async function requestErasureAction(studentId: string, note: string): Promise<ErasureState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_erasure", { p_student_id: studentId, p_note: note.trim() || null });
  if (error) return { error: error.message };
  revalidatePath("/responsavel/autorizacoes");
  return { error: null, done: true };
}

// Admin: decide um pedido (a função do banco recusa quem não é admin).
export async function decideErasureAction(requestId: string, grant: boolean, formData: FormData): Promise<void> {
  const supabase = await createClient();
  const note = String(formData.get("note") ?? "").trim() || null;
  const { error } = await supabase.rpc("admin_decide_erasure", { p_request_id: requestId, p_grant: grant, p_note: note });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/exclusoes");
}
