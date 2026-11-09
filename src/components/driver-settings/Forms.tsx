"use client";

import { useActionState, useState } from "react";
import { Camera, Car, Info, Map as MapIcon, MapPin, ShieldCheck, SlidersHorizontal, Store, User, Wallet } from "lucide-react";
import { Section } from "@/components/ui";
import { ConsentText } from "@/components/ConsentText";
import { acceptMarketplaceConsent } from "@/lib/actions/consents";
import { LISTING_TEMPLATE } from "@/lib/consent-texts";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { CoverageSelector } from "@/components/CoverageSelector";
import { VanPhotoUploader } from "@/components/VanPhotoUploader";
import { missingText, type MarketplaceStatus } from "@/lib/marketplace-status";
import {
  saveMarketplace,
  saveMyProfile,
  saveSubscription,
  saveTracking,
  saveVehicle,
  type SettingsFormState,
} from "@/lib/actions/driver-settings";
import { Field, SaveBar } from "./parts";

const initial: SettingsFormState = { error: null };

// ---------- Meu perfil ----------
export function MyProfileForm({
  fullName,
  phone,
  email,
  address,
}: {
  fullName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}) {
  const [state, action, pending] = useActionState(saveMyProfile, initial);
  return (
    <form action={action} className="space-y-4">
      <Section tone="navy" icon={User} title="Identificação" className="space-y-4">
        <Field onDark label="Nome completo" name="full_name" defaultValue={fullName} required />
        <Field onDark label="Telefone" name="phone" type="tel" defaultValue={phone ?? ""} placeholder="(00) 00000-0000" required />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-white/80">
            E-mail <span className="text-white/40">(não editável)</span>
          </span>
          <input
            value={email ?? ""}
            disabled
            className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-white/60"
          />
        </label>
      </Section>
      <Section tone="cream" icon={MapPin} title="Endereço">
        <AddressAutocomplete
          label="Endereço residencial"
          name="address"
          latName="address_lat"
          lngName="address_lng"
          placeholder="Rua, número, bairro, cidade"
          initialValue={address ?? ""}
          withNumber
        />
      </Section>
      <SaveBar error={state.error} pending={pending} />
    </form>
  );
}

// ---------- Veículo ----------
export function VehicleForm({
  v,
}: {
  v: { prefix: string | null; plate: string | null; model: string | null; year: number | null; color: string | null; capacity: number | null };
}) {
  const [state, action, pending] = useActionState(saveVehicle, initial);
  return (
    <form action={action} className="space-y-4">
      <Section tone="navy" icon={Car} title="Identificação da van" className="space-y-4">
        <Field onDark label="Prefixo" name="prefix" defaultValue={v.prefix ?? ""} placeholder="Nº de identificação da van" required />
        <Field onDark label="Placa" name="plate" defaultValue={v.plate ?? ""} placeholder="ABC-1D23" required />
      </Section>
      <Section tone="cream" icon={Info} title="Detalhes" className="space-y-4">
        <Field label="Modelo" name="model" defaultValue={v.model ?? ""} placeholder="Ex.: Mercedes-Benz Sprinter" required />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ano" name="year" type="number" defaultValue={v.year ?? ""} placeholder="2022" required />
          <Field label="Cor" name="color" defaultValue={v.color ?? ""} placeholder="Branca" required />
        </div>
        <Field label="Vagas" name="capacity" type="number" defaultValue={v.capacity ?? ""} placeholder="Ex.: 15" required />
      </Section>
      <SaveBar error={state.error} pending={pending} />
    </form>
  );
}

// ---------- Acompanhamento ----------
const TRACKING = [
  { value: "map", title: "Mapa ao vivo", desc: "O pai vê a van no mapa durante a rota ativa.", icon: MapIcon },
  { value: "timeline", title: "Linha do tempo", desc: "Só o progresso por paradas, sem GPS. Mais privado e leve.", icon: MapPin },
] as const;

export function TrackingForm({ initialMode }: { initialMode: "map" | "timeline" }) {
  const [state, action, pending] = useActionState(saveTracking, initial);
  const [mode, setMode] = useState(initialMode);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="mode" value={mode} />
      <Section icon={MapIcon} title="Como os pais acompanham" className="space-y-3">
        {TRACKING.map((o) => {
          const active = mode === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => setMode(o.value)}
              aria-pressed={active}
              className={`flex w-full items-start gap-3 rounded-2xl p-4 text-left transition ${
                active ? "bg-navy-900 text-white" : "border border-navy-900/10 bg-white"
              }`}
            >
              <o.icon className={`mt-0.5 h-5 w-5 shrink-0 ${active ? "text-yellow-400" : "text-navy-900"}`} />
              <span className="flex-1">
                <span className={`block font-semibold ${active ? "text-white" : "text-navy-900"}`}>{o.title}</span>
                <span className={`block text-sm ${active ? "text-white/70" : "text-navy-700/60"}`}>{o.desc}</span>
              </span>
              {active && <span className="font-bold text-yellow-400">✓</span>}
            </button>
          );
        })}
      </Section>
      <p className="rounded-2xl bg-cream px-4 py-3 text-xs text-navy-800">
        Vale para todas as suas rotas. No modo Linha do tempo, o app nunca compartilha a localização por GPS.
      </p>
      <SaveBar error={state.error} pending={pending} />
    </form>
  );
}

// ---------- Assinatura ----------
export function SubscriptionForm({ status }: { status: string }) {
  const [state, action, pending] = useActionState(saveSubscription, initial);
  return (
    <form action={action} className="space-y-4">
      <Section tone="navy" icon={ShieldCheck} title="Assinatura Kangu">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-white/80">Status da assinatura</span>
          <select
            name="subscription_status"
            defaultValue={status}
            className="w-full rounded-xl border border-white/20 bg-white px-3 py-3 text-navy-900"
          >
            <option value="trial">Trial</option>
            <option value="active">Ativa</option>
            <option value="paused">Pausada</option>
          </select>
          <span className="mt-1 block text-xs text-white/60">
            Controle interno — a cobrança da assinatura é feita fora do app no piloto.
          </span>
        </label>
      </Section>
      <SaveBar error={state.error} pending={pending} />
    </form>
  );
}

// ---------- Marketplace ----------
const SHIFT_OPTIONS = [
  { value: "morning", label: "Manhã" },
  { value: "afternoon", label: "Tarde" },
  { value: "integral", label: "Integral" },
];
const centsToInput = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

export interface MarketplaceDefaults {
  driver_id: string;
  van_photo_path: string | null;
  van_photo_url: string | null;
  service_cities: string | null;
  service_neighborhoods: string | null;
  service_schools: string | null;
  school_codes: number[];
  school_city_ids: number[];
  hood_ids: number[];
  hood_city_ids: number[];
  age_min: number | null;
  age_max: number | null;
  service_shifts: string[];
  price_min_cents: number | null;
  price_max_cents: number | null;
  marketplace_listed: boolean;
  status: MarketplaceStatus | null;
  driver_name: string;
  phone: string | null;
  has_listing_consent: boolean;
}

export function MarketplaceForm({ d }: { d: MarketplaceDefaults }) {
  const [state, action, pending] = useActionState(saveMarketplace, initial);
  const [listed, setListed] = useState(d.marketplace_listed);
  const [hasConsent, setHasConsent] = useState(d.has_listing_consent);
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  async function acceptListing() {
    setConsentBusy(true);
    setConsentError(null);
    const r = await acceptMarketplaceConsent("marketplace_listing");
    setConsentBusy(false);
    if (r.error) {
      setConsentError(r.error);
      return;
    }
    setHasConsent(true);
    setListed(true);
    setConsentOpen(false);
  }
  return (
    <form action={action} className="space-y-4">
      <StatusBlock status={d.status} listedNow={listed} />

      <Section icon={Camera} title="Foto da van">
        <VanPhotoUploader driverId={d.driver_id} currentUrl={d.van_photo_url} currentPath={d.van_photo_path} />
        <span className="mt-2 block text-xs text-navy-700/60">Foto pública. Evite mostrar a placa e pessoas.</span>
      </Section>

      <Section tone="cream" icon={MapPin} title="Onde você atende">
        <CoverageSelector
          initialCities={d.service_cities}
          initialNeighborhoods={d.service_neighborhoods}
          initialSchools={d.service_schools}
          initialSchoolCodes={d.school_codes}
          initialSchoolCityIds={d.school_city_ids}
          initialHoodIds={d.hood_ids}
          initialHoodCityIds={d.hood_city_ids}
        />
      </Section>

      <Section icon={SlidersHorizontal} title="Quem você atende" className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Idade mínima" name="age_min" type="number" min={0} max={30} defaultValue={d.age_min ?? ""} placeholder="3" />
          <Field label="Idade máxima" name="age_max" type="number" min={0} max={30} defaultValue={d.age_max ?? ""} placeholder="17" />
        </div>
        <fieldset>
          <legend className="mb-1 block text-sm font-medium text-navy-800">Turnos atendidos</legend>
          <div className="flex gap-2">
            {SHIFT_OPTIONS.map((o) => (
              <label
                key={o.value}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-navy-900/15 bg-white py-3 text-sm has-[:checked]:border-navy-900 has-[:checked]:bg-yellow-400/30 has-[:checked]:font-semibold"
              >
                <input
                  type="checkbox"
                  name="service_shifts"
                  value={o.value}
                  defaultChecked={d.service_shifts.includes(o.value)}
                  className="sr-only"
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      </Section>

      <Section tone="cream" icon={Wallet} title="Faixa de preço" className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Preço mínimo (R$/mês)" name="price_min" inputMode="decimal" defaultValue={centsToInput(d.price_min_cents)} placeholder="250,00" />
          <Field label="Preço máximo (R$/mês)" name="price_max" inputMode="decimal" defaultValue={centsToInput(d.price_max_cents)} placeholder="400,00" />
        </div>
        <span className="block text-xs text-navy-700/70">
          Faixa pública de referência. Não muda o valor cobrado de cada aluno.
        </span>
      </Section>

      {/* Liga/desliga a vitrine — azul-marinho: é a ação principal da tela */}
      <Section tone="navy" icon={Store} title="Vitrine">
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-medium text-white">Aparecer no marketplace</span>
            <span className="block text-xs text-white/60">
              {listed ? "Ligado: seu perfil pode ser listado." : "Desligado, seu perfil não é listado."}
            </span>
          </span>
          <input
            type="checkbox"
            name="marketplace_listed"
            role="switch"
            checked={listed}
            onChange={(e) => {
              // Ligar sem aceite vigente abre o texto de autorização (prévia + aceite) em vez de ligar.
              if (e.target.checked && !hasConsent) setConsentOpen(true);
              else setListed(e.target.checked);
            }}
            className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-white/25 transition-colors checked:bg-yellow-400 relative before:absolute before:left-0.5 before:top-0.5 before:h-5 before:w-5 before:rounded-full before:bg-white before:shadow before:transition-transform checked:before:translate-x-5"
          />
        </label>
      </Section>

      {consentOpen && (
        <Section tone="cream" icon={Store} title="Autorização para publicar na vitrine" className="space-y-3">
          <div className="rounded-xl bg-white p-3 text-sm text-navy-800">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy-700/60">Prévia do que será público</p>
            <ul className="space-y-1">
              <li>Nome: {d.driver_name}</li>
              <li>Contato: {d.phone ?? "—"}</li>
              <li>Foto da van: {d.van_photo_url ? "sim" : "—"}</li>
              <li>Cidades: {d.service_cities ?? "—"}</li>
              <li>Bairros: {d.service_neighborhoods ?? "todos"}</li>
              <li>Escolas: {d.service_schools ?? "todas"}</li>
              <li>
                Idades: {d.age_min ?? "—"} a {d.age_max ?? "—"} · Turnos: {d.service_shifts.length ? d.service_shifts.join(", ") : "—"}
              </li>
              <li>
                Faixa de preço: {d.price_min_cents != null ? centsToInput(d.price_min_cents) : "—"} a{" "}
                {d.price_max_cents != null ? centsToInput(d.price_max_cents) : "—"}
              </li>
            </ul>
          </div>
          <ConsentText className="text-navy-900" paragraphs={LISTING_TEMPLATE} />
          {consentError && <p className="rounded-lg bg-white px-3 py-2 text-sm text-red-700">{consentError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConsentOpen(false)}
              className="flex-1 rounded-xl border border-navy-900/15 bg-white py-3 text-sm font-semibold text-navy-900"
            >
              Agora não
            </button>
            <button
              type="button"
              disabled={consentBusy}
              onClick={acceptListing}
              className="flex-1 rounded-xl bg-navy-900 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {consentBusy ? "Registrando…" : "Aceitar e ativar"}
            </button>
          </div>
          <p className="text-xs text-navy-700/70">Salve a tela depois para publicar os dados acima.</p>
        </Section>
      )}

      <SaveBar error={state.error} pending={pending} />
    </form>
  );
}

// Status real da vitrine (mesma regra do banco): aparecendo → azul-marinho; senão creme com o que falta.
function StatusBlock({ status, listedNow }: { status: MarketplaceStatus | null; listedNow: boolean }) {
  if (!status) return null;
  if (status.visible) {
    return (
      <div className="rounded-2xl bg-navy-900 p-4 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide text-yellow-400">Vitrine</p>
        <p className="mt-1 font-semibold">Seu perfil está aparecendo para os pais</p>
        {!listedNow && (
          <p className="mt-1 text-xs text-white/70">Você desligou o toggle abaixo: ao salvar, o perfil sai da vitrine.</p>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-yellow-400/40 bg-cream p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-navy-700/60">Vitrine</p>
      <p className="mt-1 font-semibold text-navy-900">Seu perfil ainda não aparece</p>
      {status.missing.length > 0 && <p className="mt-1 text-sm text-navy-800">Falta: {missingText(status.missing)}.</p>}
    </div>
  );
}
