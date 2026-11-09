import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EditDriverForm } from "@/components/EditDriverForm";
import { parseStatus } from "@/lib/marketplace-status";

export default async function EditarPerfilPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("driver_profiles")
    .select(
      "address, parent_tracking_mode, subscription_status, service_cities, service_neighborhoods, service_schools, age_min, age_max, service_shifts, price_min_cents, price_max_cents, marketplace_listed, van_photo_path",
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

  // Fonte única das escolas atendidas (driver_schools): códigos INEP e as cidades deles.
  const { data: ds } = await supabase.from("driver_schools").select("inep_code, schools(city_id)");
  type DsRow = { inep_code: number; schools: { city_id: number } | { city_id: number }[] | null };
  const dsRows = (ds ?? []) as unknown as DsRow[];
  const schoolCityIds = [
    ...new Set(
      dsRows.flatMap((r) => (Array.isArray(r.schools) ? r.schools : r.schools ? [r.schools] : [])).map((s) => s.city_id),
    ),
  ];

  // Idem para bairros (driver_neighborhoods → pool): ids e as cidades deles.
  const { data: dn } = await supabase.from("driver_neighborhoods").select("neighborhood_id, neighborhoods(city_id)");
  type DnRow = { neighborhood_id: number; neighborhoods: { city_id: number } | { city_id: number }[] | null };
  const dnRows = (dn ?? []) as unknown as DnRow[];
  const hoodCityIds = [
    ...new Set(
      dnRows.flatMap((r) => (Array.isArray(r.neighborhoods) ? r.neighborhoods : r.neighborhoods ? [r.neighborhoods] : [])).map((n) => n.city_id),
    ),
  ];

  // Status real da vitrine (mesma regra do banco).
  const { data: statusRaw } = await supabase.rpc("my_marketplace_status");

  const vanUrl = profile?.van_photo_path
    ? supabase.storage.from("van-photos").getPublicUrl(profile.van_photo_path).data
        .publicUrl
    : null;

  return (
    <>
      <header className="flex items-center gap-3 border-b border-navy-900/10 bg-white px-4 pb-5 pt-6 text-navy-900">
        <Link href="/motorista/perfil" className="text-navy-900/70">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-lg font-bold text-navy-900">Editar perfil</h1>
      </header>
      <div className="px-4 pb-8">
        <EditDriverForm
          driver={{
            full_name: user?.fullName ?? "",
            email: user?.email ?? null,
            phone: userRow?.phone ?? null,
            address: profile?.address ?? null,
            prefix: vehicle?.prefix ?? null,
            plate: vehicle?.plate ?? null,
            model: vehicle?.model ?? null,
            year: vehicle?.year ?? null,
            color: vehicle?.color ?? null,
            capacity: vehicle?.capacity ?? null,
            subscription_status: profile?.subscription_status ?? "trial",
            service_cities: profile?.service_cities ?? null,
            service_neighborhoods: profile?.service_neighborhoods ?? null,
            service_schools: profile?.service_schools ?? null,
            school_codes: dsRows.map((r) => r.inep_code),
            school_city_ids: schoolCityIds,
            hood_ids: dnRows.map((r) => r.neighborhood_id),
            hood_city_ids: hoodCityIds,
            age_min: profile?.age_min ?? null,
            age_max: profile?.age_max ?? null,
            service_shifts: (profile?.service_shifts as string[] | null) ?? [],
            price_min_cents: profile?.price_min_cents ?? null,
            price_max_cents: profile?.price_max_cents ?? null,
            marketplace_listed: profile?.marketplace_listed ?? false,
            van_photo_path: profile?.van_photo_path ?? null,
            van_photo_url: vanUrl,
            driver_id: user!.id,
            tracking_mode: ((profile?.parent_tracking_mode as string | null) === "timeline" ? "timeline" : "map") as "map" | "timeline",
            marketplace_status: parseStatus(statusRaw),
          }}
        />
      </div>
    </>
  );
}
