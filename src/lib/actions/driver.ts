"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { brlToCents } from "@/lib/money";

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
  const prefix = String(formData.get("prefix") ?? "").trim();
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
  if (!prefix) missing.push("Prefixo");
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

  // Marketplace (Frente C). Tudo opcional; texto livre sem normalizar (decisão da R11).
  const text = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : v;
  };
  const intOrNull = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : Number(v);
  };
  const age_min = intOrNull("age_min");
  const age_max = intOrNull("age_max");
  for (const a of [age_min, age_max])
    if (a !== null && (!Number.isInteger(a) || a < 0 || a > 30))
      return { error: "Faixa etária inválida (0 a 30 anos)." };
  if (age_min !== null && age_max !== null && age_min > age_max)
    return { error: "Idade mínima maior que a máxima." };

  const priceField = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? { cents: null, bad: false } : { cents: brlToCents(v), bad: brlToCents(v) === null };
  };
  const pMin = priceField("price_min");
  const pMax = priceField("price_max");
  if (pMin.bad || pMax.bad) return { error: "Faixa de preço inválida." };
  if (pMin.cents !== null && pMax.cents !== null && pMin.cents > pMax.cents)
    return { error: "Preço mínimo maior que o máximo." };

  const SHIFTS = ["morning", "afternoon", "integral"];
  const service_shifts = formData
    .getAll("service_shifts")
    .map(String)
    .filter((s, i, arr) => SHIFTS.includes(s) && arr.indexOf(s) === i);

  const { error: dErr } = await supabase
    .from("driver_profiles")
    .update({
      address,
      subscription_status,
      service_cities: text("service_cities"),
      service_neighborhoods: text("service_neighborhoods"),
      age_min,
      age_max,
      service_shifts,
      price_min_cents: pMin.cents,
      price_max_cents: pMax.cents,
      marketplace_listed: formData.get("marketplace_listed") === "on",
    })
    .eq("user_id", user.id);
  if (dErr) return { error: dErr.message };

  // Escolas atendidas: fonte única = driver_schools; a função grava também `service_schools` (texto da
  // Frente C que o marketplace lê) na mesma transação. Só roda quando o seletor terminou de carregar.
  if (formData.get("school_sync") === "1") {
    const codes = String(formData.get("school_codes") ?? "")
      .split(",")
      .map((c) => Number(c.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    let extra: string[] = [];
    try {
      const parsed = JSON.parse(String(formData.get("school_extra") ?? "[]"));
      if (Array.isArray(parsed)) extra = parsed.filter((x): x is string => typeof x === "string").slice(0, 50);
    } catch {
      /* ignora: sem extras */
    }
    const { error: sErr } = await supabase.rpc("set_my_schools", { p_codes: codes, p_extra: extra });
    if (sErr) return { error: sErr.message };
  }

  // Veículo primário: upsert (um por motorista no v1).
  const { data: existing } = await supabase
    .from("vehicles")
    .select("id")
    .eq("driver_id", user.id)
    .limit(1)
    .maybeSingle();

  const vehicle = { label: `${model} ${plate}`.trim(), prefix, plate, model, year, color, capacity };
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

// Grava o caminho da foto da van (bucket PÚBLICO van-photos; RLS dono-only na escrita).
export async function setVanPhoto(photoPath: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  // O caminho precisa estar na pasta do próprio motorista (nunca apontar p/ foto alheia).
  if (!photoPath.startsWith(`${user.id}/`)) return;
  await supabase
    .from("driver_profiles")
    .update({ van_photo_path: photoPath })
    .eq("user_id", user.id);
  revalidatePath("/motorista/perfil");
  revalidatePath("/motorista/perfil/editar");
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
