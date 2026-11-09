"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { brlToCents } from "@/lib/money";

// Salvar POR TELA de Configurações: cada categoria grava só os campos dela. Depois de salvar, volta à lista.
export type SettingsFormState = { error: string | null };

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function done(): never {
  revalidatePath("/motorista/perfil");
  redirect("/motorista/perfil");
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

// Meu perfil: nome e telefone (users) + endereço residencial (driver_profiles). E-mail não é editável (é auth).
export async function saveMyProfile(_p: SettingsFormState, fd: FormData): Promise<SettingsFormState> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Sessão expirada." };
  const full_name = str(fd, "full_name");
  const phone = str(fd, "phone");
  const address = str(fd, "address");
  const missing = [!full_name && "Nome", !phone && "Telefone", !address && "Endereço"].filter(Boolean);
  if (missing.length) return { error: `Preencha: ${missing.join(", ")}.` };

  const { error: uErr } = await supabase.from("users").update({ full_name, phone }).eq("id", user.id);
  if (uErr) return { error: uErr.message };
  const { error: dErr } = await supabase.from("driver_profiles").update({ address }).eq("user_id", user.id);
  if (dErr) return { error: dErr.message };
  done();
}

// Veículo primário: upsert (um por motorista no v1).
export async function saveVehicle(_p: SettingsFormState, fd: FormData): Promise<SettingsFormState> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Sessão expirada." };
  const prefix = str(fd, "prefix");
  const plate = str(fd, "plate");
  const model = str(fd, "model");
  const yearRaw = str(fd, "year");
  const color = str(fd, "color");
  const capacityRaw = str(fd, "capacity");
  const missing = [
    !prefix && "Prefixo",
    !plate && "Placa",
    !model && "Modelo",
    !yearRaw && "Ano",
    !color && "Cor",
    !capacityRaw && "Vagas",
  ].filter(Boolean);
  if (missing.length) return { error: `Preencha: ${missing.join(", ")}.` };
  const year = Number(yearRaw);
  const capacity = Number(capacityRaw);
  if (!Number.isInteger(year) || year < 1980 || year > 2100) return { error: "Ano do veículo inválido." };
  if (!Number.isInteger(capacity) || capacity < 1) return { error: "Número de vagas inválido." };

  const { data: existing } = await supabase.from("vehicles").select("id").eq("driver_id", user.id).limit(1).maybeSingle();
  const vehicle = { label: `${model} ${plate}`.trim(), prefix, plate, model, year, color, capacity };
  const { error } = existing
    ? await supabase.from("vehicles").update(vehicle).eq("id", existing.id)
    : await supabase.from("vehicles").insert({ driver_id: user.id, ...vehicle });
  if (error) return { error: error.message };
  done();
}

// Acompanhamento (G6): como os pais acompanham a rota. A RLS garante que 'timeline' nunca entrega a posição.
export async function saveTracking(_p: SettingsFormState, fd: FormData): Promise<SettingsFormState> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Sessão expirada." };
  const mode = str(fd, "mode") === "timeline" ? "timeline" : "map";
  const { error } = await supabase.from("driver_profiles").update({ parent_tracking_mode: mode }).eq("user_id", user.id);
  if (error) return { error: error.message };
  done();
}

// Assinatura (campo manual; a cobrança é fora do app no piloto).
export async function saveSubscription(_p: SettingsFormState, fd: FormData): Promise<SettingsFormState> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Sessão expirada." };
  const raw = str(fd, "subscription_status");
  const subscription_status = raw === "active" || raw === "paused" ? raw : "trial";
  const { error } = await supabase.from("driver_profiles").update({ subscription_status }).eq("user_id", user.id);
  if (error) return { error: error.message };
  done();
}

function numberList(raw: string): number[] {
  return raw
    .split(",")
    .map((c) => Number(c.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}
function stringList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, 50) : [];
  } catch {
    return [];
  }
}

// Marketplace: cidades, faixa etária, turnos, preço, toggle + escolas e bairros (driver_schools /
// driver_neighborhoods, que gravam também os textos service_schools / service_neighborhoods).
export async function saveMarketplace(_p: SettingsFormState, fd: FormData): Promise<SettingsFormState> {
  const { supabase, user } = await authed();
  if (!user) return { error: "Sessão expirada." };

  const text = (k: string) => {
    const v = str(fd, k);
    return v === "" ? null : v;
  };
  const intOrNull = (k: string) => {
    const v = str(fd, k);
    return v === "" ? null : Number(v);
  };
  const age_min = intOrNull("age_min");
  const age_max = intOrNull("age_max");
  for (const a of [age_min, age_max])
    if (a !== null && (!Number.isInteger(a) || a < 0 || a > 30)) return { error: "Faixa etária inválida (0 a 30 anos)." };
  if (age_min !== null && age_max !== null && age_min > age_max) return { error: "Idade mínima maior que a máxima." };

  const price = (k: string) => {
    const v = str(fd, k);
    return v === "" ? { cents: null as number | null, bad: false } : { cents: brlToCents(v), bad: brlToCents(v) === null };
  };
  const pMin = price("price_min");
  const pMax = price("price_max");
  if (pMin.bad || pMax.bad) return { error: "Faixa de preço inválida." };
  if (pMin.cents !== null && pMax.cents !== null && pMin.cents > pMax.cents) return { error: "Preço mínimo maior que o máximo." };

  const SHIFTS = ["morning", "afternoon", "integral"];
  const service_shifts = fd
    .getAll("service_shifts")
    .map(String)
    .filter((s, i, arr) => SHIFTS.includes(s) && arr.indexOf(s) === i);

  const { error: dErr } = await supabase
    .from("driver_profiles")
    .update({
      service_cities: text("service_cities"),
      age_min,
      age_max,
      service_shifts,
      price_min_cents: pMin.cents,
      price_max_cents: pMax.cents,
      marketplace_listed: fd.get("marketplace_listed") === "on",
    })
    .eq("user_id", user.id);
  if (dErr) return { error: dErr.message };

  // Só quando o seletor terminou de carregar (senão não mexe nas listas salvas).
  if (fd.get("school_sync") === "1") {
    const { error } = await supabase.rpc("set_my_schools", {
      p_codes: numberList(str(fd, "school_codes")),
      p_extra: stringList(str(fd, "school_extra")),
    });
    if (error) return { error: error.message };
  }
  if (fd.get("hood_sync") === "1") {
    const { error } = await supabase.rpc("set_my_neighborhoods", {
      p_ids: numberList(str(fd, "hood_ids")),
      p_extra: stringList(str(fd, "hood_extra")),
    });
    if (error) return { error: error.message };
  }
  done();
}
