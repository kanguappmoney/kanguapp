"use client";

import dynamic from "next/dynamic";
import type { GeoPoint } from "@/lib/geo";
import type { DriveMapStop } from "@/components/DriveMap";

// Carrega o mapbox-gl só quando o Modo Direção 2.0 (mapa) realmente renderiza —
// mesmo corte de peso do LiveMap do pai. Em Linha do tempo (sem mapa) o bundle
// nem é baixado.
const DriveMap = dynamic(
  () => import("@/components/DriveMap").then((m) => m.DriveMap),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse bg-navy-900/5" />,
  },
);

export function DriveMapLoader(props: {
  token: string;
  stops: DriveMapStop[];
  line: [number, number][] | null;
  anchor: GeoPoint | null;
  driverPos: GeoPoint | null;
}) {
  return <DriveMap {...props} />;
}
