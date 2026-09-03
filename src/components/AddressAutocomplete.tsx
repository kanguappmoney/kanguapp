"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Check } from "lucide-react";

interface Suggestion {
  place_name: string;
  center: [number, number]; // [lng, lat]
}

// Autocomplete de endereço via Mapbox Geocoding. Grava place_name no campo de
// texto e lat/lng em inputs escondidos. Sem NEXT_PUBLIC_MAPBOX_TOKEN, degrada
// para um campo de texto normal (o endereço ainda envia, só sem coordenada).
// É a fatia 1 de Rotas 2.0, aplicada no lugar onde o endereço de casa é digitado.
export function AddressAutocomplete({
  label,
  name,
  latName,
  lngName,
  placeholder,
  required = true,
}: {
  label: string;
  name: string;
  latName: string;
  lngName: string;
  placeholder?: string;
  required?: boolean;
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  const [value, setValue] = useState("");
  const [coords, setCoords] = useState<[number, number] | null>(null); // [lat, lng]
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token) return; // sem token: campo de texto simples, sem busca
    const q = value.trim();
    if (coords || q.length < 4) {
      setSuggestions([]);
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const url =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
          `?access_token=${token}&autocomplete=true&country=br&language=pt&limit=5&types=address,place,locality,neighborhood`;
        const res = await fetch(url);
        if (!res.ok) return;
        const json = await res.json();
        setSuggestions(json.features ?? []);
        setOpen(true);
      } catch {
        // rede/token inválido: silencioso, cai no texto puro
      }
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [value, token, coords]);

  function pick(s: Suggestion) {
    setValue(s.place_name);
    setCoords([s.center[1], s.center[0]]); // [lat, lng]
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <label className="relative block">
      <span className="mb-1 block text-sm font-medium text-navy-800">{label}</span>
      <div className="relative">
        <input
          name={name}
          required={required}
          placeholder={placeholder}
          autoComplete="off"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setCoords(null); // editar invalida a coordenada escolhida
          }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3 pr-9 outline-none focus:border-navy-700 focus:ring-2 focus:ring-yellow-400/40"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
          {coords ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <MapPin className="h-4 w-4 text-navy-700/40" />
          )}
        </span>
      </div>

      {/* Coordenada escolhida (vazia se o pai digitou à mão sem selecionar). */}
      <input type="hidden" name={latName} value={coords ? coords[0] : ""} />
      <input type="hidden" name={lngName} value={coords ? coords[1] : ""} />

      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-navy-900/15 bg-white shadow-lg">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => pick(s)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-navy-900/[0.04]"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-navy-700/40" />
                <span className="text-navy-800">{s.place_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {coords && (
        <span className="mt-1 block text-xs text-green-700">
          Endereço localizado no mapa.
        </span>
      )}
    </label>
  );
}
