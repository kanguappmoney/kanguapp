import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppHeader, Card, SectionTitle } from "@/components/ui";

export default async function GuardianHome() {
  const user = await getCurrentUser();
  const supabase = await createClient();

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
        {/* G4 — estado default fora da janela de rota: sem mapa ao vivo. */}
        <SectionTitle>Agora</SectionTitle>
        <Card>
          <p className="font-semibold text-navy-900">Fora do horário de rota</p>
          <p className="text-sm text-navy-700/60">
            A localização só aparece durante o trajeto. Próxima rota prevista:
            a definir.
          </p>
        </Card>

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
