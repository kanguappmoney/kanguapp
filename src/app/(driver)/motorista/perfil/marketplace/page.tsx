import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SettingsHeader } from "@/components/driver-settings/parts";
import { MarketplaceForm } from "@/components/driver-settings/Forms";
import { OpenRequestsToggle } from "@/components/OpenRequestsToggle";
import { parseStatus } from "@/lib/marketplace-status";

export default async function MarketplacePage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: p } = await supabase
    .from("driver_profiles")
    .select(
      "service_cities, service_neighborhoods, service_schools, age_min, age_max, service_shifts, price_min_cents, price_max_cents, marketplace_listed, van_photo_path",
    )
    .eq("user_id", user!.id)
    .single();

  // Fonte única das escolas/bairros atendidos (driver_schools / driver_neighborhoods): ids e as cidades deles.
  type Emb = { city_id: number } | { city_id: number }[] | null;
  const cityIds = (rows: { x: Emb }[]) => [
    ...new Set(rows.flatMap((r) => (Array.isArray(r.x) ? r.x : r.x ? [r.x] : [])).map((s) => s.city_id)),
  ];
  const { data: ds } = await supabase.from("driver_schools").select("inep_code, schools(city_id)");
  const dsRows = (ds ?? []) as unknown as { inep_code: number; schools: Emb }[];
  const { data: dn } = await supabase.from("driver_neighborhoods").select("neighborhood_id, neighborhoods(city_id)");
  const dnRows = (dn ?? []) as unknown as { neighborhood_id: number; neighborhoods: Emb }[];

  const { data: statusRaw } = await supabase.rpc("my_marketplace_status");

  const { count: openRequestLinks } = await supabase
    .from("capture_links")
    .select("id", { count: "exact", head: true })
    .eq("kind", "generic")
    .eq("status", "active");

  // Aceites ativos da vitrine (texto de cada toggle) + dados que a prévia pública mostra.
  const { data: active } = await supabase
    .from("consents")
    .select("kind")
    .eq("subject_user_id", user!.id)
    .is("revoked_at", null)
    .in("kind", ["marketplace_listing", "marketplace_requests"]);
  const hasListingConsent = (active ?? []).some((c) => c.kind === "marketplace_listing");
  const hasRequestsConsent = (active ?? []).some((c) => c.kind === "marketplace_requests");
  const { data: urow } = await supabase.from("users").select("phone").eq("id", user!.id).single();

  // Bucket privado: o próprio motorista assina a URL da sua foto (política de dono, 1 h).
  const vanUrl = p?.van_photo_path
    ? ((await supabase.storage.from("van-photos").createSignedUrl(p.van_photo_path, 3600)).data?.signedUrl ?? null)
    : null;

  return (
    <>
      <SettingsHeader title="Marketplace" subtitle="O que os pais veem sobre o seu serviço" />
      <div className="space-y-4 px-4 pb-8 pt-4">
        <MarketplaceForm
          d={{
            driver_id: user!.id,
            van_photo_path: p?.van_photo_path ?? null,
            van_photo_url: vanUrl,
            service_cities: p?.service_cities ?? null,
            service_neighborhoods: p?.service_neighborhoods ?? null,
            service_schools: p?.service_schools ?? null,
            school_codes: dsRows.map((r) => r.inep_code),
            school_city_ids: cityIds(dsRows.map((r) => ({ x: r.schools }))),
            hood_ids: dnRows.map((r) => r.neighborhood_id),
            hood_city_ids: cityIds(dnRows.map((r) => ({ x: r.neighborhoods }))),
            age_min: p?.age_min ?? null,
            age_max: p?.age_max ?? null,
            service_shifts: (p?.service_shifts as string[] | null) ?? [],
            price_min_cents: p?.price_min_cents ?? null,
            price_max_cents: p?.price_max_cents ?? null,
            marketplace_listed: p?.marketplace_listed ?? false,
            status: parseStatus(statusRaw),
            driver_name: user!.fullName,
            phone: urow?.phone ?? null,
            has_listing_consent: hasListingConsent,
          }}
        />
        {/* Salva sozinho ao tocar (cria/revoga o link de pedidos); fica fora do formulário. */}
        <OpenRequestsToggle initial={(openRequestLinks ?? 0) > 0} hasConsent={hasRequestsConsent} />
      </div>
    </>
  );
}
