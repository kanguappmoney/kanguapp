import { createClient } from "@/lib/supabase/server";

// Leitura da área /admin. TODA consulta passa por funções admin_* do banco, que recusam
// (42501) quem não está na allowlist — a barreira real é o banco; o middleware e o layout
// de /admin só evitam chegar até aqui. Nenhuma query direta em tabela.
export interface AdminDriver {
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  profile_complete: boolean;
  missing_fields: string | null;
  subscription_status: "active" | "trial" | "paused";
  marketplace_listed: boolean;
  visible_on_marketplace: boolean;
  active_students: number;
  open_requests: boolean;
}

export interface AdminGuardian {
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  terms_accepted_at: string | null;
  linked_students: number;
  pending_requests: number;
}

export type SubmissionStatus = "pending" | "approved" | "rejected";

export interface AdminSubmission {
  id: string;
  created_at: string;
  reviewed_at: string | null;
  status: SubmissionStatus;
  link_kind: "scoped" | "generic";
  driver_name: string;
  guardian_name: string;
  guardian_email: string | null;
  child_name: string;
  school: string | null;
  shift: "morning" | "afternoon" | "integral" | null;
  total_count: number;
}

export interface AdminSearchLog {
  created_at: string;
  city: string | null;
  neighborhood: string | null;
  school: string | null;
  child_age: number | null;
  shift: "morning" | "afternoon" | "integral" | null;
  total_count: number;
}

export const ADMIN_PAGE_SIZE = 50;

type Result<T> = { rows: T[]; error: string | null };

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<Result<T>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as T[], error: null };
}

export interface AdminTrial {
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  days_as_trial: number;
  profile_complete: boolean;
  active_students: number;
  visible_on_marketplace: boolean;
}

export const listTrials = () => call<AdminTrial>("admin_list_trials");

export const listDrivers = () => call<AdminDriver>("admin_list_drivers");
export const listGuardians = () => call<AdminGuardian>("admin_list_guardians");

export function listSubmissions(status: SubmissionStatus | null, page: number) {
  return call<AdminSubmission>("admin_list_submissions", {
    p_status: status,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: (page - 1) * ADMIN_PAGE_SIZE,
  });
}

export function listSearchLog(page: number) {
  return call<AdminSearchLog>("admin_list_search_log", {
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: (page - 1) * ADMIN_PAGE_SIZE,
  });
}

export const SHIFT_LABEL = { morning: "Manhã", afternoon: "Tarde", integral: "Integral" } as const;

// Data e hora no fuso de São Paulo (o servidor roda em UTC).
export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function pageParam(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

// --- Visão Geral (admin_overview: um jsonb só com agregados) -----------------
export interface AdminOverview {
  period_days: 7 | 30;
  drivers_total: number;
  drivers_by_status: { trial: number; active: number; paused: number };
  profile_complete: number;
  listed_visible: number;
  guardians_total: number;
  guardians_active: number;
  students_active: number;
  series: { label: string; drivers: number; guardians: number; students: number }[];
  funnel: { searches: number; requests: number; approved: number; rejected: number; pending: number };
  top_cities: { label: string; count: number }[];
  top_schools: { label: string; count: number }[];
}

export async function getOverview(days: 7 | 30): Promise<{ data: AdminOverview | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_overview", { p_days: days });
  if (error) return { data: null, error: error.message };
  return { data: data as AdminOverview, error: null };
}
