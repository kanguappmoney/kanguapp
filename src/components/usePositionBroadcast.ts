"use client";

import { useEffect, useRef } from "react";
import { updatePosition } from "@/lib/actions/drive";
import { shouldBroadcast, type GeoPoint } from "@/lib/geo";

// Emite a posição da van para `live_positions` enquanto a rota está `in_progress`
// (G4) e a aba está em foreground (G4). O gate de decisão (foreground + throttle
// de tempo/distância) vive em `shouldBroadcast` (geo.ts, testado). Quando a aba
// perde foco ou a rota encerra, o watch do GPS é liberado — nada roda em background.
export function usePositionBroadcast(executionId: string, active: boolean) {
  const lastSentAt = useRef<number | null>(null);
  const lastSentPos = useRef<GeoPoint | null>(null);

  useEffect(() => {
    if (!active) return; // G4 — só durante rota ativa
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    let watchId: number | null = null;

    const startWatch = () => {
      if (watchId !== null) return;
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const current: GeoPoint = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          const decision = shouldBroadcast({
            active,
            visible: document.visibilityState === "visible",
            now: Date.now(),
            lastSentAt: lastSentAt.current,
            lastSentPos: lastSentPos.current,
            current,
          });
          if (!decision) return;

          lastSentAt.current = Date.now();
          lastSentPos.current = current;
          void updatePosition(executionId, {
            ...current,
            heading: Number.isFinite(position.coords.heading)
              ? position.coords.heading
              : null,
            speed: Number.isFinite(position.coords.speed)
              ? position.coords.speed
              : null,
            accuracy: position.coords.accuracy ?? null,
          });
        },
        () => {
          // Permissão negada / sinal perdido: silencioso. Sem posição, o pai
          // simplesmente não vê a van se mover — a RLS nunca entrega dado velho
          // como se fosse ao vivo (updated_at fica parado).
        },
        { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
      );
    };

    const stopWatch = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    };

    // G4 (foreground): só observa o GPS com a aba visível. Em background, para de vez.
    const onVisibility = () => {
      if (document.visibilityState === "visible") startWatch();
      else stopWatch();
    };

    document.addEventListener("visibilitychange", onVisibility);
    if (document.visibilityState === "visible") startWatch();

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stopWatch();
    };
  }, [executionId, active]);
}
