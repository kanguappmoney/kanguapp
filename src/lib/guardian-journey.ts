import type { SupabaseClient } from "@supabase/supabase-js";
import type { Journey } from "@/components/JourneyTimeline";

export interface LivePosition {
  lat: number;
  lng: number;
  heading: number | null;
}

// Jornada ativa do responsável (Início e Rotas > Hoje usam a MESMA leitura).
// G5/G6/G4: tudo vem de get_active_journey (só filhos vinculados, sem paradas) e da RLS de
// `live_positions` (só com execução in_progress e motorista em modo 'map'). O app não decide nada.
export async function getGuardianJourney(supabase: SupabaseClient): Promise<{
  journey: Journey | null;
  livePos: LivePosition | null;
  mapToken: string;
}> {
  const { data } = await supabase.rpc("get_active_journey");
  const journey = (data as Journey | null) ?? null;
  const mapToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  let livePos: LivePosition | null = null;
  if (journey?.execution_id) {
    const { data: pos } = await supabase
      .from("live_positions")
      .select("lat, lng, heading")
      .eq("execution_id", journey.execution_id)
      .maybeSingle();
    livePos = pos;
  }
  return { journey, livePos, mapToken };
}
