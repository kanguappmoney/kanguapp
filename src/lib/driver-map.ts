import { createClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/lib/geocode";

// Mapa estático da home OCIOSA (nenhuma perna rodando): centrado no endereço
// cadastrado do motorista, geocodificado. NÃO usa GPS — a G4 proíbe rastreio
// fora de uma execução in_progress, então a home idle nunca liga o GPS. Só um
// <img> (Static Images API). Sem endereço/token ou geocoding falho → null (a
// home mostra a mensagem sem mapa; nunca quebra).
export async function getDriverHomeMapUrl(token: string): Promise<string | null> {
  if (!token) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("driver_profiles")
    .select("address")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();
  if (!profile?.address) return null;

  const c = await geocodeAddress(profile.address, token);
  if (!c) return null;

  const marker = `pin-l-home+0D1B3D(${c.lng},${c.lat})`; // casa do motorista (navy)
  return (
    `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/` +
    `${marker}/${c.lng},${c.lat},13,0/640x320@2x?access_token=${token}`
  );
}
