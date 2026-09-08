"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { LocateFixed } from "lucide-react";
import type { GeoPoint } from "@/lib/geo";

type DriverPos = GeoPoint & { heading: number | null };
const PITCH = 55;
const FOLLOW_ZOOM = 16;

// easeTo da câmera de condução: centra na van, inclina e gira com o rumo.
function driveCamera(map: mapboxgl.Map, pos: DriverPos, duration: number) {
  map.easeTo({
    center: [pos.lng, pos.lat],
    bearing: pos.heading != null ? pos.heading : map.getBearing(),
    pitch: PITCH,
    zoom: FOLLOW_ZOOM,
    duration,
  });
}

// Mapa interativo do Modo Direção 2.0 (mapbox-gl, tela cheia). Desenha a linha da
// rota + os pinos das paradas + o pino do motorista AO VIVO (GPS). Roda só durante
// a perna in_progress em foreground (janela do G4 — mesma do useDriverPosition que
// alimenta driverPos). É dado do próprio motorista (paradas dele) → G5 ok.
//
// O mapa é criado uma vez; a posição do motorista (prop driverPos, do polling do
// GPS) atualiza o marcador e recentra, como no LiveMap do pai.

export interface DriveMapStop {
  studentId: string;
  position: number;
  lat: number | null;
  lng: number | null;
  done: boolean; // embarcou/desembarcou ou ausente (parada já resolvida)
}

export function DriveMap({
  token,
  stops,
  line,
  anchor,
  driverPos,
}: {
  token: string;
  stops: DriveMapStop[];
  line: [number, number][] | null; // GeoJSON da rota (lng,lat), pode faltar
  anchor: GeoPoint | null; // escola (âncora)
  driverPos: (GeoPoint & { heading: number | null }) | null; // posição + rumo
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const readyRef = useRef(false);
  // "Seguindo" a van (câmera automática) vs. o motorista mexeu na câmera à mão.
  const followRef = useRef(true);
  const lastPosRef = useRef<DriverPos | null>(null);
  const [showRecenter, setShowRecenter] = useState(false);

  // Voltar pro modo condução: recentra na posição atual com pitch/bearing certos
  // e retoma o "seguir" automático.
  function recenter() {
    followRef.current = true;
    setShowRecenter(false);
    const map = mapRef.current;
    const pos = lastPosRef.current;
    if (map && pos) driveCamera(map, pos, 600);
  }

  // Cria o mapa uma vez, com a linha, os pinos das paradas e a escola.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = token;

    const coords = stops
      .filter((s) => s.lat != null && s.lng != null)
      .map((s) => [s.lng as number, s.lat as number] as [number, number]);
    const all = [...coords, ...(anchor ? [[anchor.lng, anchor.lat] as [number, number]] : [])];
    const center: [number, number] = all[0] ?? [-46.46, -23.67]; // fallback Mauá

    // Câmera de condução (estilo Waze/Google): já abre INCLINADA. O bearing gira
    // com o rumo do GPS no efeito de posição. Não é turn-by-turn — só a câmera.
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center,
      zoom: 15,
      pitch: 55,
      attributionControl: false,
    });
    mapRef.current = map;

    // Interação MANUAL do motorista (originalEvent presente) desliga o "seguir" e
    // mostra o botão de recentralizar. Os movimentos programáticos da própria
    // câmera de condução (easeTo) não têm originalEvent → são ignorados aqui.
    const onUserGesture = (e: {
      type: string;
      target: unknown;
      originalEvent?: unknown;
    }) => {
      if (!e.originalEvent) return; // sem originalEvent = movimento programático
      followRef.current = false;
      setShowRecenter(true);
    };
    map.on("dragstart", onUserGesture);
    map.on("rotatestart", onUserGesture);
    map.on("zoomstart", onUserGesture);
    map.on("pitchstart", onUserGesture);

    map.on("load", () => {
      readyRef.current = true;

      // Linha da rota (se a Directions respondeu). Segue as ruas.
      if (line && line.length > 1) {
        map.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: line },
          },
        });
        map.addLayer({
          id: "route",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#0D1B3D", "line-width": 4, "line-opacity": 0.85 },
        });
      }

      // Pinos das paradas (numerados; feitas ficam esmaecidas).
      for (const s of stops) {
        if (s.lat == null || s.lng == null) continue;
        const el = document.createElement("div");
        el.style.cssText =
          "width:26px;height:26px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font:700 12px system-ui;color:#FFD000;background:#0D1B3D;border:2px solid #fff;box-shadow:0 1px 4px rgba(13,27,61,.4)";
        el.textContent = String(s.position);
        if (s.done) el.style.opacity = "0.4";
        new mapboxgl.Marker({ element: el })
          .setLngLat([s.lng, s.lat])
          .addTo(map);
      }

      // Escola (âncora), losango amarelo.
      if (anchor) {
        const el = document.createElement("div");
        el.style.cssText =
          "width:22px;height:22px;background:#FFD000;border:2px solid #0D1B3D;transform:rotate(45deg);box-shadow:0 1px 4px rgba(13,27,61,.4)";
        new mapboxgl.Marker({ element: el })
          .setLngLat([anchor.lng, anchor.lat])
          .addTo(map);
      }

      // Sem fitBounds (que achataria o pitch): a câmera de condução abre inclinada
      // e centrada no início da rota; assim que o GPS chega, passa a seguir a van.
    });

    return () => {
      map.remove();
      mapRef.current = null;
      driverMarkerRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Pino do motorista ao vivo: cria/atualiza conforme o GPS chega. O marcador
  // acompanha SEMPRE; a câmera só segue se o motorista não mexeu (followRef).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !driverPos) return;
    lastPosRef.current = driverPos;
    if (!driverMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:20px;height:20px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,.25)";
      driverMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([driverPos.lng, driverPos.lat])
        .addTo(map);
    } else {
      driverMarkerRef.current.setLngLat([driverPos.lng, driverPos.lat]);
    }
    if (followRef.current) driveCamera(map, driverPos, 800);
  }, [driverPos]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {/* Recentralizar (padrão Waze/Google): só aparece quando o motorista mexeu
          na câmera. Canto superior-direito do mapa, acima do bottom sheet. */}
      {showRecenter && (
        <button
          type="button"
          onClick={recenter}
          aria-label="Recentralizar no meu local"
          className="absolute right-3 top-28 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white text-navy-900 shadow-lg"
        >
          <LocateFixed className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
