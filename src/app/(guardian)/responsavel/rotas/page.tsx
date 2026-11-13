import { createClient } from "@/lib/supabase/server";
import { AppHeader, SectionTitle } from "@/components/ui";
import { GuardianJourneyCard } from "@/components/GuardianJourneyCard";
import { getGuardianJourney } from "@/lib/guardian-journey";

export default async function RotasResponsavelPage() {
  const supabase = await createClient();
  // "Hoje" mostra a jornada ativa (mesma leitura e mesmo cartão do Início). G4: fora da rota, estado inativo.
  const { journey, livePos, mapToken } = await getGuardianJourney(supabase);

  return (
    <>
      <AppHeader title="Rotas" subtitle="Hoje • Próximas • Histórico" />
      <div className="px-4 pb-6">
        <SectionTitle>Hoje</SectionTitle>
        <GuardianJourneyCard journey={journey} livePos={livePos} mapToken={mapToken} />
      </div>
    </>
  );
}
