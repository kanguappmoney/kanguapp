"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION } from "@/lib/consent";

export type AcceptState = { error: string | null; needsEmailConfirm?: boolean };

// Fluxo "Você foi convidado": cria a conta do responsável, registra o aceite
// de Termos + Política (LGPD) e vincula à criança via RPC (uso único).
export async function acceptInvite(
  token: string,
  _prev: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const full_name = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const accepted = formData.get("accept_terms") === "on";

  if (!full_name) return { error: "Informe seu nome." };
  if (password.length < 8)
    return { error: "A senha precisa de ao menos 8 caracteres." };
  if (!accepted)
    return { error: "É necessário aceitar os Termos e a Política de Privacidade." };

  const supabase = await createClient();

  const { data: signUp, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role: "guardian", full_name } },
  });
  if (signUpError) return { error: signUpError.message };

  // Sem sessão => confirmação de e-mail está ligada no projeto. Orienta o pai.
  if (!signUp.session) {
    return {
      error: null,
      needsEmailConfirm: true,
    };
  }

  // Registra o consentimento (auditável p/ LGPD).
  await supabase
    .from("users")
    .update({
      terms_accepted_at: new Date().toISOString(),
      terms_version: TERMS_VERSION,
    })
    .eq("id", signUp.user!.id);

  // Vincula à criança do convite (a função valida papel/expiração/uso único).
  const { error: rpcError } = await supabase.rpc("accept_student_invite", {
    p_token: token,
  });
  if (rpcError) return { error: rpcError.message };

  revalidatePath("/", "layout");
  redirect("/responsavel");
}
