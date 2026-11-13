import Link from "next/link";
import { CalendarOff, ChevronRight, Bell } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppHeader, Card, SectionTitle } from "@/components/ui";
import { IconBadge, StatusPill } from "@/components/patterns";
import { GuardianJourneyCard } from "@/components/GuardianJourneyCard";
import { getGuardianJourney } from "@/lib/guardian-journey";

export default async function GuardianHome() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  // Jornada ativa (Linha do tempo/Mapa, G4/G5/G6): leitura compartilhada com Rotas > Hoje.
  const { journey, livePos, mapToken } = await getGuardianJourney(supabase);

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
          <Card tone="cream" className="mt-4">
            <p className="font-semibold text-navy-900">Cadastro em análise</p>
            <p className="mt-1 text-sm text-navy-700/70">
              {pendingSubs!.length === 1
                ? `${pendingSubs![0].child_full_name} está aguardando a aprovação do motorista.`
                : `${pendingSubs!.length} cadastros aguardando a aprovação do motorista.`}
            </p>
          </Card>
        )}

        <SectionTitle>Agora</SectionTitle>
        <GuardianJourneyCard journey={journey} livePos={livePos} mapToken={mapToken} />

        <Link
          href="/responsavel/avisos"
          className="mt-4 flex items-center gap-3 rounded-2xl border border-navy-900/10 bg-white p-4"
        >
          <span className="relative">
            <IconBadge icon={Bell} />
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
          <IconBadge icon={CalendarOff} />
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
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy-900">{c.full_name}</p>
                  {c.school && (
                    <p className="text-sm text-navy-700/60">{c.school}</p>
                  )}
                </div>
                {(() => {
                  // Estado de hoje, só com jornada ativa (os agregados do próprio filho — G5).
                  const st = journey?.children.find((j) => j.name === c.full_name)?.state;
                  if (st === "boarded") return <StatusPill tone="done">Na van</StatusPill>;
                  if (st === "absent") return <StatusPill tone="neutral">Ausente</StatusPill>;
                  if (st === "waiting") return <StatusPill tone="neutral">Aguardando</StatusPill>;
                  return null;
                })()}
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
