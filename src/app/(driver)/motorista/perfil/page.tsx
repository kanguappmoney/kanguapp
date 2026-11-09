import Link from "next/link";
import {
  ShieldCheck,
  User,
  Car,
  Eye,
  Store,
  Bell,
  MessageCircle,
  Mail,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppHeader, Card, SectionTitle } from "@/components/ui";
import { missingText, parseStatus } from "@/lib/marketplace-status";
import { DriverPhotoUploader } from "@/components/DriverPhotoUploader";
import { DriverActions } from "@/components/DriverHeaderActions";
import { getDriverHeader } from "@/lib/driver-header";
import { signOut } from "@/lib/actions/auth";

// WhatsApp do suporte: número completo com código do país (55) + DDD, só dígitos.
// O link vira https://wa.me/<número>.
const SUPPORT_WHATSAPP_NUMBER = "5511953790054";
const SUPPORT_EMAIL = "house@domhub.co";

// Configurações do motorista: LISTA de categorias (ícone + nome + seta); cada item abre a tela da categoria,
// com cabeçalho e botão Salvar próprios (/motorista/perfil/<categoria>). Abaixo: Notificações, Suporte e Sair.
export default async function PerfilMotoristaPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("driver_profiles")
    .select("verification, photo_path, subscription_status, parent_tracking_mode")
    .eq("user_id", user!.id)
    .single();

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("prefix, plate, model, year, color, capacity")
    .eq("driver_id", user!.id)
    .limit(1)
    .maybeSingle();

  let photoUrl: string | null = null;
  if (profile?.photo_path) {
    const { data } = await supabase.storage.from("driver-photos").createSignedUrl(profile.photo_path, 3600);
    photoUrl = data?.signedUrl ?? null;
  }

  const verified = profile?.verification === "verified";
  const SUB: Record<string, { label: string; cls: string }> = {
    active: { label: "Assinatura ativa", cls: "bg-green-100 text-green-800" },
    trial: { label: "Trial", cls: "bg-yellow-400/20 text-navy-900" },
    paused: { label: "Assinatura pausada", cls: "bg-red-100 text-red-800" },
  };
  const sub = SUB[profile?.subscription_status ?? "trial"] ?? SUB.trial;
  const { unread } = await getDriverHeader();

  // Status REAL da vitrine (a mesma regra do banco): o toggle sozinho não garante que aparece.
  const { data: statusRaw } = await supabase.rpc("my_marketplace_status");
  const mkt = parseStatus(statusRaw);

  const vehicleComplete = Boolean(vehicle?.prefix && vehicle?.plate && vehicle?.model && vehicle?.color);
  const trackingLabel = profile?.parent_tracking_mode === "timeline" ? "Linha do tempo" : "Mapa ao vivo";

  return (
    <>
      <AppHeader title="Configurações" subtitle="Conta profissional" actions={<DriverActions />} />
      <div className="px-4 pb-6">
        {/* Cartão do perfil — creme (destaque secundário) */}
        <Card tone="cream" className="mt-4 flex items-center gap-4">
          <DriverPhotoUploader driverId={user!.id} currentUrl={photoUrl} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-navy-900">{user?.fullName}</p>
            <p className="text-sm text-navy-700/60">Motorista parceiro</p>
            <p
              className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                verified ? "bg-green-100 text-green-800" : "bg-navy-900/5 text-navy-700/70"
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {verified ? "Perfil verificado" : "Verificação pendente"}
            </p>
            <p className={`ml-2 mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${sub.cls}`}>
              {sub.label}
            </p>
          </div>
        </Card>

        {/* Categorias — navegação por lista */}
        <SectionTitle>Minha conta</SectionTitle>
        <ul className="overflow-hidden rounded-2xl border border-navy-900/10 bg-white">
          <Row href="/motorista/perfil/meu-perfil" icon={User} title="Meu perfil" subtitle="Nome, telefone e endereço" />
          <Row
            href="/motorista/perfil/veiculo"
            icon={Car}
            title="Veículo"
            subtitle={
              vehicleComplete
                ? `${vehicle?.model} • ${vehicle?.plate}`
                : "Preencha os dados da van para cadastrar alunos"
            }
            tone={vehicleComplete ? "white" : "cream"}
          />
          <Row href="/motorista/perfil/acompanhamento" icon={Eye} title="Acompanhamento" subtitle={trackingLabel} />
          <Row
            href="/motorista/perfil/assinatura"
            icon={ShieldCheck}
            title="Assinatura Kangu"
            subtitle={sub.label}
          />
          <Row
            href="/motorista/perfil/marketplace"
            icon={Store}
            title="Marketplace"
            subtitle={
              mkt?.visible
                ? "Aparecendo na vitrine"
                : mkt && mkt.missing.length > 0
                  ? `Não aparece — falta: ${missingText(mkt.missing)}`
                  : "Não aparece"
            }
            tone={mkt?.visible ? "navy" : "cream"}
            last
          />
        </ul>

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
            <span className="block font-semibold text-navy-900">Ver notificações</span>
            <span className="block text-xs text-navy-700/60">
              {unread ? `${unread} ${unread === 1 ? "nova" : "novas"}` : "Nenhuma nova"}
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

// Item da lista de categorias: ícone + nome (+ resumo) + seta. `navy` = destaque primário (vitrine no ar),
// `cream` = precisa de atenção/informativo, `white` = padrão.
function Row({
  href,
  icon: Icon,
  title,
  subtitle,
  tone = "white",
  last = false,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  tone?: "white" | "cream" | "navy";
  last?: boolean;
}) {
  const bg = tone === "navy" ? "bg-navy-900 text-white" : tone === "cream" ? "bg-cream" : "bg-white";
  const chip = tone === "navy" ? "bg-yellow-400 text-navy-900" : "bg-yellow-400/20 text-navy-900";
  const sub = tone === "navy" ? "text-white/70" : "text-navy-700/60";
  const arrow = tone === "navy" ? "text-white/60" : "text-navy-700/40";
  return (
    <li className={last ? "" : "border-b border-navy-900/10"}>
      <Link href={href} className={`flex items-center gap-3 px-4 py-3.5 ${bg}`}>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${chip}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block font-semibold ${tone === "navy" ? "text-white" : "text-navy-900"}`}>{title}</span>
          {subtitle && <span className={`block line-clamp-2 text-xs ${sub}`}>{subtitle}</span>}
        </span>
        <ChevronRight className={`h-5 w-5 shrink-0 ${arrow}`} />
      </Link>
    </li>
  );
}
