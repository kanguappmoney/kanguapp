"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cleanName, nameKey, parseList } from "@/lib/coverage";

// Seletor de escola (escolha única + busca). Mostra SÓ a lista de escolas que o motorista atende
// (`driver_schools`); se ele ainda não configurou nenhuma, cai para a busca por digitação nas escolas das
// CIDADES que ele atende (hierarquia cidade → escola; escola é opcional) — nunca bloqueia o cadastro. Só se
// o motorista não tiver nenhuma cidade cadastrada a busca é no estado todo. Em qualquer caso há "Outra escola (digitar)".
// Salva o NOME (texto) no campo `name` — `students.school` continua texto, sem FK.
//
// `source`: "driver" = lista do motorista logado (leitura por RLS dono-only);
//           "link"   = lista do dono de um link de captação ativo (função pública, sem login).
// A restrição é só de tela: o servidor segue aceitando qualquer texto (o motorista aprova cada cadastro).

type Source = { kind: "driver" } | { kind: "link"; token: string };

interface Found {
  label: string;
  hint?: string;
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const LIST_LIMIT = 60;

export function SchoolPicker({
  label = "Escola",
  name = "school",
  initialValue = "",
  source,
  placeholder = "Selecione a escola",
  required = false,
  strict = false,
}: {
  label?: string;
  name?: string;
  initialValue?: string;
  source: Source;
  placeholder?: string;
  required?: boolean;
  // strict: só a lista do motorista (sem busca geral e sem "Outra escola"). Usado no link do pai.
  strict?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [value, setValue] = useState(initialValue);
  const [list, setList] = useState<string[] | null>(null); // null = carregando
  // Cidades atendidas (só lidas quando não há lista de escolas): limitam a busca geral.
  const [scope, setScope] = useState<{ ids: number[]; names: string[] }>({ ids: [], names: [] });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [other, setOther] = useState(false);
  const [found, setFound] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const sourceKey = source.kind === "link" ? source.token : "driver";

  // Lista configurada (pode ser vazia = sem configuração → busca geral).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let names: string[] = [];
        if (source.kind === "link") {
          const { data } = await supabase.rpc("capture_link_schools", { p_token: source.token });
          names = ((data ?? []) as { name: string }[]).map((r) => r.name);
        } else {
          const { data } = await supabase.from("driver_schools").select("schools(name, display_name)");
          type Row = { schools: { name: string; display_name: string | null } | { name: string; display_name: string | null }[] | null };
          names = ((data ?? []) as unknown as Row[])
            .flatMap((r) => (Array.isArray(r.schools) ? r.schools : r.schools ? [r.schools] : []))
            .map((s) => cleanName(s.display_name || s.name));
        }
        const uniq = [...new Set(names.filter(Boolean))].sort((a, b) =>
          a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
        );
        // Sem lista de escolas: descobre as cidades atendidas para limitar a busca.
        let ids: number[] = [];
        let cityNames: string[] = [];
        if (uniq.length === 0) {
          if (source.kind === "link") {
            const { data } = await supabase.rpc("capture_link_cities", { p_token: source.token });
            const rows = (data ?? []) as { city_id: number; name: string }[];
            ids = rows.map((r) => r.city_id);
            cityNames = rows.map((r) => r.name);
          } else {
            const { data: u } = await supabase.auth.getUser();
            const { data: prof } = await supabase
              .from("driver_profiles")
              .select("service_cities")
              .eq("user_id", u.user?.id ?? "")
              .maybeSingle();
            const wanted = new Set(parseList(prof?.service_cities).map(nameKey));
            if (wanted.size > 0) {
              const { data: cs } = await supabase.from("cities").select("id, name").limit(1000);
              const hit = ((cs ?? []) as { id: number; name: string }[]).filter((c) => wanted.has(nameKey(c.name)));
              ids = hit.map((c) => c.id);
              cityNames = hit.map((c) => c.name);
            }
          }
        }
        if (!cancelled) {
          setScope({ ids, names: cityNames });
          setList(uniq);
        }
      } catch {
        if (!cancelled) setList([]); // falha de rede: cai na busca geral, nunca bloqueia
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceKey]);

  // Sem lista configurada: busca por digitação na tabela `schools` (≥ 3 letras, até 20 resultados).
  const configured = list !== null && list.length > 0;
  useEffect(() => {
    if (strict || !open || configured || list === null) return;
    const term = q.replace(/[%,()*\\"]/g, " ").trim();
    if (term.length < 3) {
      setFound([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      let query = supabase
        .from("schools")
        .select("name, display_name, cities(name)")
        .or(`display_name.ilike.%${term}%,name.ilike.%${term}%`);
      if (scope.ids.length > 0) query = query.in("city_id", scope.ids);
      const { data } = await query.order("display_name").limit(20);
      type Row = { name: string; display_name: string | null; cities: { name: string } | { name: string }[] | null };
      const rows = ((data ?? []) as unknown as Row[]).map((r) => {
        const city = Array.isArray(r.cities) ? r.cities[0]?.name : r.cities?.name;
        return { label: cleanName(r.display_name || r.name), hint: city };
      });
      setFound(rows);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q, open, configured, list, supabase, scope]);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const options: Found[] = configured
    ? list!
        .filter((n) => !q.trim() || norm(n).includes(norm(q.trim())))
        .slice(0, LIST_LIMIT)
        .map((n) => ({ label: n }))
    : found;

  function choose(n: string) {
    setValue(n);
    setOpen(false);
    setQ("");
    setOther(false);
  }

  const fieldCls =
    "w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3 outline-none focus:border-navy-700 focus:ring-2 focus:ring-yellow-400/40";

  return (
    <div className="relative" ref={box}>
      <span className="mb-1 block text-sm font-medium text-navy-800">{label}</span>
      <input type="hidden" name={name} value={cleanName(value)} />

      {/* Campo-sombra só para a validação nativa ("preencha este campo") do botão de seleção. */}
      {required && !other && (
        <input
          tabIndex={-1}
          aria-hidden
          required
          value={value}
          onChange={() => {}}
          className="pointer-events-none absolute left-0 top-7 h-10 w-full opacity-0"
        />
      )}
      {other ? (
        <div>
          <input
            autoFocus
            value={value}
            maxLength={120}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            placeholder="Digite o nome da escola"
            aria-label="Nome da escola"
            required={required}
            className={fieldCls}
          />
          <button
            type="button"
            onClick={() => {
              setOther(false);
              setValue("");
              setOpen(true);
            }}
            className="mt-1 text-xs font-medium text-navy-700/70 underline"
          >
            Voltar à lista
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`${fieldCls} flex items-center gap-2 text-left`}
        >
          <Building2 className="h-4 w-4 shrink-0 text-navy-700/40" />
          <span className={`min-w-0 flex-1 truncate ${value ? "text-navy-900" : "text-navy-700/40"}`}>
            {value || placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-navy-700/40" />
        </button>
      )}

      {open && !other && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-navy-900/15 bg-white shadow-lg">
          <div className="border-b border-navy-900/10 p-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              placeholder={configured ? (strict ? "Buscar na lista" : "Buscar nas escolas que você atende") : "Digite 3 letras para buscar"}
              aria-label="Buscar escola"
              className="w-full rounded-lg border border-navy-900/15 px-3 py-2 text-sm outline-none focus:border-navy-700"
            />
          </div>
          <ul role="listbox" className="max-h-60 overflow-y-auto">
            {list === null && <li className="px-3 py-2 text-sm text-navy-700/60">Carregando…</li>}
            {list !== null &&
              options.map((o) => (
                <li key={o.label + (o.hint ?? "")}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.label === value}
                    onClick={() => choose(o.label)}
                    className="w-full px-3 py-2 text-left text-sm text-navy-900 hover:bg-yellow-400/20"
                  >
                    {o.label}
                    {o.hint && <span className="text-navy-700/50"> · {o.hint}</span>}
                  </button>
                </li>
              ))}
            {list !== null && strict && !configured && (
              <li className="px-3 py-2 text-xs text-navy-700/60">
                Este motorista ainda não cadastrou escolas atendidas. Peça a ele para configurar.
              </li>
            )}
            {list !== null && !strict && !configured && q.trim().length < 3 && (
              <li className="px-3 py-2 text-xs text-navy-700/60">
                {scope.names.length > 0
                  ? `Buscando nas escolas de ${scope.names.slice(0, 3).join(", ")}${scope.names.length > 3 ? " e outras" : ""}.`
                  : "Buscando em todo o estado (nenhuma cidade atendida cadastrada)."}{" "}
                Digite o nome da escola.
              </li>
            )}
            {list !== null && !searching && options.length === 0 && (configured || q.trim().length >= 3) && !(strict && !configured) && (
              <li className="px-3 py-2 text-xs text-navy-700/60">Nenhuma escola encontrada.</li>
            )}
            {!strict && (
            <li className="border-t border-navy-900/10">
              <button
                type="button"
                onClick={() => {
                  setOther(true);
                  setOpen(false);
                  setValue(q.trim() ? cleanName(q) : "");
                }}
                className="w-full px-3 py-2.5 text-left text-sm font-semibold text-navy-800 hover:bg-navy-900/[0.04]"
              >
                Outra escola (digitar)
              </button>
            </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
