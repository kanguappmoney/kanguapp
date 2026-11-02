import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Car, MessageCircle, MapPin, School, UserPlus, Users, Wallet } from "lucide-react";
import { Throttled } from "@/components/Throttled";
import { centsToBRL } from "@/lib/money";
import { limitMarketplace } from "@/lib/rate-limit";
import {
  SHIFT_LABEL,
  getDriver,
  splitList,
  vanPhotoUrl,
  whatsappUrl,
} from "@/lib/marketplace";

export const metadata: Metadata = {
  title: "Perfil do motorista — Kangu",
  robots: { index: false }, // perfil com telefone: fora de buscadores por ora
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Perfil público (sem login). É AQUI que o telefone sai do banco (um motorista por vez),
// por isso tem o limite de requisições mais apertado.
export default async function PerfilPublicoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const rate = await limitMarketplace("profile");
  if (!rate.ok) return <Throttled seconds={rate.retryAfterSec} />;

  const d = await getDriver(id);
  if (!d) notFound();
  const photo = await vanPhotoUrl(d.van_photo_path);

  const spots =
    d.spots_available > 0
      ? `${d.spots_available} ${d.spots_available === 1 ? "vaga disponível" : "vagas disponíveis"}`
      : "Sem vagas no momento";

  return (
    <main className="mx-auto min-h-dvh max-w-lg pb-40">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt={`Van de ${d.driver_name}`} className="h-56 w-full object-cover" />
        <Link
          href="/buscar"
          aria-label="Voltar à busca"
          className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-navy-900 shadow"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
      </div>

      <div className="px-4">
        <h1 className="mt-4 font-display text-2xl text-navy-900">{d.driver_name}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-navy-700/70">
          <Car className="h-4 w-4" aria-hidden /> {d.van_model}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Info icon={Users} label="Vagas" value={spots} good={d.spots_available > 0} />
          <Info
            icon={Wallet}
            label="Mensalidade"
            value={`${centsToBRL(d.price_min_cents)} a ${centsToBRL(d.price_max_cents)}`}
          />
        </div>
        <p className="mt-2 text-xs text-navy-700/50">
          Faixa de referência; o valor combinado é direto com o motorista.
        </p>

        <Section icon={Users} title="Atende">
          <p className="text-sm text-navy-800">
            Crianças de {d.age_min} a {d.age_max} anos
          </p>
          <Chips items={d.service_shifts.map((s) => SHIFT_LABEL[s])} />
        </Section>
        <Section icon={MapPin} title="Cidades">
          <Chips items={splitList(d.service_cities)} />
        </Section>
        <Section icon={MapPin} title="Bairros">
          <Chips items={splitList(d.service_neighborhoods)} />
        </Section>
        <Section icon={School} title="Escolas">
          <Chips items={splitList(d.service_schools)} />
        </Section>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-navy-900/10 bg-white/95 p-4 backdrop-blur">
        <div className="mx-auto max-w-lg">
          <div className="flex flex-col gap-2">
            {/* Só existe se o motorista ligou "receber pedidos pela vitrine". */}
            {d.request_token && (
              <Link
                href={`/captacao/${d.request_token}`}
                className="flex items-center justify-center gap-2 rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900"
              >
                <UserPlus className="h-5 w-5" aria-hidden />
                Solicitar vaga
              </Link>
            )}
            {d.phone && (
              <a
                href={whatsappUrl(d.phone, d.driver_name)}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-center gap-2 rounded-xl py-3 font-semibold text-navy-900 ${
                  d.request_token
                    ? "border border-navy-900/15 bg-white"
                    : "bg-yellow-400"
                }`}
              >
                <MessageCircle className="h-5 w-5" aria-hidden />
                Chamar no WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Info({
  icon: Icon,
  label,
  value,
  good,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <p className="flex items-center gap-1.5 text-xs text-navy-700/60">
        <Icon className="h-4 w-4" aria-hidden /> {label}
      </p>
      <p className={`mt-1 text-sm font-semibold ${good === false ? "text-navy-700/70" : "text-navy-900"}`}>
        {value}
      </p>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-navy-700/60">
        <Icon className="h-4 w-4" aria-hidden /> {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((i) => (
        <li key={i} className="rounded-full bg-white px-3 py-1 text-sm text-navy-900 shadow-sm">
          {i}
        </li>
      ))}
    </ul>
  );
}
