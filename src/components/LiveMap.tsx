"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// Mapa ao vivo do Modo Mapa (G6). Mostra SÓ o pino do motorista se movendo —
// nunca marcadores de parada (isso vazaria endereço de criança = G5). A posição
// vem de `live_positions` via a página do responsável, que só a recebe sob a RLS
// (G4 in_progress + G6 'map'). O polling (router.refresh) troca a prop `lat/lng`
// e o marcador desliza; o mapa em si é criado uma vez e preservado entre refreshes.
export function LiveMap({
  token,
  lat,
  lng,
  heading,
}: {
  token: string;
  lat: number;
  lng: number;
  heading: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  // Cria o mapa uma única vez.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [lng, lat],
      zoom: 15,
      attributionControl: false,
    });
    mapRef.current = map;

    const el = document.createElement("div");
    el.style.width = "40px";
    el.style.height = "40px";
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.borderRadius = "9999px";
    el.style.background = "#FFD000"; // amarelo Kangu
    el.style.boxShadow = "0 2px 8px rgba(13,27,61,0.35)";
    el.innerHTML = `<span class="kangu-arrow" style="display:flex;transition:transform .5s ease">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="#0D1B3D" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
      </svg></span>`;

    markerRef.current = new mapboxgl.Marker({ element: el })
      .setLngLat([lng, lat])
      .addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // A cada nova posição (polling), desliza o pino e recentra o mapa.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    marker.setLngLat([lng, lat]);
    if (heading !== null && Number.isFinite(heading)) {
      const arrow = marker
        .getElement()
        .querySelector<HTMLElement>(".kangu-arrow");
      if (arrow) arrow.style.transform = `rotate(${heading}deg)`;
    }
    map.easeTo({ center: [lng, lat], duration: 900 });
  }, [lat, lng, heading]);

  return (
    <div
      ref={containerRef}
      className="h-64 w-full overflow-hidden rounded-2xl border border-navy-900/10"
    />
  );
}
