"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Admin: remove a foto da van (zera o caminho e enfileira o arquivo; a função do banco recusa quem não é admin).
export async function removeVanPhotoAction(userId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_remove_van_photo", { p_user_id: userId });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/moderacao");
}
