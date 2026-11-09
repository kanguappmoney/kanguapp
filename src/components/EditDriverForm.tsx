"use client";

import { useActionState, useState } from "react";
import { Car, Eye, MapPin, ShieldCheck, Store, User } from "lucide-react";
import { TrackingModeToggle } from "@/components/TrackingModeToggle";
import { missingText, type MarketplaceStatus } from "@/lib/marketplace-status";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { CoverageSelector } from "@/components/CoverageSelector";
import { VanPhotoUploader } from "@/components/VanPhotoUploader";
import { updateDriverProfile, type DriverFormState } from "@/lib/actions/driver";

const initial: DriverFormState = { error: null };

export interface DriverDefaults {
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  prefix: string | null;
  plate: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  capacity: number | null;
  subscription_status: string;
  service_cities: string | null;
  service_neighborhoods: string | null;
  service_schools: string | null;
  school_codes: number[]; // driver_schools (fonte única das escolas atendidas)
  school_city_ids: number[];
  hood_ids: number[]; // driver_neighborhoods (fonte única dos bairros atendidos)
  hood_city_ids: number[];
  age_min: number | null;
  age_max: number | null;
  service_shifts: string[];
  price_min_cents: number | null;
  price_max_cents: number | null;
  marketplace_listed: boolean;
  // Foto da van (bucket público) — o uploader sobe direto, fora do submit do form.
  van_photo_path: string | null;
  van_photo_url: string | null;
  driver_id: string;
  tracking_mode: "map" | "timeline";
  marketplace_status: MarketplaceStatus | null; // visibilidade REAL (my_marketplace_status)
}

const SHIFT_OPTIONS = [
  { value: "morning", label: "Manhã" },
  { value: "afternoon", label: "Tarde" },
  { value: "integral", label: "Integral" },
];

function centsToInput(c: number | null) {
  return c == null ? "" : (c / 100).toFixed(2).replace(".", ",");
}

export function EditDriverForm({ driver }: { driver: DriverDefaults }) {
  const [state, action, pending] = useActionState(updateDriverProfile, initial);
  const [listed, setListed] = useState(driver.marketplace_listed);

  return (
    <form action={action} className="space-y-5">
      {/* 1 — Meu perfil */}
      <Section icon={User} title="Meu perfil">
        <Field label="Nome completo" name="full_name" defaultValue={driver.full_name} required />
        <Field label="Telefone" name="phone" type="tel" defaultValue={driver.phone ?? ""} placeholder="(00) 00000-0000" required />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-navy-800">
            E-mail <span className="text-navy-700/40">(não editável)</span>
          </span>
          <input
            value={driver.email ?? ""}
            disabled
            className="w-full rounded-xl border border-navy-900/10 bg-navy-900/[0.03] px-3 py-3 text-navy-700/60"
          />
        </label>
        <AddressAutocomplete
          label="Endereço residencial"
          name="address"
          latName="address_lat"
          lngName="address_lng"
          placeholder="Rua, número, bairro, cidade"
          initialValue={driver.address ?? ""}
          withNumber
        />
      </Section>

      {/* 2 — Veículo */}
      <Section icon={Car} title="Veículo">
        <Field label="Prefixo" name="prefix" defaultValue={driver.prefix ?? ""} placeholder="Nº de identificação da van" required />
        <Field label="Placa" name="plate" defaultValue={driver.plate ?? ""} placeholder="ABC-1D23" required />
        <Field label="Modelo" name="model" defaultValue={driver.model ?? ""} placeholder="Ex.: Mercedes-Benz Sprinter" required />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ano" name="year" type="number" defaultValue={driver.year ?? ""} placeholder="2022" required />
          <Field label="Cor" name="color" defaultValue={driver.color ?? ""} placeholder="Branca" required />
        </div>
        <Field label="Vagas" name="capacity" type="number" defaultValue={driver.capacity ?? ""} placeholder="Ex.: 15" required />
      </Section>

      {/* 3 — Acompanhamento (como os pais acompanham a rota; salva ao tocar, fora do botão Salvar) */}
      <Section icon={Eye} title="Acompanhamento" hint="Como os pais acompanham. Vale para todas as suas rotas e salva ao tocar.">
        <TrackingModeToggle initial={driver.tracking_mode} />
        <p className="text-xs text-navy-700/50">
          No modo Linha do tempo, o app nunca compartilha a localização por GPS.
        </p>
      </Section>

      {/* 4 — Assinatura */}
      <Section icon={ShieldCheck} title="Assinatura Kangu">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-navy-800">
            Status da assinatura
          </span>
          <select
            name="subscription_status"
            defaultValue={driver.subscription_status}
            className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3"
          >
            <option value="trial">Trial</option>
            <option value="active">Ativa</option>
            <option value="paused">Pausada</option>
          </select>
          <span className="mt-1 block text-xs text-navy-700/50">
            Controle interno — a cobrança da assinatura é feita fora do app no piloto.
          </span>
        </label>
      </Section>

      {/* 5 — Marketplace */}
      <Section icon={Store} title="Marketplace" hint="O que pais verão sobre o seu serviço. Nunca aparece o seu endereço residencial.">
        <MarketplaceStatusBlock status={driver.marketplace_status} listedNow={listed} />
        <div>
          <span className="mb-1 block text-sm font-medium text-navy-800">Foto da van</span>
          <VanPhotoUploader
            driverId={driver.driver_id}
            currentUrl={driver.van_photo_url}
            currentPath={driver.van_photo_path}
          />
          <span className="mt-1 block text-xs text-navy-700/50">
            Foto pública. Evite mostrar a placa e pessoas.
          </span>
        </div>
        <div>
          <span className="mb-1 flex items-center gap-1.5 text-sm font-medium text-navy-800">
            <MapPin className="h-4 w-4 text-navy-700/50" aria-hidden /> Onde você atende
          </span>
          <CoverageSelector
            initialCities={driver.service_cities}
            initialNeighborhoods={driver.service_neighborhoods}
            initialSchools={driver.service_schools}
            initialSchoolCodes={driver.school_codes}
            initialSchoolCityIds={driver.school_city_ids}
            initialHoodIds={driver.hood_ids}
            initialHoodCityIds={driver.hood_city_ids}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Idade mínima" name="age_min" type="number" min={0} max={30} defaultValue={driver.age_min ?? ""} placeholder="3" />
          <Field label="Idade máxima" name="age_max" type="number" min={0} max={30} defaultValue={driver.age_max ?? ""} placeholder="17" />
        </div>
        <fieldset>
          <legend className="mb-1 block text-sm font-medium text-navy-800">
            Turnos atendidos
          </legend>
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
                  defaultChecked={driver.service_shifts.includes(o.value)}
                  className="sr-only"
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Preço mínimo (R$/mês)" name="price_min" inputMode="decimal" defaultValue={centsToInput(driver.price_min_cents)} placeholder="250,00" />
          <Field label="Preço máximo (R$/mês)" name="price_max" inputMode="decimal" defaultValue={centsToInput(driver.price_max_cents)} placeholder="400,00" />
        </div>
        <span className="-mt-2 block text-xs text-navy-700/50">
          Faixa pública de referência. Não muda o valor cobrado de cada aluno.
        </span>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-navy-900/15 bg-white px-4 py-3">
          <span>
            <span className="block text-sm font-medium text-navy-800">
              Aparecer no marketplace
            </span>
            <span className="block text-xs text-navy-700/50">
              {listed
                ? "Ligado: seu perfil pode ser listado."
                : "Desligado, seu perfil não é listado."}
            </span>
          </span>
          <input
            type="checkbox"
            name="marketplace_listed"
            role="switch"
            checked={listed}
            onChange={(e) => setListed(e.target.checked)}
            className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-navy-900/20 transition-colors checked:bg-yellow-400 relative before:absolute before:left-0.5 before:top-0.5 before:h-5 before:w-5 before:rounded-full before:bg-white before:shadow before:transition-transform checked:before:translate-x-5"
          />
        </label>
      </Section>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900 disabled:opacity-60"
      >
        {pending ? "Salvando…" : "Salvar alterações"}
      </button>
    </form>
  );
}

// Categoria do perfil: cartão com cabeçalho (ícone + título). Fundo branco = padrão; o que é informativo dentro
// dela usa creme e o destaque principal (status da vitrine) usa azul-marinho — as 3 camadas do app.
function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-navy-900/10 bg-white p-4">
      <header>
        <h2 className="flex items-center gap-2 text-base font-bold text-navy-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-400/20 text-navy-900">
            <Icon className="h-4 w-4" />
          </span>
          {title}
        </h2>
        {hint && <p className="mt-1 text-xs text-navy-700/60">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

// Status real da vitrine (mesma regra do banco). Visível → azul-marinho; senão creme com o que falta.
function MarketplaceStatusBlock({
  status,
  listedNow,
}: {
  status: MarketplaceStatus | null;
  listedNow: boolean;
}) {
  if (!status) return null;
  if (status.visible) {
    return (
      <div className="rounded-2xl bg-navy-900 p-4 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide text-yellow-400">Vitrine</p>
        <p className="mt-1 font-semibold">Seu perfil está aparecendo para os pais</p>
        {!listedNow && (
          <p className="mt-1 text-xs text-white/70">
            Você desligou o toggle abaixo: ao salvar, o perfil sai da vitrine.
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-yellow-400/40 bg-cream p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-navy-700/60">Vitrine</p>
      <p className="mt-1 font-semibold text-navy-900">Seu perfil ainda não aparece</p>
      {status.missing.length > 0 && (
        <p className="mt-1 text-sm text-navy-800">Falta: {missingText(status.missing)}.</p>
      )}
    </div>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-navy-800">
        {label}
      </span>
      <input
        {...props}
        className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3 outline-none focus:border-navy-700 focus:ring-2 focus:ring-yellow-400/40"
      />
    </label>
  );
}
