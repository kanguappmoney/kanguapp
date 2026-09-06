"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoPoint } from "@/lib/geo";

// Posição atual da van, só para o gate de embarque a 100m (G1/G2). Roda na MESMA
// janela do G4 — só com a rota `active` (in_progress) e a aba em foreground — e
// NUNCA persiste a coordenada: o valor vive só na memória do cliente pra medir a
// distância até a parada. O que chega ao banco é o escalar de distância no
// metadata do embarque, nunca a coordenada crua (minimização, espelha o G4).
export function useDriverPosition(active: boolean): GeoPoint | null {
  const [pos, setPos] = useState<GeoPoint | null>(null);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      setPos(null);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const start = () => {
      if (watchId.current !== null) return;
      if (document.visibilityState !== "visible") return; // G4 — só foreground
      watchId.current = navigator.geolocation.watchPosition(
        (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => setPos(null), // sem sinal: null => 'embarcar mesmo assim' cobre (G1)
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
      );
    };

    const stop = () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop(); // G4 — nada roda em background
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [active]);

  return pos;
}
