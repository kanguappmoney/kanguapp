// Service worker mínimo — habilita instalação do PWA ("Adicionar à tela inicial").
// Estratégia de cache/offline de verdade fica para depois do piloto (não é v1 crítico).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // Sem interceptação por ora: deixa a rede resolver. Placeholder para cache futuro.
});
