"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  revalidatePath("/motorista/perfil/marketplace");
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
