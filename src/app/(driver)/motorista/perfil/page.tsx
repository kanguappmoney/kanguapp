import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppHeader, Card, SectionTitle } from "@/components/ui";
import { TrackingModeToggle } from "@/components/TrackingModeToggle";

export default async function PerfilMotoristaPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("driver_profiles")
    .select("parent_tracking_mode, verification")
    .eq("user_id", user!.id)
    .single();

  const mode = (profile?.parent_tracking_mode ?? "map") as "map" | "timeline";

  return (
    <>
      <AppHeader title="Perfil" showSignOut />
      <div className="px-4 pb-6">
        <SectionTitle>Você</SectionTitle>
        <Card>
          <p className="font-semibold text-navy-900">{user?.fullName}</p>
          <p className="text-sm text-navy-700/60">{user?.email}</p>
          <p className="mt-2 inline-block rounded-full bg-navy-900/5 px-2 py-0.5 text-xs text-navy-700/70">
            {profile?.verification === "verified"
              ? "✓ Verificado"
              : "Verificação pendente"}
          </p>
        </Card>

        {/* G6 — mockup 4B: toggle "Como os pais acompanham". */}
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
