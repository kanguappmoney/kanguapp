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
  photoUrl?: string | null; // foto do aluno (bolinha da próxima parada)
}

const NAVY = "#0D1B3D";
const YELLOW = "#FFD000";

// Pino de parada: número (azul-marinho) — a PRÓXIMA parada vira uma bolinha maior com a foto do aluno
// (ou a inicial, sem foto) e o número num selo amarelo no canto. Feitas ficam esmaecidas.
function styleStopMarker(el: HTMLDivElement, s: DriveMapStop, isNext: boolean, name: string) {
  el.innerHTML = "";
  el.style.opacity = s.done ? "0.4" : "1";
  if (!isNext) {
    el.style.cssText =
      `width:26px;height:26px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font:700 12px system-ui;color:${YELLOW};background:${NAVY};border:2px solid #fff;box-shadow:0 1px 4px rgba(13,27,61,.4);opacity:${s.done ? 0.4 : 1}`;
    el.textContent = String(s.position);
    return;
  }
  el.style.cssText = "position:relative;width:52px;height:52px;z-index:5";
  const face = document.createElement("div");
  face.style.cssText =
    `width:52px;height:52px;border-radius:9999px;overflow:hidden;border:3px solid ${YELLOW};background:${NAVY};box-shadow:0 2px 8px rgba(13,27,61,.5);display:flex;align-items:center;justify-content:center;color:#fff;font:700 20px system-ui`;
  if (s.photoUrl) {
    const img = document.createElement("img");
    img.src = s.photoUrl;
    img.alt = "";
    img.style.cssText = "width:100%;height:100%;object-fit:cover";
    face.appendChild(img);
  } else {
    face.textContent = (name.trim()[0] ?? "?").toUpperCase();
  }
  const badge = document.createElement("div");
  badge.style.cssText =
    `position:absolute;right:-6px;bottom:-6px;min-width:22px;height:22px;padding:0 4px;border-radius:9999px;background:${YELLOW};color:${NAVY};border:2px solid ${NAVY};display:flex;align-items:center;justify-content:center;font:800 12px system-ui`;
  badge.textContent = String(s.position);
  el.appendChild(face);
  el.appendChild(badge);
}

// Marcador do motorista: o canguru (ícone da marca) num círculo amarelo com halo. A câmera gira com o rumo,
// então o canguru fica "para frente" na tela, como o carrinho do Waze/Google.
function makeDriverEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText =
    `width:48px;height:48px;border-radius:9999px;background:${YELLOW};border:3px solid #fff;box-shadow:0 0 0 8px rgba(255,208,0,.28),0 2px 8px rgba(13,27,61,.5);display:flex;align-items:center;justify-content:center;overflow:hidden`;
  const img = document.createElement("img");
  img.src = "/brand/kangu-icon.png";
  img.alt = "";
  img.style.cssText = "width:42px;height:42px";
  el.appendChild(img);
  return el;
}

export function DriveMap({
  token,
  stops,
  line,
  anchor,
  driverPos,
  navLine = null,
  nextStopId = null,
  stopNames = {},
}: {
  token: string;
  stops: DriveMapStop[];
  line: [number, number][] | null; // GeoJSON da rota (lng,lat), pode faltar
  anchor: GeoPoint | null; // escola (âncora)
  driverPos: (GeoPoint & { heading: number | null }) | null; // posição + rumo
  navLine?: [number, number][] | null; // trecho da navegação no app (van → próxima parada)
  nextStopId?: string | null; // próxima parada (bolinha com foto)
  stopNames?: Record<string, string>; // inicial quando não há foto
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const readyRef = useRef(false);
  const stopMarkersRef = useRef<Map<string, { el: HTMLDivElement; marker: mapboxgl.Marker }>>(new Map());
  const navLineRef = useRef<[number, number][] | null>(null);
  // "Seguindo" a van (câmera automática) vs. o motorista mexeu na câmera à mão.
  const followRef = useRef(true);
  const lastPosRef = useRef<DriverPos | null>(null);
  // Enquadramento da rota (centro/zoom), pra recentrar quando ainda não há GPS.
  const routeViewRef = useRef<{ center: [number, number]; zoom: number } | null>(null);
  const [showRecenter, setShowRecenter] = useState(false);
  const [markersReady, setMarkersReady] = useState(false);

  // Empurra o trecho de navegação para a fonte do mapa (se o mapa já carregou; senão o load aplica).
  function applyNavLine() {
    const map = mapRef.current;
    const src = map?.getSource("nav") as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    const coords = navLineRef.current ?? [];
    src.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
  }

  // Voltar pro modo condução e retomar o "seguir". Com GPS: centra no motorista
  // (pitch/bearing certos). Sem GPS ainda (preview / sinal não chegou): recentra
  // na rota — o botão nunca fica mudo.
  function recenter() {
    followRef.current = true;
    setShowRecenter(false);
    const map = mapRef.current;
    if (!map) return;
    const pos = lastPosRef.current;
    if (pos) {
      driveCamera(map, pos, 600);
    } else if (routeViewRef.current) {
      map.easeTo({
        center: routeViewRef.current.center,
        zoom: routeViewRef.current.zoom,
        pitch: PITCH,
        bearing: 0,
        duration: 600,
      });
    }
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

    // Centroide da rota (paradas + escola) p/ o recenter sem GPS reenquadrar.
    routeViewRef.current =
      all.length > 0
        ? {
            center: [
              all.reduce((s, c) => s + c[0], 0) / all.length,
              all.reduce((s, c) => s + c[1], 0) / all.length,
            ],
            zoom: all.length > 1 ? 13 : 15,
          }
        : { center, zoom: 15 };

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

      // Pinos das paradas: criados aqui, estilizados (número × foto da próxima, esmaecida se feita) no efeito abaixo.
      for (const s of stops) {
        if (s.lat == null || s.lng == null) continue;
        // Casca externa intocada (o Mapbox posiciona por transform nela); o visual vai no div interno.
        const outer = document.createElement("div");
        const el = document.createElement("div");
        outer.appendChild(el);
        const marker = new mapboxgl.Marker({ element: outer }).setLngLat([s.lng, s.lat]).addTo(map);
        stopMarkersRef.current.set(s.studentId, { el, marker });
      }
      setMarkersReady(true);

      // Trecho da navegação no app (amarelo com contorno azul-marinho), por cima da linha geral.
      map.addSource("nav", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
      });
      map.addLayer({
        id: "nav-casing",
        type: "line",
        source: "nav",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": NAVY, "line-width": 11 },
      });
      map.addLayer({
        id: "nav",
        type: "line",
        source: "nav",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": YELLOW, "line-width": 7 },
      });
      applyNavLine();

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
      stopMarkersRef.current.clear();
      setMarkersReady(false);
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
      driverMarkerRef.current = new mapboxgl.Marker({ element: makeDriverEl() })
        .setLngLat([driverPos.lng, driverPos.lat])
        .addTo(map);
    } else {
      driverMarkerRef.current.setLngLat([driverPos.lng, driverPos.lat]);
    }
    if (followRef.current) driveCamera(map, driverPos, 800);
  }, [driverPos]);

  // Estilo dos pinos: a próxima parada vira a bolinha com foto + número; feitas esmaecem.
  useEffect(() => {
    if (!markersReady) return;
    for (const st of stops) {
      const m = stopMarkersRef.current.get(st.studentId);
      if (m) styleStopMarker(m.el, st, st.studentId === nextStopId, stopNames[st.studentId] ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markersReady, stops, nextStopId]);

  // Trecho da navegação no app.
  useEffect(() => {
    navLineRef.current = navLine;
    applyNavLine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navLine, markersReady]);

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
