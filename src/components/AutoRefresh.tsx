"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Atualização "viva" leve para a Linha do tempo: re-busca do servidor a cada
// intervalo. Sem GPS, sem websocket — só relê os route_events já confirmados.
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
