import Link from "next/link";
import {
  ShieldCheck,
  Users,
  Route as RouteIcon,
  Car,
  Phone,
  Mail,
  MapPin,
  Pencil,
  Bell,
  MessageCircle,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppHeader, Card, SectionTitle } from "@/components/ui";
import { TrackingModeToggle } from "@/components/TrackingModeToggle";
import { centsToBRL } from "@/lib/money";
import { OpenRequestsToggle } from "@/components/OpenRequestsToggle";
import { DriverPhotoUploader } from "@/components/DriverPhotoUploader";
import { DriverActions } from "@/components/DriverHeaderActions";
import { getDriverHeader } from "@/lib/driver-header";
import { signOut } from "@/lib/actions/auth";

// WhatsApp do suporte: número completo com código do país (55) + DDD, só dígitos.
// O link vira https://wa.me/<número>.
const SUPPORT_WHATSAPP_NUMBER = "5511953790054";
const SUPPORT_EMAIL = "house@domhub.co";

// Configurações do motorista (era "Perfil" no menu — mesmo conteúdo no topo:
// dados pessoais, veículo, foto, assinatura, G6; abaixo, Notificações, Suporte
// e Sair). A rota segue /motorista/perfil.
export default async function PerfilMotoristaPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("driver_profiles")
    .select(
      "parent_tracking_mode, verification, address, photo_path, subscription_status, marketplace_listed, van_photo_path, service_cities, price_min_cents, price_max_cents",
    )
    .eq("user_id", user!.id)
    .single();

  const { data: userRow } = await supabase
    .from("users")
    .select("phone")
    .eq("id", user!.id)
    .single();

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("prefix, plate, model, year, color, capacity")
    .eq("driver_id", user!.id)
    .limit(1)
    .maybeSingle();

  const { count: alunos } = await supabase
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");
  const { count: rotas } = await supabase
    .from("routes")
    .select("id", { count: "exact", head: true });

  let photoUrl: string | null = null;
  if (profile?.photo_path) {
    const { data } = await supabase.storage
      .from("driver-photos")
      .createSignedUrl(profile.photo_path, 3600);
    photoUrl = data?.signedUrl ?? null;
  }

  const { count: openRequestLinks } = await supabase
    .from("capture_links")
    .select("id", { count: "exact", head: true })
    .eq("kind", "generic")
    .eq("status", "active");
  const openRequests = (openRequestLinks ?? 0) > 0;

  const mode = (profile?.parent_tracking_mode ?? "map") as "map" | "timeline";
  const verified = profile?.verification === "verified";
  const SUB: Record<string, { label: string; cls: string }> = {
    active: { label: "Assinatura ativa", cls: "bg-green-100 text-green-800" },
    trial: { label: "Trial", cls: "bg-yellow-400/20 text-navy-900" },
    paused: { label: "Assinatura pausada", cls: "bg-red-100 text-red-800" },
  };
  const sub = SUB[profile?.subscription_status ?? "trial"] ?? SUB.trial;
  const { unread } = await getDriverHeader();

  return (
    <>
      <AppHeader
        title="Configurações"
        subtitle="Conta profissional"
        actions={<DriverActions />}
      />
      <div className="px-4 pb-6">
        {/* Cabeçalho do perfil — foto + nome + verificação + editar */}
        <Card tone="cream" className="mt-4 flex items-center gap-4">
          <DriverPhotoUploader driverId={user!.id} currentUrl={photoUrl} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-navy-900">
              {user?.fullName}
            </p>
            <p className="text-sm text-navy-700/60">Motorista parceiro</p>
            <p
              className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                verified
                  ? "bg-green-100 text-green-800"
                  : "bg-navy-900/5 text-navy-700/70"
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {verified ? "Perfil verificado" : "Verificação pendente"}
            </p>
            <p
              className={`ml-2 mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${sub.cls}`}
            >
              {sub.label}
            </p>
          </div>
        </Card>

        <Link
          href="/motorista/perfil/editar"
          className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-navy-900/15 py-3 font-semibold text-navy-900"
        >
          <Pencil className="h-4 w-4" /> Editar perfil
        </Link>

        {/* Veículo */}
        <SectionTitle>Meu veículo</SectionTitle>
        {vehicle ? (
          <Card className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-400/20 text-navy-900">
              <Car className="h-6 w-6" />
            </span>
            <div>
              <p className="font-semibold text-navy-900">
                {vehicle.model ?? "Veículo"}
                {vehicle.year ? ` • ${vehicle.year}` : ""}
              </p>
              <p className="text-sm text-navy-700/60">
                {vehicle.prefix ? `Prefixo ${vehicle.prefix} • ` : ""}
                Placa {vehicle.plate ?? "—"}
                {vehicle.color ? ` • ${vehicle.color}` : ""} • {vehicle.capacity}{" "}
                vagas
              </p>
            </div>
          </Card>
        ) : (
          <Card className="border-dashed text-center text-sm text-navy-700/60">
            Nenhum veículo cadastrado. Toque em “Editar perfil” para adicionar.
          </Card>
        )}

        {/* Marketplace — resumo; edição em Editar perfil */}
        <SectionTitle>Marketplace</SectionTitle>
        <Card className="overflow-hidden p-0">
          {profile?.van_photo_path && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={
                supabase.storage
                  .from("van-photos")
                  .getPublicUrl(profile.van_photo_path).data.publicUrl
              }
              alt="Foto da van"
              className="h-36 w-full object-cover"
            />
          )}
          <div className="p-4 text-sm">
            <p
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                profile?.marketplace_listed
                  ? "bg-green-100 text-green-800"
                  : "bg-navy-900/5 text-navy-700/70"
              }`}
            >
              {profile?.marketplace_listed ? "Aparecendo" : "Não aparece"}
            </p>
            {(profile?.price_min_cents || profile?.price_max_cents) && (
              <p className="mt-2 text-navy-700/70">
                {[profile?.price_min_cents, profile?.price_max_cents]
                  .map((c) => (c ? centsToBRL(c) : null))
                  .filter(Boolean)
                  .join(" a ")}{" "}
                / mês
              </p>
            )}
            {profile?.service_cities && (
              <p className="mt-1 text-navy-700/70">{profile.service_cities}</p>
            )}
          </div>
        </Card>

        <OpenRequestsToggle initial={openRequests} />

        {/* Números */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Stat icon={Users} value={alunos ?? 0} label="alunos" />
          <Stat icon={RouteIcon} value={rotas ?? 0} label="rotas" />
        </div>

        {/* Contato */}
        <SectionTitle>Contato</SectionTitle>
        <Card className="space-y-2 text-sm">
          <Row icon={Phone} value={userRow?.phone} />
          <Row icon={Mail} value={user?.email} />
          <Row icon={MapPin} value={profile?.address} />
        </Card>

        {/* G6 — como os pais acompanham */}
        <SectionTitle>Como os pais acompanham</SectionTitle>
        <TrackingModeToggle initial={mode} />
        <p className="mt-2 px-1 text-xs text-navy-700/50">
          Vale para todas as suas rotas. No modo Linha do tempo, o app nunca
          compartilha a localização por GPS.
        </p>

        {/* Notificações — o mesmo destino do sininho do cabeçalho */}
        <SectionTitle>Notificações</SectionTitle>
        <Link
          href="/motorista/notificacoes"
          className="flex items-center gap-3 rounded-2xl border border-navy-900/5 bg-white p-4 shadow-sm"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-400/20 text-navy-900">
            <Bell className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold text-navy-900">
              Ver notificações
            </span>
            <span className="block text-xs text-navy-700/60">
              {unread
                ? `${unread} ${unread === 1 ? "nova" : "novas"}`
                : "Nenhuma nova"}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-navy-700/40" />
        </Link>

        {/* Suporte */}
        <SectionTitle>Suporte</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <a
            href={`https://wa.me/${SUPPORT_WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-yellow-400 py-3 text-sm font-semibold text-navy-900"
          >
            <MessageCircle className="h-4 w-4" /> Falar no WhatsApp
          </a>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="flex items-center justify-center gap-2 rounded-xl border border-navy-900/15 bg-white py-3 text-sm font-semibold text-navy-900"
          >
            <Mail className="h-4 w-4" /> Enviar e-mail
          </a>
        </div>

        {/* Sair */}
        <SectionTitle>Sair</SectionTitle>
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white py-3 font-semibold text-red-700"
          >
            <LogOut className="h-4 w-4" /> Sair da conta
          </button>
        </form>
      </div>
    </>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  label: string;
}) {
  return (
    <Card className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-400/20 text-navy-900">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-lg font-bold text-navy-900">{value}</p>
        <p className="text-xs text-navy-700/60">{label}</p>
      </div>
    </Card>
  );
}

function Row({
  icon: Icon,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 shrink-0 text-navy-700/40" />
      <span className="text-navy-900">{value || "—"}</span>
    </div>
  );
}
