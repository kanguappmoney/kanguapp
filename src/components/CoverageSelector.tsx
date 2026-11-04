"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_SCHOOLS_PER_CITY,
  cleanName,
  joinList,
  nameKey,
  parseList,
  sortPt,
} from "@/lib/coverage";

// Seleção guiada da cobertura (Cobertura guiada, parte 3). Estado fixo SP → cidades (tabela
// `cities`) → por cidade: escolas (tabela `schools`, checklist) e bairros (pool `neighborhoods`,
// que cresce com "+ adicionar bairro"). A SAÍDA é a mesma da Frente C: três inputs escondidos
// `service_cities` / `service_neighborhoods` / `service_schools` com nomes separados por vírgula
// — a action, a função pública (Frente D) e o filtro de busca (Frente E) não mudam.
//
// Cadastros antigos (texto livre) não se perdem: o que não casar com a base fica como "cadastro
// antigo" (removível) e continua sendo salvo. Enquanto a base carrega, os inputs devolvem o valor
// ORIGINAL — um envio apressado nunca apaga a cobertura.

interface City {
  id: number;
  name: string;
}
interface CityData {
  schools: string[];
  hoods: string[];
}
interface Pick {
  schools: string[];
  hoods: string[];
}

const PAGE = 1000; // limite do PostgREST por requisição
const LIST_LIMIT = 200; // linhas desenhadas por vez (a capital tem 7.304 escolas)

async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export function CoverageSelector({
  initialCities,
  initialNeighborhoods,
  initialSchools,
}: {
  initialCities: string | null;
  initialNeighborhoods: string | null;
  initialSchools: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [allCities, setAllCities] = useState<City[]>([]);
  const [chosen, setChosen] = useState<City[]>([]);
  const [data, setData] = useState<Record<number, CityData>>({});
  const [pick, setPick] = useState<Record<number, Pick>>({});
  const [legacy, setLegacy] = useState<{ cities: string[]; schools: string[]; hoods: string[] }>({
    cities: [],
    schools: [],
    hoods: [],
  });
  const [adding, setAdding] = useState(false);

  async function loadCity(id: number): Promise<CityData> {
    const [schools, hoods] = await Promise.all([
      fetchAll<{ name: string }>((from, to) =>
        supabase.from("schools").select("name").eq("city_id", id).order("inep_code").range(from, to),
      ),
      fetchAll<{ name: string }>((from, to) =>
        supabase.from("neighborhoods").select("name").eq("city_id", id).order("id").range(from, to),
      ),
    ]);
    const uniq = (rows: { name: string }[]) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const r of rows) {
        const n = cleanName(r.name);
        const k = n.toLowerCase();
        if (n && !seen.has(k)) {
          seen.add(k);
          out.push(n);
        }
      }
      return sortPt(out);
    };
    return { schools: uniq(schools), hoods: uniq(hoods) };
  }

  // Carga inicial: cidades → casa o texto salvo com a base → escolas/bairros das cidades casadas.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadError(false);
        const cities = await fetchAll<City>((from, to) =>
          supabase.from("cities").select("id, name").order("id").range(from, to),
        );
        const sorted = [...cities].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
        const byKey = new Map(sorted.map((c) => [nameKey(c.name), c]));

        const savedCities = parseList(initialCities);
        const matched: City[] = [];
        const legacyCities: string[] = [];
        for (const n of savedCities) {
          const c = byKey.get(nameKey(n));
          if (c && !matched.some((m) => m.id === c.id)) matched.push(c);
          else if (!c) legacyCities.push(n);
        }

        const loaded = await Promise.all(matched.map((c) => loadCity(c.id)));
        const nextData: Record<number, CityData> = {};
        const nextPick: Record<number, Pick> = {};
        const unusedSchools = new Map(parseList(initialSchools).map((n) => [nameKey(n), n]));
        const unusedHoods = new Map(parseList(initialNeighborhoods).map((n) => [nameKey(n), n]));
        matched.forEach((c, i) => {
          nextData[c.id] = loaded[i];
          const schools = loaded[i].schools.filter((n) => unusedSchools.has(nameKey(n)));
          const hoods = loaded[i].hoods.filter((n) => unusedHoods.has(nameKey(n)));
          nextPick[c.id] = { schools, hoods };
        });
        // O que casou com alguma cidade sai da lista de "antigos"; o resto fica preservado.
        for (const p of Object.values(nextPick)) {
          for (const n of p.schools) unusedSchools.delete(nameKey(n));
          for (const n of p.hoods) unusedHoods.delete(nameKey(n));
        }
        if (cancelled) return;
        setAllCities(sorted);
        setChosen(matched);
        setData(nextData);
        setPick(nextPick);
        setLegacy({
          cities: legacyCities,
          schools: [...unusedSchools.values()],
          hoods: [...unusedHoods.values()],
        });
        setReady(true);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retry]);

  async function addCity(c: City) {
    setAdding(false);
    if (chosen.some((x) => x.id === c.id)) return;
    try {
      const d = data[c.id] ?? (await loadCity(c.id));
      setData((p) => ({ ...p, [c.id]: d }));
      setPick((p) => ({ ...p, [c.id]: p[c.id] ?? { schools: [], hoods: [] } }));
      setChosen((p) => [...p, c]);
    } catch {
      setLoadError(true);
    }
  }

  function removeCity(c: City) {
    const p = pick[c.id];
    if (p && p.schools.length + p.hoods.length > 0 && !window.confirm(`Remover ${c.name} e as escolas/bairros marcados nela?`)) return;
    setChosen((prev) => prev.filter((x) => x.id !== c.id));
    setPick((prev) => {
      const next = { ...prev };
      delete next[c.id];
      return next;
    });
  }

  function setPicked(id: number, kind: "schools" | "hoods", names: string[]) {
    setPick((p) => ({ ...p, [id]: { ...(p[id] ?? { schools: [], hoods: [] }), [kind]: names } }));
  }

  // Valores que vão no submit.
  const outCities = ready ? joinList([...chosen.map((c) => c.name), ...legacy.cities]) : (initialCities ?? "");
  const outSchools = ready
    ? joinList([...chosen.flatMap((c) => pick[c.id]?.schools ?? []), ...legacy.schools])
    : (initialSchools ?? "");
  const outHoods = ready
    ? joinList([...chosen.flatMap((c) => pick[c.id]?.hoods ?? []), ...legacy.hoods])
    : (initialNeighborhoods ?? "");

  const remaining = allCities.filter((c) => !chosen.some((x) => x.id === c.id));

  return (
    <div className="space-y-3">
      <input type="hidden" name="service_cities" value={outCities} />
      <input type="hidden" name="service_neighborhoods" value={outHoods} />
      <input type="hidden" name="service_schools" value={outSchools} />

      <div className="rounded-xl border border-navy-900/10 bg-navy-900/[0.03] px-3 py-2 text-sm text-navy-800">
        Estado: <strong>SP</strong>
      </div>

      {loadError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Não foi possível carregar as cidades.{" "}
          <button type="button" onClick={() => { setLoadError(false); setRetry((n) => n + 1); }} className="font-semibold underline">
            Tentar de novo
          </button>
          . Sua cobertura atual será mantida ao salvar.
        </p>
      )}
      {!ready && !loadError && <p className="text-sm text-navy-700/60">Carregando cidades…</p>}

      {ready && (
        <>
          {chosen.length === 0 && (
            <p className="text-sm text-navy-700/60">Nenhuma cidade escolhida ainda.</p>
          )}
          {chosen.map((c) => (
            <CityCard
              key={c.id}
              city={c}
              data={data[c.id] ?? { schools: [], hoods: [] }}
              pick={pick[c.id] ?? { schools: [], hoods: [] }}
              onRemove={() => removeCity(c)}
              onSchools={(names) => setPicked(c.id, "schools", names)}
              onHoods={(names) => setPicked(c.id, "hoods", names)}
              onNewHood={(name) =>
                setData((p) => ({
                  ...p,
                  [c.id]: { ...p[c.id], hoods: sortPt([...(p[c.id]?.hoods ?? []).filter((h) => nameKey(h) !== nameKey(name)), name]) },
                }))
              }
              supabase={supabase}
            />
          ))}

          {adding ? (
            <CityPicker cities={remaining} onPick={addCity} onCancel={() => setAdding(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-navy-900/30 py-3 text-sm font-semibold text-navy-800"
            >
              <Plus className="h-4 w-4" />
              {chosen.length === 0 ? "Adicionar cidade" : "Adicionar outra cidade"}
            </button>
          )}

          {(legacy.cities.length > 0 || legacy.schools.length > 0 || legacy.hoods.length > 0) && (
            <div className="rounded-xl border border-yellow-400/60 bg-yellow-400/10 p-3">
              <p className="text-xs font-semibold text-navy-800">
                Do cadastro antigo (não estão na lista oficial)
              </p>
              <p className="mb-2 text-xs text-navy-700/60">
                Continuam sendo salvos. Remova o que não usa mais.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(["cities", "schools", "hoods"] as const).flatMap((k) =>
                  legacy[k].map((n) => (
                    <button
                      key={`${k}:${n}`}
                      type="button"
                      onClick={() => setLegacy((l) => ({ ...l, [k]: l[k].filter((x) => x !== n) }))}
                      className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-navy-800 ring-1 ring-navy-900/15"
                      aria-label={`Remover ${n}`}
                    >
                      {n}
                      <X className="h-3 w-3" />
                    </button>
                  )),
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CityPicker({
  cities,
  onPick,
  onCancel,
}: {
  cities: City[];
  onPick: (c: City) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState("");
  const k = nameKey(q);
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const found = (k ? cities.filter((c) => norm(c.name).includes(norm(q))) : cities).slice(0, 8);
  return (
    <div className="rounded-xl border border-navy-900/15 bg-white p-3">
      <div className="flex gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          placeholder="Digite o nome da cidade"
          aria-label="Buscar cidade"
          className="w-full rounded-lg border border-navy-900/15 px-3 py-2 text-sm outline-none focus:border-navy-700"
        />
        <button type="button" onClick={onCancel} className="shrink-0 px-2 text-sm text-navy-700/70">
          Cancelar
        </button>
      </div>
      <ul className="mt-2 max-h-64 overflow-y-auto">
        {found.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onPick(c)}
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-navy-900 hover:bg-yellow-400/20"
            >
              {c.name}
            </button>
          </li>
        ))}
        {found.length === 0 && <li className="px-3 py-2 text-sm text-navy-700/60">Nenhuma cidade encontrada.</li>}
      </ul>
    </div>
  );
}

function CityCard({
  city,
  data,
  pick,
  onRemove,
  onSchools,
  onHoods,
  onNewHood,
  supabase,
}: {
  city: City;
  data: CityData;
  pick: Pick;
  onRemove: () => void;
  onSchools: (names: string[]) => void;
  onHoods: (names: string[]) => void;
  onNewHood: (name: string) => void;
  supabase: ReturnType<typeof createClient>;
}) {
  return (
    <section className="rounded-xl border border-navy-900/15 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-navy-900">{city.name}</h3>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover ${city.name}`}
          className="flex items-center gap-1 text-xs text-navy-700/70"
        >
          <X className="h-4 w-4" /> Remover
        </button>
      </div>

      <Checklist
        title="Escolas atendidas"
        options={data.schools}
        selected={pick.schools}
        onChange={onSchools}
        max={MAX_SCHOOLS_PER_CITY}
        empty="Nenhuma escola cadastrada para esta cidade."
      />

      <Checklist
        title="Bairros atendidos"
        options={data.hoods}
        selected={pick.hoods}
        onChange={onHoods}
        empty="Ainda não há bairros para esta cidade — adicione o primeiro."
      >
        <NewHood
          cityId={city.id}
          supabase={supabase}
          onAdded={(name) => {
            onNewHood(name);
            if (!pick.hoods.some((h) => nameKey(h) === nameKey(name))) onHoods([...pick.hoods, name]);
          }}
        />
      </Checklist>
    </section>
  );
}

function Checklist({
  title,
  options,
  selected,
  onChange,
  max,
  empty,
  children,
}: {
  title: string;
  options: string[];
  selected: string[];
  onChange: (names: string[]) => void;
  max?: number;
  empty: string;
  children?: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const selKeys = new Set(selected.map(nameKey));
  const filtered = q.trim() ? options.filter((o) => norm(o).includes(norm(q.trim()))) : options;
  const shown = filtered.slice(0, LIST_LIMIT);
  const room = max === undefined ? Infinity : max - selected.length;

  function toggle(name: string) {
    if (selKeys.has(nameKey(name))) onChange(selected.filter((s) => nameKey(s) !== nameKey(name)));
    else if (room > 0) onChange([...selected, name]);
  }

  // "Selecionar todas" age sobre o que a busca mostra. Com um teto (escolas), recusa listas maiores
  // que o espaço — a capital tem milhares, e marcar todas poluiria o perfil público.
  const toAdd = filtered.filter((o) => !selKeys.has(nameKey(o)));
  const canAll = toAdd.length > 0 && toAdd.length <= room;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-navy-800">
          {title}{" "}
          <span className="text-xs font-normal text-navy-700/60">
            ({selected.length}
            {max !== undefined ? `/${max}` : ""} selecionad{selected.length === 1 ? "a" : "as"})
          </span>
        </h4>
      </div>

      {options.length === 0 ? (
        <p className="mt-1 text-xs text-navy-700/60">{empty}</p>
      ) : (
        <>
          <div className="mt-1 flex gap-2">
            {options.length > 12 && (
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                placeholder="Buscar"
                aria-label={`Buscar em ${title}`}
                className="min-w-0 flex-1 rounded-lg border border-navy-900/15 px-3 py-2 text-sm outline-none focus:border-navy-700"
              />
            )}
            <button
              type="button"
              disabled={!canAll}
              onClick={() => onChange([...selected, ...toAdd])}
              className="shrink-0 rounded-lg border border-navy-900/20 px-3 py-2 text-xs font-semibold text-navy-800 disabled:opacity-40"
            >
              Selecionar todas
            </button>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="shrink-0 px-1 text-xs text-navy-700/70"
              >
                Limpar
              </button>
            )}
          </div>
          {max !== undefined && toAdd.length > room && toAdd.length > 0 && (
            <p className="mt-1 text-xs text-navy-700/60">
              São {toAdd.length} resultados — use a busca para marcar até {max} escolas no total.
            </p>
          )}
          <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto rounded-lg border border-navy-900/10 p-1">
            {shown.map((o) => {
              const on = selKeys.has(nameKey(o));
              return (
                <li key={o}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-navy-900/[0.03]">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!on && room <= 0}
                      onChange={() => toggle(o)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-navy-900"
                    />
                    <span className="text-navy-900">{o}</span>
                  </label>
                </li>
              );
            })}
            {filtered.length === 0 && <li className="px-2 py-1.5 text-xs text-navy-700/60">Nada encontrado.</li>}
          </ul>
          {filtered.length > shown.length && (
            <p className="mt-1 text-xs text-navy-700/60">
              Mostrando {shown.length} de {filtered.length} — busque pelo nome para achar a sua.
            </p>
          )}
        </>
      )}
      {children}
    </div>
  );
}

function NewHood({
  cityId,
  supabase,
  onAdded,
}: {
  cityId: number;
  supabase: ReturnType<typeof createClient>;
  onAdded: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.rpc("add_neighborhood", { p_city_id: cityId, p_name: name });
    setBusy(false);
    if (error || typeof data !== "string") {
      setErr(error?.message ?? "Não foi possível adicionar o bairro.");
      return;
    }
    onAdded(data);
    setName("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 flex items-center gap-1 text-sm font-semibold text-navy-800"
      >
        <Plus className="h-4 w-4" /> Adicionar bairro
      </button>
    );
  }
  return (
    <div className="mt-2">
      <div className="flex gap-2">
        <input
          autoFocus
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            // Enter aqui não pode enviar o formulário do perfil inteiro.
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Nome do bairro"
          aria-label="Nome do novo bairro"
          className="min-w-0 flex-1 rounded-lg border border-navy-900/15 px-3 py-2 text-sm outline-none focus:border-navy-700"
        />
        <button
          type="button"
          disabled={busy || cleanName(name).length < 2}
          onClick={() => void submit()}
          className="shrink-0 rounded-lg bg-yellow-400 px-3 py-2 text-sm font-semibold text-navy-900 disabled:opacity-50"
        >
          {busy ? "…" : "Adicionar"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setErr(null); }} className="shrink-0 px-1 text-sm text-navy-700/70">
          Cancelar
        </button>
      </div>
      {err && <p className="mt-1 text-xs text-red-700">{err}</p>}
      <p className="mt-1 text-xs text-navy-700/50">O bairro fica disponível para os próximos motoristas desta cidade.</p>
    </div>
  );
}
