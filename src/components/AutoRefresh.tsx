"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Atualização "viva" leve: re-busca do servidor a cada intervalo. Sem GPS, sem websocket — só relê
// o que o servidor já entrega. Pausa com a aba em segundo plano e, ao voltar, atualiza na hora.
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id === null) id = setInterval(() => router.refresh(), seconds * 1000);
    };
    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, seconds]);
  return null;
}
