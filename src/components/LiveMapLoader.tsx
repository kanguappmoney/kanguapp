"use client";

import dynamic from "next/dynamic";

// Carrega o `mapbox-gl` (~500kB) só quando o Modo Mapa realmente renderiza. No
// modo Linha do tempo — o caminho comum do piloto — o bundle do mapa nem é baixado.
// Corte de custo/peso, coerente com o throttle do Modo Mapa.
const LiveMap = dynamic(
  () => import("@/components/LiveMap").then((m) => m.LiveMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 w-full animate-pulse rounded-2xl bg-navy-900/5" />
    ),
  },
);

export function LiveMapLoader(props: {
  token: string;
  lat: number;
  lng: number;
  heading: number | null;
}) {
  return <LiveMap {...props} />;
}
