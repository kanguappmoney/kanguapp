import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SettingsHeader } from "@/components/driver-settings/parts";
import { TrackingForm } from "@/components/driver-settings/Forms";

export default async function AcompanhamentoPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data: p } = await supabase.from("driver_profiles").select("parent_tracking_mode").eq("user_id", user!.id).single();
  return (
    <>
      <SettingsHeader title="Acompanhamento" subtitle="Como os pais acompanham a rota" />
      <div className="px-4 pb-8 pt-4">
        <TrackingForm initialMode={p?.parent_tracking_mode === "timeline" ? "timeline" : "map"} />
      </div>
    </>
  );
}
