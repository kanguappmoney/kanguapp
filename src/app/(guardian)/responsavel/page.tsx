import Link from "next/link";
import { CalendarOff, ChevronRight, Bell } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppHeader, Card, SectionTitle } from "@/components/ui";
import { JourneyTimeline, type Journey } from "@/components/JourneyTimeline";
import { AutoRefresh } from "@/components/AutoRefresh";
import { LiveMapLoader } from "@/components/LiveMapLoader";

export default async function GuardianHome() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  // Jornada ativa (Linha do tempo, G6). Agregados anônimos + filhos próprios.
  const { data: journeyData } = await supabase.rpc("get_active_journey");
  const journey = journeyData as Journey | null;

  // Modo Mapa (G4/G6): a posição da van só vem da RLS `guardian_can_see_live_position`
  // (execução in_progress E motorista em modo 'map'). Se vier linha, é modo Mapa;
  // senão cai na Linha do tempo. É a RLS que decide, não o app.
  const mapToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  let livePos: {
    lat: number;
    lng: number;
    heading: number | null;
  } | null = null;
  if (journey?.execution_id) {
    const { data } = await supabase
      .from("live_positions")
      .select("lat, lng, heading")
      .eq("execution_id", journey.execution_id)
      .maybeSingle();
    livePos = data;
  }
  // Sem token configurado, cai graciosamente na Linha do tempo (nada de mapa quebrado).
  const showMap = Boolean(journey && livePos && mapToken);

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

  // Avisos não-lidos (contador no acesso à tela de avisos).
  const { count: unread } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  // Cadastros enviados por link de captação, aguardando aprovação do motorista.
  // RLS entrega só as submissões deste responsável (G5).
  const { data: pendingSubs } = await supabase
    .from("capture_submissions")
    .select("id, child_full_name")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return (
    <>
      <AppHeader
        title={`Olá, ${user?.fullName.split(" ")[0] ?? ""}`}
        subtitle="Acompanhamento da jornada"
        showSignOut
      />
      <div className="px-4 pb-6">
        {(pendingSubs?.length ?? 0) > 0 && (
          <Card className="mt-4 border-amber-200 bg-amber-50">
            <p className="font-semibold text-amber-900">Cadastro em análise</p>
            <p className="mt-1 text-sm text-amber-800/80">
              {pendingSubs!.length === 1
                ? `${pendingSubs![0].child_full_name} está aguardando a aprovação do motorista.`
                : `${pendingSubs!.length} cadastros aguardando a aprovação do motorista.`}
            </p>
          </Card>
        )}

        <SectionTitle>Agora</SectionTitle>
        {journey ? (
          showMap && livePos ? (
            // Modo Mapa: só o pino da van se movendo (sem paradas — G5).
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
          ) : (
            <>
              <JourneyTimeline journey={journey} />
              <AutoRefresh seconds={15} />
            </>
          )
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

        <Link
          href="/responsavel/avisos"
          className="mt-4 flex items-center gap-3 rounded-2xl border border-navy-900/10 bg-white p-4"
        >
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-yellow-400/20 text-navy-900">
            <Bell className="h-5 w-5" />
            {(unread ?? 0) > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unread}
              </span>
            )}
          </span>
          <div className="flex-1">
            <p className="font-semibold text-navy-900">Avisos</p>
            <p className="text-sm text-navy-700/60">
              {(unread ?? 0) > 0
                ? `${unread} ${unread === 1 ? "novo aviso" : "novos avisos"}`
                : "Novidades da rota"}
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-navy-700/40" />
        </Link>

        <Link
          href="/responsavel/ausencias"
          className="mt-3 flex items-center gap-3 rounded-2xl border border-navy-900/10 bg-white p-4"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-400/20 text-navy-900">
            <CalendarOff className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="font-semibold text-navy-900">Informar ausência</p>
            <p className="text-sm text-navy-700/60">
              Avise quando seu filho não for
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-navy-700/40" />
        </Link>

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
