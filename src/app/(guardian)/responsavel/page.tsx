import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppHeader, Card, SectionTitle } from "@/components/ui";
import { JourneyTimeline, type Journey } from "@/components/JourneyTimeline";
import { AutoRefresh } from "@/components/AutoRefresh";

export default async function GuardianHome() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  // Jornada ativa (Linha do tempo, G6). Agregados anônimos + filhos próprios.
  const { data: journeyData } = await supabase.rpc("get_active_journey");
  const journey = journeyData as Journey | null;

  // RLS retorna só os alunos vinculados a este responsável.
  const { data: children } = await supabase
    .from("students")
    .select("id, full_name, school")
    .eq("status", "active")
    .order("full_name");

  return (
    <>
      <AppHeader
        title={`Olá, ${user?.fullName.split(" ")[0] ?? ""}`}
        subtitle="Acompanhamento da jornada"
        showSignOut
      />
      <div className="px-4 pb-6">
        <SectionTitle>Agora</SectionTitle>
        {journey ? (
          <>
            <JourneyTimeline journey={journey} />
            <AutoRefresh seconds={15} />
          </>
        ) : (
          // G4 — estado default fora da janela de rota: sem localização ao vivo.
          <Card>
            <p className="font-semibold text-navy-900">Fora do horário de rota</p>
            <p className="text-sm text-navy-700/60">
              A localização só aparece durante o trajeto. Você verá a jornada aqui
              quando a rota começar.
            </p>
          </Card>
        )}

        <SectionTitle>Seus filhos</SectionTitle>
        {children?.length ? (
          <div className="space-y-2">
            {children.map((c) => (
              <Card key={c.id}>
                <p className="font-semibold text-navy-900">{c.full_name}</p>
                {c.school && (
                  <p className="text-sm text-navy-700/60">{c.school}</p>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed text-center text-sm text-navy-700/60">
            Nenhuma criança vinculada ainda. Use o link de convite do motorista.
          </Card>
        )}
      </div>
    </>
  );
}
