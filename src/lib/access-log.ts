// Log legal de acesso (Marco Civil): IP + data/hora do acesso à aplicação, por SESSÃO e não por requisição.
// A decisão de gravar de fato é do banco (função `log_app_access`: só insere se não houver registro do mesmo IP e
// usuário nas últimas 6 h). Aqui ficam só os filtros baratos que evitam chamar o banco à toa.

type HeaderReader = { get(name: string): string | null };

// IP do cliente na Vercel: x-vercel-forwarded-for (confiável, vem da borda), depois x-forwarded-for, depois x-real-ip.
export function clientIp(h: HeaderReader): string | null {
  const raw = h.get("x-vercel-forwarded-for") ?? h.get("x-forwarded-for") ?? h.get("x-real-ip");
  const first = raw?.split(",")[0]?.trim();
  if (!first) return null;
  const v4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(first);
  const v6 = /^[0-9a-fA-F:]+$/.test(first) && first.includes(":");
  if (!v4 && !v6) return null;
  // Loopback/não especificado nunca é um cliente real (só aparece em desenvolvimento local).
  if (first === "::1" || first === "::" || first.startsWith("127.") || first === "0.0.0.0") return null;
  return first;
}

// Memória local do processo: lembra por 30 min quem já foi enviado ao banco, para não repetir a chamada a cada
// navegação. É só otimização (o banco continua deduplicando em 6 h); some quando a instância é reciclada.
const TTL_MS = 30 * 60 * 1000;
const MAX_KEYS = 5000;
const seen = new Map<string, number>();

export function shouldAttempt(key: string, now: number = Date.now()): boolean {
  const last = seen.get(key);
  if (last !== undefined && now - last < TTL_MS) return false;
  if (seen.size >= MAX_KEYS) seen.clear();
  seen.set(key, now);
  return true;
}

export function resetAccessCache() {
  seen.clear();
}
