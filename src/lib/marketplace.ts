import { createClient } from "@/lib/supabase/server";

// Acesso à vitrine pública. TUDO passa por `marketplace_listing` /
// `marketplace_filter_options` (funções SECURITY DEFINER com whitelist de colunas):
// filtro e paginação acontecem no banco — nunca se traz a lista inteira.
export const PAGE_SIZE = 10;

export type Shift = "morning" | "afternoon" | "integral";
export const SHIFTS: Shift[] = ["morning", "afternoon", "integral"];
export const SHIFT_LABEL: Record<Shift, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  integral: "Integral",
};

export interface Driver {
  public_id: string;
  driver_name: string;
  van_photo_path: string;
  van_model: string;
  spots_available: number;
  price_min_cents: number;
  price_max_cents: number;
  phone: string | null; // só no modo perfil
  service_cities: string;
  service_neighborhoods: string;
  service_schools: string;
  age_min: number;
  age_max: number;
  service_shifts: Shift[];
  total_count: number;
}

export interface Filters {
  city: string;
  neighborhood: string;
  school: string;
  age: number | null;
  shift: Shift | null;
}

export interface FilterOptions {
  city: string[];
  neighborhood: string[];
  school: string[];
}

type Params = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 80) ?? "";
}

export function parseFilters(sp: Params): Filters {
  const ageRaw = one(sp.idade);
  const age = /^\d{1,2}$/.test(ageRaw) ? Number(ageRaw) : null;
  const shiftRaw = one(sp.turno);
  return {
    city: one(sp.cidade),
    neighborhood: one(sp.bairro),
    school: one(sp.escola),
    age: age !== null && age <= 30 ? age : null,
    shift: SHIFTS.includes(shiftRaw as Shift) ? (shiftRaw as Shift) : null,
  };
}

export function parsePage(sp: Params): number {
  const n = Number(one(sp.pagina));
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

export async function searchDrivers(filters: Filters, page: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("marketplace_listing", {
    p_city: filters.city || null,
    p_neighborhood: filters.neighborhood || null,
    p_school: filters.school || null,
    p_child_age: filters.age,
    p_shift: filters.shift,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) return { drivers: [] as Driver[], total: 0, error: true };
  const drivers = (data ?? []) as Driver[];
  return { drivers, total: drivers[0]?.total_count ?? 0, error: false };
}

export async function getDriver(publicId: string): Promise<Driver | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("marketplace_listing", {
    p_public_id: publicId,
    p_limit: 1,
  });
  return ((data ?? []) as Driver[])[0] ?? null;
}

export async function getFilterOptions(): Promise<FilterOptions> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("marketplace_filter_options");
  const out: FilterOptions = { city: [], neighborhood: [], school: [] };
  for (const o of (data ?? []) as { kind: keyof FilterOptions; value: string }[]) {
    out[o.kind]?.push(o.value);
  }
  return out;
}

export async function vanPhotoUrl(path: string): Promise<string> {
  const supabase = await createClient();
  return supabase.storage.from("van-photos").getPublicUrl(path).data.publicUrl;
}

// Trechos de um campo de texto livre (mesmo critério do banco: , ; ou quebra de linha).
export function splitList(text: string): string[] {
  return text
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// wa.me exige o número com código do país; os cadastros vêm sem (10–11 dígitos).
export function whatsappUrl(phone: string, driverName: string): string {
  const digits = phone.replace(/\D/g, "");
  const full = digits.length <= 11 ? `55${digits}` : digits;
  const text = `Olá, ${driverName}! Vi seu perfil no Kangu e tenho interesse em uma vaga.`;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}
