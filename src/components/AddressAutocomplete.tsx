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
//
// initialValue/initialLat/initialLng hidratam o campo na EDIÇÃO (ou onde um
// endereço já existe): a coordenada guardada é PRESERVADA até o texto mudar de
// fato — editar o endereço invalida a coordenada (força re-selecionar). onChange
// avisa o pai a cada mudança de valor/coordenada — usado pelo cadastro para
// espelhar o embarque no desembarque ("mesmo endereço") junto com a coordenada.
//
// withNumber liga um sub-campo "número/complemento" (só embarque/desembarque):
// entra na query do geocoding (coordenada mais precisa: importa p/ rota otimizada
// e gate 100m) e é concatenado ao endereço salvo (sem coluna nova — Endereço 2.0
// fica na seção 10). O sub-campo só aparece quando o motorista MEXE no endereço,
// nunca ao abrir a edição de um aluno já salvo (onde o número já está embutido no
// texto e um campo vazio confundiria).
export function AddressAutocomplete({
  label,
  name,
  latName,
  lngName,
  placeholder,
  required = true,
  initialValue = "",
  initialLat = null,
  initialLng = null,
  onChange,
  withNumber = false,
}: {
  label: string;
  name: string;
  latName: string;
  lngName: string;
  placeholder?: string;
  required?: boolean;
  initialValue?: string;
  initialLat?: number | null;
  initialLng?: number | null;
  onChange?: (d: { value: string; lat: number | null; lng: number | null }) => void;
  withNumber?: boolean;
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  const [value, setValue] = useState(initialValue);
  const [numero, setNumero] = useState("");
  // Sub-campo escondido ao abrir uma edição já preenchida; revela ao mexer no
  // endereço (regra pedida: não mostrar campo vazio sobre endereço já salvo).
  const [showNumber, setShowNumber] = useState(withNumber && !initialValue);
  const [coords, setCoords] = useState<[number, number] | null>(
    initialLat != null && initialLng != null ? [initialLat, initialLng] : null,
  ); // [lat, lng]
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Endereço + número numa string só (o que vai pro geocoding e pro campo salvo).
  function combine(v: string, num: string) {
    return [v.trim(), withNumber ? num.trim() : ""].filter(Boolean).join(", ");
  }

  // Espelha valor(combinado)/coordenada para o pai (quem não passa onChange ignora).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  function emit(v: string, num: string, c: [number, number] | null) {
    onChangeRef.current?.({
      value: combine(v, num),
      lat: c ? c[0] : null,
      lng: c ? c[1] : null,
    });
  }

  useEffect(() => {
    if (!token) return; // sem token: campo de texto simples, sem busca
    const q = combine(value, numero);
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
  }, [value, numero, token, coords]);

  function pick(s: Suggestion) {
    const c: [number, number] = [s.center[1], s.center[0]]; // [lat, lng]
    // A sugestão já é o endereço canônico (buscamos COM o número), então o número
    // vira parte do place_name — zera o sub-campo pra não duplicar no texto salvo.
    setValue(s.place_name);
    setCoords(c);
    setNumero("");
    setSuggestions([]);
    setOpen(false);
    emit(s.place_name, "", c);
  }

  return (
    <label className="relative block">
      <span className="mb-1 block text-sm font-medium text-navy-800">{label}</span>
      <div className="relative">
        <input
          // Com withNumber, o campo salvo (name) é o texto COMBINADO (endereço +
          // número), então o input visível fica sem name — só exibe o endereço.
          name={withNumber ? undefined : name}
          required={required}
          placeholder={placeholder}
          autoComplete="off"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setCoords(null); // editar invalida a coordenada escolhida
            if (withNumber) setShowNumber(true); // mexeu no endereço → revela número
            emit(e.target.value, numero, null);
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

      {/* Sub-campo número/complemento: entra na query e no endereço salvo. Só
          aparece quando o motorista está mexendo no endereço (não sobre um já
          salvo, onde o número já vive embutido no texto). */}
      {withNumber && showNumber && (
        <input
          type="text"
          placeholder="Número / complemento (ex.: 123, apto 4)"
          value={numero}
          onChange={(e) => {
            setNumero(e.target.value);
            // Antes de um pick (sem coord), o número refina a busca. Depois de um
            // pick (coord já precisa), é complemento (apto/bloco) e NÃO mexe no
            // ponto — preserva a coordenada boa em vez de descartá-la.
            emit(value, e.target.value, coords);
          }}
          className="mt-2 w-full rounded-xl border border-navy-900/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-yellow-400/40"
        />
      )}

      {/* Campo salvo: com withNumber, o texto combinado (endereço + número). */}
      {withNumber && (
        <input type="hidden" name={name} value={combine(value, numero)} />
      )}

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
