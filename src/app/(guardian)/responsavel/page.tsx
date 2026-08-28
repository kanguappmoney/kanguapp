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
    .select("id, full_name, school, photo_path")
    .eq("status", "active")
    .order("full_name");

  // Foto por URL assinada (bucket privado). A RLS já libera a leitura ao
  // responsável vinculado — se não tiver foto, cai no placeholder.
  const childrenWithPhoto = await Promise.all(
    (children ?? []).map(async (c) => {
      let photoUrl: string | null = null;
      if (c.photo_path) {
        const { data } = await supabase.storage
          .from("student-photos")
          .createSignedUrl(c.photo_path, 3600);
        photoUrl = data?.signedUrl ?? null;
      }
      return { ...c, photoUrl };
    }),
  );

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
        {childrenWithPhoto.length ? (
          <div className="space-y-2">
            {childrenWithPhoto.map((c) => (
              <Card key={c.id} className="flex items-center gap-3">
                <ChildAvatar url={c.photoUrl} name={c.full_name} />
                <div>
                  <p className="font-semibold text-navy-900">{c.full_name}</p>
                  {c.school && (
                    <p className="text-sm text-navy-700/60">{c.school}</p>
                  )}
                </div>
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

// Foto do filho (URL assinada) ou placeholder neutro com as iniciais.
function ChildAvatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className="h-11 w-11 shrink-0 rounded-full object-cover"
      />
    );
  }
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy-900/10 text-sm font-semibold text-navy-700/70">
      {initials}
    </div>
  );
}
