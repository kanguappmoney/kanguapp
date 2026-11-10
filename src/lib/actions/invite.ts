"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION } from "@/lib/consent";
import { buildEvidence } from "@/lib/consent-evidence";

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
  // Autorização própria da criança (A2): as duas declarações, independentes dos Termos da conta.
  if (formData.get("consent_child_1") !== "on" || formData.get("consent_child_2") !== "on") {
    return { error: "Marque as duas declarações da autorização para continuar." };
  }

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

  // Nomes do texto vêm do banco (prévia do convite), nunca do formulário.
  const { data: prev } = await supabase.rpc("get_invite_preview", { p_token: token });
  const names = prev as { driver_name?: string; student_name?: string } | null;
  const consent = await buildEvidence(
    "child_data",
    { provider: names?.driver_name ?? "", child: names?.student_name ?? "" },
    { checked: [true, true] },
  );

  // Vincula à criança do convite (a função valida papel/expiração/uso único e grava o aceite próprio).
  const { error: rpcError } = await supabase.rpc("accept_student_invite", {
    p_token: token,
    p_consent: consent,
  });
  if (rpcError) return { error: rpcError.message };

  revalidatePath("/", "layout");
  redirect("/responsavel");
}
