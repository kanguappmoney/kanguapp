"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
