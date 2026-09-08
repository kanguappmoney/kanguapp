"use client";

import { useState } from "react";
import { Navigation, X } from "lucide-react";

// "Abrir navegação" numa parada: abre um menu rápido (Waze / Google Maps) com o
// endereço/coordenada DAQUELA parada como destino único. Não é rastreio nem toca
// G4 — só abre um link externo com um endereço que o motorista já tem acesso (a
// própria parada dele); G5 intacto. Escopo: uma parada por vez, nunca a rota
// inteira (Waze não faz multi-parada por deep link). Pergunta o app toda vez —
// sem configuração no perfil.
export function NavMenu({
  lat,
  lng,
  address,
  label,
}: {
  lat: number | null;
  lng: number | null;
  address: string | null;
  label: string; // nome da parada, só pro título do menu
}) {
  const [open, setOpen] = useState(false);

  // Preferimos a coordenada (mais precisa); sem ela, cai no endereço em texto.
  const hasDest = (lat != null && lng != null) || !!address?.trim();
  if (!hasDest) return null;

  const coord = lat != null && lng != null;
  const wazeUrl = coord
    ? `https://www.waze.com/ul?ll=${lat},${lng}&navigate=yes`
    : `https://www.waze.com/ul?q=${encodeURIComponent(address!)}&navigate=yes`;
  const gmapsUrl = coord
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address!)}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl border border-navy-900/15 px-3 py-2 text-sm font-medium text-navy-800"
      >
        <Navigation className="h-4 w-4 text-navy-700/70" />
        Abrir navegação
      </button>

      {open && (
        <div
          className="fixed inset-0 z-30 flex items-end bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full rounded-t-3xl bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-navy-900">Abrir navegação</h2>
                <p className="truncate text-sm text-navy-700/60">{label}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="shrink-0 text-navy-700/50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-2">
              <a
                href={wazeUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="block rounded-xl bg-navy-900 py-3 text-center font-semibold text-white"
              >
                Abrir no Waze
              </a>
              <a
                href={gmapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="block rounded-xl border border-navy-900/15 py-3 text-center font-semibold text-navy-900"
              >
                Abrir no Google Maps
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
