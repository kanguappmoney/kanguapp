// Erros de "versão trocada no meio do uso" (skew de deploy): o navegador tem o JavaScript de uma versão do app e o
// servidor já responde com a seguinte. Os sintomas típicos no cliente:
//   • "Cannot read properties of undefined (reading 'call')" — o runtime do webpack não conhece o módulo novo;
//   • ChunkLoadError / "Loading chunk N failed" — o arquivo da versão antiga já não existe;
//   • "Failed to find Server Action" — a ação mudou de id entre versões.
// Recarregar a página resolve (baixa a versão atual). O error boundary faz isso sozinho, uma vez.
const PATTERNS = [
  /reading ['"]call['"]/i,
  /ChunkLoadError/i,
  /Loading chunk [^\s]+ failed/i,
  /Loading CSS chunk/i,
  /Failed to find Server Action/i,
  /__webpack_modules__/i,
];

export function isStaleBuildError(message: string | undefined | null): boolean {
  if (!message) return false;
  return PATTERNS.some((re) => re.test(message));
}

// Janela anti-laço: se já recarregamos há menos de 30 s e o erro voltou, não recarrega de novo.
export const RELOAD_GUARD_MS = 30_000;
export function shouldAutoReload(lastReloadAt: number | null, now: number): boolean {
  return lastReloadAt === null || now - lastReloadAt > RELOAD_GUARD_MS;
}
