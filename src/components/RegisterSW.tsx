"use client";

import { useEffect } from "react";

// Registra o service worker (instalação do PWA). Só em produção/https.
export function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // silencioso — não é crítico para o funcionamento
      });
    }
  }, []);
  return null;
}
