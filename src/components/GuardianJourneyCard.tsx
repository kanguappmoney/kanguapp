import { Card } from "@/components/ui";
import { JourneyTimeline, type Journey } from "@/components/JourneyTimeline";
import { AutoRefresh } from "@/components/AutoRefresh";
import { LiveMapLoader } from "@/components/LiveMapLoader";
import type { LivePosition } from "@/lib/guardian-journey";

// "Agora" do responsável: Modo Mapa (só o pino da van, sem paradas — G5), Linha do tempo (G6) ou o
// estado inativo (G4). Compartilhado entre Início e Rotas > Hoje. Fora do horário também se atualiza
// sozinho (30 s, pausa em segundo plano) para a rota aparecer assim que o motorista iniciar.
export function GuardianJourneyCard({
  journey,
  livePos,
  mapToken,
}: {
  journey: Journey | null;
  livePos: LivePosition | null;
  mapToken: string;
}) {
  // Sem token configurado, cai graciosamente na Linha do tempo (nada de mapa quebrado).
  const showMap = Boolean(journey && livePos && mapToken);

  if (!journey) {
    return (
      <>
        <Card tone="cream">
          <p className="font-semibold text-navy-900">Fora do horário de rota</p>
          <p className="text-sm text-navy-700/60">
            A localização só aparece durante o trajeto. Você verá a jornada aqui
            quando a rota começar.
          </p>
        </Card>
        <AutoRefresh seconds={30} />
      </>
    );
  }

  if (showMap && livePos) {
    return (
      <>
        <LiveMapLoader
          token={mapToken}
          lat={livePos.lat}
          lng={livePos.lng}
          heading={livePos.heading}
        />
        <p className="mt-2 text-sm text-navy-700/60">
          A van está a caminho — posição atualizando ao vivo.
        </p>
        <AutoRefresh seconds={10} />
      </>
    );
  }

  return (
    <>
      <JourneyTimeline journey={journey} />
      <AutoRefresh seconds={15} />
    </>
  );
}
