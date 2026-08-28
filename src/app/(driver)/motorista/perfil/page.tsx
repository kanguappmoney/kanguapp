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
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppHeader, Card, SectionTitle } from "@/components/ui";
import { TrackingModeToggle } from "@/components/TrackingModeToggle";
import { DriverPhotoUploader } from "@/components/DriverPhotoUploader";

export default async function PerfilMotoristaPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("driver_profiles")
    .select("parent_tracking_mode, verification, address, photo_path")
    .eq("user_id", user!.id)
    .single();

  const { data: userRow } = await supabase
    .from("users")
    .select("phone")
    .eq("id", user!.id)
    .single();

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("plate, model, year, color, capacity")
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

  const mode = (profile?.parent_tracking_mode ?? "map") as "map" | "timeline";
  const verified = profile?.verification === "verified";

  return (
    <>
      <AppHeader title="Perfil" subtitle="Conta profissional" showSignOut />
      <div className="px-4 pb-6">
        {/* Cabeçalho do perfil — foto + nome + verificação + editar */}
        <Card className="mt-4 flex items-center gap-4">
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
