import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SettingsHeader } from "@/components/driver-settings/parts";
import { MyProfileForm } from "@/components/driver-settings/Forms";

export default async function MeuPerfilPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("driver_profiles").select("address").eq("user_id", user!.id).single();
  const { data: row } = await supabase.from("users").select("phone").eq("id", user!.id).single();
  return (
    <>
      <SettingsHeader title="Meu perfil" subtitle="Nome, telefone e endereço" />
      <div className="px-4 pb-8 pt-4">
        <MyProfileForm
          fullName={user?.fullName ?? ""}
          phone={row?.phone ?? null}
          email={user?.email ?? null}
          address={profile?.address ?? null}
        />
      </div>
    </>
  );
}
