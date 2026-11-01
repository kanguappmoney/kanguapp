import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface DriverHeaderData {
  firstName: string;
  avatarUrl: string | null;
  unread: number;
}

// Dados do cabeçalho fixo do motorista (avatar → Configurações + sininho).
// Fonte única para a home e as telas com AppHeader; `cache` deduplica as
// leituras dentro da mesma requisição.
export const getDriverHeader = cache(async (): Promise<DriverHeaderData> => {
  const user = await getCurrentUser();
  const supabase = await createClient();

  // Foto do motorista (URL assinada, bucket privado).
  let avatarUrl: string | null = null;
  const { data: profile } = await supabase
    .from("driver_profiles")
    .select("photo_path")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();
  if (profile?.photo_path) {
    const { data } = await supabase.storage
      .from("driver-photos")
      .createSignedUrl(profile.photo_path, 3600);
    avatarUrl = data?.signedUrl ?? null;
  }

  // Não-lidas do sininho. Mesma tabela dos avisos do pai: RLS
  // (notifications_select_self) entrega só as do próprio motorista.
  const { count: unread } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  return {
    firstName: user?.fullName.split(" ")[0] ?? "",
    avatarUrl,
    unread: unread ?? 0,
  };
});
