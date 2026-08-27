"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
