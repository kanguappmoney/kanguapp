import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Car, Search } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Throttled } from "@/components/Throttled";
import { centsToBRL } from "@/lib/money";
import { limitMarketplace } from "@/lib/rate-limit";
import {
  PAGE_SIZE,
  SHIFTS,
  SHIFT_LABEL,
  getFilterOptions,
  logSearch,
  parseFilters,
  parsePage,
  searchDrivers,
  vanPhotoUrl,
  type Driver,
  type Filters,
} from "@/lib/marketplace";

export const metadata: Metadata = {
  title: "Encontrar motorista — Kangu",
  description: "Busque motoristas de transporte escolar por cidade, bairro, escola, idade e turno.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Tela pública (sem login): busca de motoristas. Filtros na URL (GET), resultados
// paginados no banco.
export default async function BuscarPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;

  const rate = await limitMarketplace("search");
  if (!rate.ok) return <Throttled seconds={rate.retryAfterSec} />;

  const filters = parseFilters(sp);
  const page = parsePage(sp);
  // Uma linha por BUSCA nova: paginar (página > 1) não conta de novo. Só filtros + hora.
  if (page === 1) await logSearch(filters);
  const [options, { drivers, total, error }] = await Promise.all([
    getFilterOptions(),
    searchDrivers(filters, page),
  ]);
  const cards = await Promise.all(
    drivers.map(async (d) => ({ d, photo: await vanPhotoUrl(d.van_photo_path) })),
  );
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(
    filters.city || filters.neighborhood || filters.school || filters.age !== null || filters.shift,
  );
  const noOptions =
    !options.city.length && !options.neighborhood.length && !options.school.length;

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 py-6">
      <header className="mb-5 flex items-center gap-3">
        <Logo variant="icon" className="h-10 w-10" />
        <div>
          <h1 className="font-display text-xl text-navy-900">Encontrar motorista</h1>
          <p className="text-xs text-navy-700/60">Transporte escolar perto de você</p>
        </div>
      </header>

      <form action="/buscar" method="get" className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <SelectField label="Cidade" name="cidade" value={filters.city} options={options.city} />
        <SelectField label="Bairro" name="bairro" value={filters.neighborhood} options={options.neighborhood} />
        <SelectField label="Escola" name="escola" value={filters.school} options={options.school} />
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-navy-800">Idade do filho</span>
            <input
              type="number"
              name="idade"
              min={0}
              max={30}
              inputMode="numeric"
              defaultValue={filters.age ?? ""}
              placeholder="Ex.: 8"
              className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-navy-800">Turno</span>
            <select
              name="turno"
              defaultValue={filters.shift ?? ""}
              className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3"
            >
              <option value="">Todos</option>
              {SHIFTS.map((s) => (
                <option key={s} value={s}>
                  {SHIFT_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900"
          >
            <Search className="h-5 w-5" aria-hidden />
            Buscar
          </button>
          {hasFilters && (
            <Link
              href="/buscar"
              className="flex items-center justify-center rounded-xl border border-navy-900/15 px-4 py-3 text-sm font-semibold text-navy-900"
            >
              Limpar
            </Link>
          )}
        </div>
      </form>

      <section className="mt-5" aria-live="polite">
        {error ? (
          <Notice>Não foi possível buscar agora. Tente novamente em instantes.</Notice>
        ) : noOptions && !hasFilters ? (
          <Notice>Ainda não há motoristas disponíveis. Volte em breve.</Notice>
        ) : total === 0 && page > 1 ? (
          <Notice>
            Essa página não existe mais.{" "}
            <Link href={pageHref(filters, 1)} className="font-semibold underline">
              Voltar ao início
            </Link>
          </Notice>
        ) : total === 0 ? (
          <Notice>Nenhum motorista encontrado com esses filtros. Tente ampliar a busca.</Notice>
        ) : (
          <>
            <p className="mb-3 text-sm text-navy-700/70" data-testid="total">
              {total} {total === 1 ? "motorista encontrado" : "motoristas encontrados"}
            </p>
            <ul className="space-y-3">
              {cards.map(({ d, photo }) => (
                <DriverCard key={d.public_id} d={d} photo={photo} />
              ))}
            </ul>
            {pages > 1 && (
              <nav className="mt-5 flex items-center justify-between" aria-label="Paginação">
                {page > 1 ? (
                  <Link
                    href={pageHref(filters, page - 1)}
                    className="flex items-center gap-1 rounded-xl border border-navy-900/15 bg-white px-4 py-2 text-sm font-semibold"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-sm text-navy-700/70">
                  Página {page} de {pages}
                </span>
                {page < pages ? (
                  <Link
                    href={pageHref(filters, page + 1)}
                    className="flex items-center gap-1 rounded-xl border border-navy-900/15 bg-white px-4 py-2 text-sm font-semibold"
                  >
                    Próxima <ChevronRight className="h-4 w-4" aria-hidden />
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function pageHref(f: Filters, page: number) {
  const q = new URLSearchParams();
  if (f.city) q.set("cidade", f.city);
  if (f.neighborhood) q.set("bairro", f.neighborhood);
  if (f.school) q.set("escola", f.school);
  if (f.age !== null) q.set("idade", String(f.age));
  if (f.shift) q.set("turno", f.shift);
  if (page > 1) q.set("pagina", String(page));
  const s = q.toString();
  return s ? `/buscar?${s}` : "/buscar";
}

function DriverCard({ d, photo }: { d: Driver; photo: string }) {
  const spots =
    d.spots_available > 0
      ? `${d.spots_available} ${d.spots_available === 1 ? "vaga" : "vagas"}`
      : "Sem vagas no momento";
  return (
    <li>
      {/* prefetch off: o perfil conta no limite de requisições por IP */}
      <Link
        href={`/buscar/${d.public_id}`}
        prefetch={false}
        className="block overflow-hidden rounded-2xl bg-white shadow-sm"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt={`Van de ${d.driver_name}`} className="h-40 w-full object-cover" />
        <div className="p-4">
          <p className="text-lg font-bold text-navy-900">{d.driver_name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-navy-700/70">
            <Car className="h-4 w-4" aria-hidden /> {d.van_model}
          </p>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                d.spots_available > 0 ? "bg-green-100 text-green-800" : "bg-navy-900/5 text-navy-700/70"
              }`}
            >
              {spots}
            </span>
            <span className="font-semibold text-navy-900">
              {centsToBRL(d.price_min_cents)} a {centsToBRL(d.price_max_cents)}
              <span className="font-normal text-navy-700/60"> /mês</span>
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}

function SelectField({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value: string;
  options: string[];
}) {
  // Valor vindo da URL que não está mais nas opções continua selecionável.
  const list = value && !options.some((o) => o.toLowerCase() === value.toLowerCase()) ? [value, ...options] : options;
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-navy-800">{label}</span>
      <select
        name={name}
        defaultValue={list.find((o) => o.toLowerCase() === value.toLowerCase()) ?? ""}
        className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3"
      >
        <option value="">Todas</option>
        {list.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl bg-white p-5 text-center text-sm text-navy-700/70 shadow-sm">
      {children}
    </p>
  );
}
