import { headers } from "next/headers";

// Rate limit simples por IP, em memória (janela deslizante). Proteção BÁSICA contra
// raspagem em massa da vitrine pública (o telefone do motorista sai no perfil).
//
// Limites conhecidos — não é uma defesa completa:
//  - o estado vive na instância da função: em serverless cada instância conta por si
//    (o teto real é limite × nº de instâncias quentes) e zera a cada cold start;
//  - a chave pública (anon) do Supabase permite chamar a função direto, fora deste
//    caminho. Por isso o banco também entrega o telefone só no modo perfil (um por vez).
// Para um teto firme: contador compartilhado (Redis/Upstash ou tabela) ou a chamada do
// banco só pelo servidor com a service key.
const hits = new Map<string, number[]>();
const MAX_KEYS = 5000;

export interface RateResult {
  ok: boolean;
  retryAfterSec: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateResult {
  const cutoff = now - windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);

  if (recent.length >= limit) {
    hits.set(key, recent);
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)),
    };
  }

  recent.push(now);
  hits.set(key, recent);

  // Evita crescer sem limite: ao passar do teto, descarta quem já saiu da janela.
  if (hits.size > MAX_KEYS) {
    for (const [k, v] of hits) {
      if (!v.some((t) => t > cutoff)) hits.delete(k);
    }
  }
  return { ok: true, retryAfterSec: 0 };
}

// IP do cliente atrás da Vercel/proxy (primeiro item do x-forwarded-for).
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

// Buckets da vitrine pública. O perfil (com telefone) é mais restrito que a busca.
export const SEARCH_LIMIT = { limit: 30, windowMs: 60_000 };
export const PROFILE_LIMIT = { limit: 15, windowMs: 60_000 };

export async function limitMarketplace(
  bucket: "search" | "profile",
): Promise<RateResult> {
  const cfg = bucket === "search" ? SEARCH_LIMIT : PROFILE_LIMIT;
  return rateLimit(`${bucket}:${await clientIp()}`, cfg.limit, cfg.windowMs);
}
