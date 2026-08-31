"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type DriverFormState = { error: string | null };

// Edita o perfil do motorista: dados pessoais (users), endereço (driver_profiles)
// e o veículo (upsert do veículo primário). E-mail não é editável aqui (é auth).
export async function updateDriverProfile(
  _prev: DriverFormState,
  formData: FormData,
): Promise<DriverFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const full_name = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const plate = String(formData.get("plate") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const yearRaw = String(formData.get("year") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  const capacityRaw = String(formData.get("capacity") ?? "").trim();

  // Obrigatórios essenciais.
  const missing: string[] = [];
  if (!full_name) missing.push("Nome");
  if (!phone) missing.push("Telefone");
  if (!address) missing.push("Endereço");
  if (!plate) missing.push("Placa");
  if (!model) missing.push("Modelo");
  if (!yearRaw) missing.push("Ano");
  if (!color) missing.push("Cor");
  if (!capacityRaw) missing.push("Vagas");
  if (missing.length)
    return { error: `Preencha: ${missing.join(", ")}.` };

  const year = Number(yearRaw);
  const capacity = Number(capacityRaw);
  if (!Number.isInteger(year) || year < 1980 || year > 2100)
    return { error: "Ano do veículo inválido." };
  if (!Number.isInteger(capacity) || capacity < 1)
    return { error: "Número de vagas inválido." };

  // Dados pessoais.
  const { error: uErr } = await supabase
    .from("users")
    .update({ full_name, phone })
    .eq("id", user.id);
  if (uErr) return { error: uErr.message };

  // Endereço + status da assinatura (campo manual; fluxo 1 fora do app).
  const subRaw = String(formData.get("subscription_status") ?? "trial");
  const subscription_status =
    subRaw === "active" || subRaw === "paused" ? subRaw : "trial";

  const { error: dErr } = await supabase
    .from("driver_profiles")
    .update({ address, subscription_status })
    .eq("user_id", user.id);
  if (dErr) return { error: dErr.message };

  // Veículo primário: upsert (um por motorista no v1).
  const { data: existing } = await supabase
    .from("vehicles")
    .select("id")
    .eq("driver_id", user.id)
    .limit(1)
    .maybeSingle();

  const vehicle = { label: `${model} ${plate}`.trim(), plate, model, year, color, capacity };
  const { error: vErr } = existing
    ? await supabase.from("vehicles").update(vehicle).eq("id", existing.id)
    : await supabase.from("vehicles").insert({ driver_id: user.id, ...vehicle });
  if (vErr) return { error: vErr.message };

  revalidatePath("/motorista/perfil");
  redirect("/motorista/perfil");
}

// Grava o caminho da foto do motorista (upload feito pelo cliente autenticado;
// RLS do bucket driver-photos só deixa o próprio dono subir).
export async function setDriverPhoto(photoPath: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("driver_profiles")
    .update({ photo_path: photoPath })
    .eq("user_id", user.id);
  revalidatePath("/motorista/perfil");
}

// G6 — motorista escolhe como os pais dele acompanham a rota.
// Persiste em driver_profiles.parent_tracking_mode; a RLS faz o resto
// (modo 'timeline' nunca entrega live_positions ao pai).
export async function setParentTrackingMode(mode: "map" | "timeline") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("driver_profiles")
    .update({ parent_tracking_mode: mode })
    .eq("user_id", user.id);

  revalidatePath("/motorista/perfil");
}
