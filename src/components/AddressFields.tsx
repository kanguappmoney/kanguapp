"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Check } from "lucide-react";
import { regionParams } from "@/lib/geo-region";

// Endereço em 4 campos obrigatórios: rua (com sugestões do mapa), número, bairro e cidade.
// O mapa NUNCA preenche o número: quem digita é a pessoa. Rua/bairro/cidade vêm da sugestão escolhida,
// mas continuam editáveis. Campos enviados: `${prefix}_street|_number|_neighborhood|_city` + `${prefix}_lat|_lng`
// (coordenada é opcional; some se a rua for alterada depois de escolher a sugestão).
// `${prefix}_address` (texto composto) também é enviado só para exibição; o banco recompõe a partir das partes.
interface Feature {
  place_name: string;
  text?: string;
  center: [number, number];
  context?: { id: string; text: string }[];
}
export interface AddressParts {
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  legacy?: string | null; // endereço antigo em texto único (cadastro sem as partes)
  lat?: number | null;
  lng?: number | null;
}

const input =
  "w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3 outline-none focus:border-navy-700 focus:ring-2 focus:ring-yellow-400/40";

function ctx(f: Feature, kind: string) {
  return f.context?.find((c) => c.id.startsWith(kind))?.text ?? "";
}

export function AddressFields({
  prefix,
  label,
  initial = {},
  required = true,
}: {
  prefix: string;
  label: string;
  initial?: AddressParts;
  required?: boolean;
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  const hasParts = !!(initial.street || initial.number || initial.neighborhood || initial.city);
  const [street, setStreet] = useState(initial.street ?? (hasParts ? "" : (initial.legacy ?? "")));
  const [number, setNumber] = useState(initial.number ?? "");
  const [neigh, setNeigh] = useState(initial.neighborhood ?? "");
  const [city, setCity] = useState(initial.city ?? "");
  const [coords, setCoords] = useState<[number, number] | null>(
    initial.lat != null && initial.lng != null ? [initial.lat, initial.lng] : null,
  );
  const [sugg, setSugg] = useState<Feature[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const legacyOnly = !hasParts && !!initial.legacy;

  // Sugestões enquanto digita a rua (sem coordenada escolhida).
  useEffect(() => {
    if (!token || coords || street.trim().length < 4) {
      setSugg([]);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const q = [street.trim(), city.trim()].filter(Boolean).join(", ");
        const url =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
          `?access_token=${token}&autocomplete=true&country=br&language=pt&limit=5&types=address` +
          regionParams();
        const res = await fetch(url);
        if (!res.ok) return;
        const json = await res.json();
        setSugg(json.features ?? []);
        setOpen(true);
      } catch {
        // silencioso: segue como texto puro
      }
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [street, city, token, coords]);

  // Depois de rua + número + cidade, refina a coordenada com o número (melhor esforço; falha = mantém a anterior).
  useEffect(() => {
    if (!token || !coords || !number.trim() || !street.trim() || !city.trim()) return;
    const t = setTimeout(async () => {
      try {
        const q = `${street.trim()} ${number.trim()}, ${neigh.trim()}, ${city.trim()}`;
        const url =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
          `?access_token=${token}&country=br&language=pt&limit=1&types=address` +
          regionParams();
        const res = await fetch(url);
        if (!res.ok) return;
        const f = (await res.json()).features?.[0] as Feature | undefined;
        if (f) setCoords([f.center[1], f.center[0]]);
      } catch {
        // mantém a coordenada da rua
      }
    }, 700);
    return () => clearTimeout(t);
  }, [number, token]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(f: Feature) {
    setStreet(f.text || f.place_name.split(",")[0]);
    setNeigh(ctx(f, "neighborhood") || ctx(f, "locality") || neigh);
    setCity(ctx(f, "place") || city);
    setCoords([f.center[1], f.center[0]]);
    setSugg([]);
    setOpen(false);
  }

  const composed = [street.trim(), number.trim()].filter(Boolean).join(", ") +
    (neigh.trim() ? ` - ${neigh.trim()}` : "") + (city.trim() ? `, ${city.trim()}` : "");

  return (
    <div className="space-y-3">
      <span className="block text-sm font-semibold text-navy-800">{label}</span>
      {legacyOnly && (
        <p className="rounded-lg bg-yellow-400/20 px-3 py-2 text-xs text-navy-800">
          Endereço antigo: <b>{initial.legacy}</b>. Separe em rua, número, bairro e cidade.
        </p>
      )}
      <div className="relative">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-navy-800">Rua</span>
          <div className="relative">
            <input
              name={`${prefix}_street`}
              required={required}
              autoComplete="off"
              placeholder="Comece a digitar a rua…"
              value={street}
              onChange={(e) => {
                setStreet(e.target.value);
                setCoords(null);
              }}
              onFocus={() => sugg.length > 0 && setOpen(true)}
              className={`${input} pr-9`}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              {coords ? <Check className="h-4 w-4 text-green-600" /> : <MapPin className="h-4 w-4 text-navy-700/40" />}
            </span>
          </div>
        </label>
        {open && sugg.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-navy-900/15 bg-white shadow-lg">
            {sugg.map((f, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => pick(f)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-navy-900/[0.04]"
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-navy-700/40" />
                  <span className="text-navy-800">{f.place_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-navy-800">Número</span>
        <input
          name={`${prefix}_number`}
          required={required}
          autoComplete="off"
          placeholder="Ex.: 123 (ou S/N). Complemento: 123, apto 4"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          className={input}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-navy-800">Bairro</span>
          <input
            name={`${prefix}_neighborhood`}
            required={required}
            autoComplete="off"
            value={neigh}
            onChange={(e) => setNeigh(e.target.value)}
            className={input}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-navy-800">Cidade</span>
          <input
            name={`${prefix}_city`}
            required={required}
            autoComplete="off"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={input}
          />
        </label>
      </div>
      <input type="hidden" name={`${prefix}_address`} value={composed} />
      <input type="hidden" name={`${prefix}_lat`} value={coords ? coords[0] : ""} />
      <input type="hidden" name={`${prefix}_lng`} value={coords ? coords[1] : ""} />
    </div>
  );
}
