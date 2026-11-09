"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { clientIp } from "@/lib/access-log";
import { buildEvidence } from "@/lib/consent-evidence";
import { revocationNotice } from "@/lib/consent-texts";

export type ConsentState = { error: string | null; notice?: string | null };

function today(): string {
  return new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// Nomes reais para o texto: criança e prestador (motorista) saem do banco, nunca do formulário.
async function namesFor(studentId: string) {
  const supabase = await createClient();
  const { data: s } = await supabase.from("students").select("full_name, driver_id").eq("id", studentId).maybeSingle();
  if (!s) return null;
  const { data: d } = await supabase.from("users").select("full_name").eq("id", s.driver_id).maybeSingle();
  return { child: s.full_name as string, provider: (d?.full_name as string | undefined) ?? "" };
}

// Retira uma autorização (do próprio titular). Foto: o arquivo é apagado do armazenamento também.
export async function revokeConsentAction(consentId: string): Promise<ConsentState> {
  const supabase = await createClient();
  const ip = clientIp(await headers());
  const { data, error } = await supabase.rpc("revoke_consent", { p_consent_id: consentId, p_ip: ip });
  if (error) return { error: error.message };
  const res = data as { kind?: string; photo_path?: string | null } | null;
  if (res?.kind === "child_photo" && res.photo_path) {
    await supabase.storage.from("student-photos").remove([res.photo_path]);
  }
  revalidatePath("/responsavel/autorizacoes");
  revalidatePath("/motorista", "layout");
  return { error: null, notice: revocationNotice(today()) };
}

// Reautorizar a criança suspensa (qualquer responsável vinculado), com as duas declarações.
export async function reauthorizeChildAction(studentId: string, _prev: ConsentState, formData: FormData): Promise<ConsentState> {
  if (formData.get("consent_child_1") !== "on" || formData.get("consent_child_2") !== "on") {
    return { error: "Marque as duas declarações da autorização para continuar." };
  }
  const names = await namesFor(studentId);
  if (!names) return { error: "Criança não encontrada." };
  const supabase = await createClient();
  const consent = await buildEvidence("child_data", names, { checked: [true, true] });
  const { error } = await supabase.rpc("reauthorize_child", { p_student_id: studentId, p_consent: consent });
  if (error) return { error: error.message };
  revalidatePath("/responsavel/autorizacoes");
  return { error: null };
}

// Autorizar a foto (opcional, separada).
export async function acceptPhotoAction(studentId: string): Promise<ConsentState> {
  const names = await namesFor(studentId);
  if (!names) return { error: "Criança não encontrada." };
  const supabase = await createClient();
  const photo = await buildEvidence("child_photo", { child: names.child });
  const { error } = await supabase.rpc("accept_photo_consent", { p_student_id: studentId, p_consent: photo });
  if (error) return { error: error.message };
  revalidatePath("/responsavel/autorizacoes");
  return { error: null };
}

// Vitrine do motorista: aceite do texto de cada toggle ("Aparecer no marketplace" / "Receber pedidos").
export async function acceptMarketplaceConsent(kind: "marketplace_listing" | "marketplace_requests"): Promise<ConsentState> {
  const supabase = await createClient();
  const evidence = await buildEvidence(kind, {}, { method: "driver_self" });
  const { error } = await supabase.rpc("accept_driver_consent", { p_kind: kind, p_consent: evidence });
  if (error) return { error: error.message };
  return { error: null };
}

// Retira o aceite ativo da vitrine (ao desligar o toggle).
export async function withdrawMarketplaceConsent(kind: "marketplace_listing" | "marketplace_requests"): Promise<void> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: c } = await supabase
    .from("consents")
    .select("id")
    .eq("kind", kind)
    .eq("subject_user_id", auth.user?.id ?? "")
    .is("revoked_at", null)
    .maybeSingle();
  if (c?.id) await supabase.rpc("revoke_consent", { p_consent_id: c.id, p_ip: clientIp(await headers()) });
}
