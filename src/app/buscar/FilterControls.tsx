"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Controles do filtro público (city-first). A cidade recarrega a busca para trazer os bairros dela (e zera
// bairro/escola, que dependem da cidade); a escola é uma busca por digitação, porque são milhares por cidade.
const FIELD =
  "w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3 outline-none focus:border-navy-700 focus:ring-2 focus:ring-yellow-400/40";

export function CitySelect({ value, options }: { value: string; options: string[] }) {
  const list = value && !options.some((o) => o.toLowerCase() === value.toLowerCase()) ? [value, ...options] : options;
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-navy-800">Cidade</span>
      <select
        name="cidade"
        defaultValue={list.find((o) => o.toLowerCase() === value.toLowerCase()) ?? ""}
        className={FIELD}
        onChange={(e) => {
          const form = e.currentTarget.form;
          if (!form) return;
          // Bairro e escola são da cidade anterior: zera antes de recarregar.
          for (const n of ["bairro", "escola"]) {
            const el = form.elements.namedItem(n) as unknown as { value: string } | null;
            if (el) el.value = "";
          }
          form.requestSubmit();
        }}
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

export function SchoolFilter({ city, initial }: { city: string; initial: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [text, setText] = useState(initial);
  const [chosen, setChosen] = useState(initial);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<{ value: string; driver_count: number }[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !city) return;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("marketplace_school_options", { p_city: city, p_q: text.trim() });
      // Só escolas que ao menos um motorista atende (a função ordena por contagem; zeros ficam de fora).
      setRows(((data ?? []) as { value: string; driver_count: number }[]).filter((r) => r.driver_count > 0));
    }, 250);
    return () => clearTimeout(t);
  }, [text, open, city, supabase]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={box}>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-navy-800">Escola</span>
        <input type="hidden" name="escola" value={chosen} />
        <input
          value={text}
          disabled={!city}
          onChange={(e) => {
            setText(e.target.value);
            setChosen(""); // só vale o que for escolhido na lista
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === "Enter" && open && e.preventDefault()}
          placeholder={city ? "Digite 3 letras do nome da escola" : "Escolha a cidade primeiro"}
          autoComplete="off"
          className={`${FIELD} disabled:bg-navy-900/[0.03] disabled:text-navy-700/50`}
        />
      </label>
      {open && city && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-navy-900/15 bg-white shadow-lg">
          {rows.map((r) => (
            <li key={r.value}>
              <button
                type="button"
                onClick={() => {
                  setText(r.value);
                  setChosen(r.value);
                  setOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-navy-900 hover:bg-yellow-400/20"
              >
                {r.value}
                <span className="text-navy-700/50"> · {r.driver_count} {r.driver_count === 1 ? "motorista" : "motoristas"}</span>
              </button>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="px-3 py-2 text-xs text-navy-700/60">
              {text.trim().length < 3 ? "Digite ao menos 3 letras." : "Nenhuma escola atendida por motoristas encontrada nesta cidade."}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
