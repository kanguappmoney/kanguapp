import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SettingsHeader } from "@/components/driver-settings/parts";
import { SubscriptionForm } from "@/components/driver-settings/Forms";

export default async function AssinaturaPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data: p } = await supabase.from("driver_profiles").select("subscription_status").eq("user_id", user!.id).single();
  return (
    <>
      <SettingsHeader title="Assinatura Kangu" subtitle="Status da sua assinatura" />
      <div className="px-4 pb-8 pt-4">
        <SubscriptionForm status={p?.subscription_status ?? "trial"} />
      </div>
    </>
  );
}
