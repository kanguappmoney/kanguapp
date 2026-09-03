"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION } from "@/lib/consent";

const CAPTURE_PATH = "/motorista/alunos/captacao";
const SHIFTS = ["morning", "afternoon", "integral"] as const;
type Shift = (typeof SHIFTS)[number];

function newToken() {
  return randomBytes(18).toString("base64url");
}

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

// Cria um link de captação por (turno + escola). Reutilizável e revogável.
export async function createCaptureLink(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const shift = String(formData.get("shift") ?? "");
  const school = emptyToNull(formData.get("school"));
  if (!SHIFTS.includes(shift as Shift) || !school) return; // escola + turno obrigatórios

  await supabase.from("capture_links").insert({
    driver_id: user.id,
    shift: shift as Shift,
    school,
    school_address: emptyToNull(formData.get("school_address")),
    entry_time: emptyToNull(formData.get("entry_time")),
    exit_time: emptyToNull(formData.get("exit_time")),
    token: newToken(),
  });

  revalidatePath(CAPTURE_PATH);
}

// ---------------------------------------------------------------------------
// Lado do PAI: envia o cadastro do próprio filho a partir de um link válido.
// Se o pai ainda não tem conta, cria uma (guardian) ATRÁS do token — não é
// cadastro público — e registra o aceite de Termos (LGPD). A submissão cai na
// fila `pending`; nada vira aluno até o motorista aprovar (Fatia 4).
// ---------------------------------------------------------------------------
export type SubmitState = { error: string | null; needsEmailConfirm?: boolean };

export async function submitCapture(
  token: string,
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const supabase = await createClient();

  const childName = String(formData.get("child_full_name") ?? "").trim();
  if (!childName) return { error: "Informe o nome da criança." };

  // Precisa de um responsável autenticado. Se não houver sessão, cria a conta
  // com os campos do formulário (fluxo do pai que abriu o link sem conta).
  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const full_name = String(formData.get("full_name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const accepted = formData.get("accept_terms") === "on";

    if (!full_name) return { error: "Informe seu nome." };
    if (password.length < 8)
      return { error: "A senha precisa de ao menos 8 caracteres." };
    if (!accepted)
      return { error: "É necessário aceitar os Termos e a Política de Privacidade." };

    const { data: signUp, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role: "guardian", full_name } },
    });
    if (signUpError) return { error: signUpError.message };

    // Sem sessão => confirmação de e-mail ligada. Orienta o pai a confirmar e
    // reabrir o link (reutilizável) para concluir o envio.
    if (!signUp.session) return { error: null, needsEmailConfirm: true };

    await supabase
      .from("users")
      .update({
        terms_accepted_at: new Date().toISOString(),
        terms_version: TERMS_VERSION,
      })
      .eq("id", signUp.user!.id);

    user = signUp.user;
  }

  const birth = emptyToNull(formData.get("child_birth_date"));
  const dropoffSame = formData.get("dropoff_same") === "on";

  const { error: rpcError } = await supabase.rpc("submit_capture", {
    p_token: token,
    p_child_full_name: childName,
    p_child_birth_date: birth,
    p_pickup_address: emptyToNull(formData.get("pickup_address")),
    p_dropoff_same: dropoffSame,
    p_dropoff_address: dropoffSame
      ? null
      : emptyToNull(formData.get("dropoff_address")),
    p_responsible_phone: emptyToNull(formData.get("responsible_phone")),
    p_responsible_whatsapp: emptyToNull(formData.get("responsible_whatsapp")),
  });
  if (rpcError) return { error: rpcError.message };

  revalidatePath("/", "layout");
  redirect("/responsavel?cadastro=enviado");
}

// Revoga um link (não apaga — mantém auditoria). RLS garante que só o dono age.
export async function revokeCaptureLink(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("capture_links")
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("status", "active");
  revalidatePath(CAPTURE_PATH);
}

// Regenera: revoga o link atual e cria um novo com o MESMO contexto (turno,
// escola, horários) e um token novo. Para o caso "vazou" ou "novo ano".
export async function regenerateCaptureLink(id: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // RLS restringe a leitura ao dono; ainda assim filtramos por driver_id.
  const { data: old } = await supabase
    .from("capture_links")
    .select("driver_id, shift, school, school_address, entry_time, exit_time")
    .eq("id", id)
    .eq("driver_id", user.id)
    .maybeSingle();
  if (!old) return;

  await supabase
    .from("capture_links")
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("status", "active");

  await supabase.from("capture_links").insert({
    driver_id: user.id,
    shift: old.shift,
    school: old.school,
    school_address: old.school_address,
    entry_time: old.entry_time,
    exit_time: old.exit_time,
    token: newToken(),
  });

  revalidatePath(CAPTURE_PATH);
}
