import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SettingsHeader } from "@/components/driver-settings/parts";
import { VehicleForm } from "@/components/driver-settings/Forms";

export default async function VeiculoPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data: v } = await supabase
    .from("vehicles")
    .select("prefix, plate, model, year, color, capacity")
    .eq("driver_id", user!.id)
    .limit(1)
    .maybeSingle();
  return (
    <>
      <SettingsHeader title="Veículo" subtitle="Dados da van que aparecem para os pais e liberam o cadastro de alunos" />
      <div className="px-4 pb-8 pt-4">
        <VehicleForm
          v={{
            prefix: v?.prefix ?? null,
            plate: v?.plate ?? null,
            model: v?.model ?? null,
            year: v?.year ?? null,
            color: v?.color ?? null,
            capacity: v?.capacity ?? null,
          }}
        />
      </div>
    </>
  );
}
