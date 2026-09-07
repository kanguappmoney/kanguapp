import { haversineMeters, type GeoPoint } from "@/lib/geo";

// Sugestão de ordem das paradas (Rotas 2.0, Fatia B). MOSTRA, nunca IMPÕE: só
// reordena a lista editável do builder — o motorista ajusta e nada persiste até
// Salvar. Duas engines: Mapbox Optimization (trânsito real) e, como rede de
// segurança, vizinho-mais-próximo local (haversine, zero rede).

// Limite de coordenadas da Optimization API v1 (inclui a âncora, se houver).
export const MAX_OPT_WAYPOINTS = 12;

export interface Stop {
  id: string;
  point: GeoPoint; // { lat, lng }
}

// Âncora no começo (volta: sai da escola) ou no fim (ida: termina na escola).
export type AnchorRole = "start" | "end";

// Vizinho-mais-próximo, determinístico. Com âncora, começa a partir dela; sem
// âncora, começa pela primeira parada (mantém um ponto de partida estável).
export function nearestNeighborOrder(
  stops: Stop[],
  anchor: GeoPoint | null,
): string[] {
  const remaining = [...stops];
  const order: string[] = [];
  let cursor: GeoPoint | undefined = anchor ?? undefined;

  if (!cursor && remaining.length) {
    const first = remaining.shift()!;
    order.push(first.id);
    cursor = first.point;
  }

  while (remaining.length && cursor) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineMeters(cursor, remaining[i].point);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    order.push(remaining[best].id);
    cursor = remaining[best].point;
    remaining.splice(best, 1);
  }
  return order;
}

// Ordem ótima via Mapbox Optimization v1. Retorna os ids na ordem sugerida, ou
// null se a API falhar/recusar (o chamador cai no fallback). A âncora entra como
// um waypoint fixo (source=first na volta, destination=last na ida) e é removida
// do resultado — ela não é uma parada, é a escola.
export async function optimizeViaMapbox(
  stops: Stop[],
  anchor: GeoPoint | null,
  anchorRole: AnchorRole,
  token: string,
): Promise<string[] | null> {
  if (!token || stops.length < 2) return null;
  try {
    const inputs: (string | null)[] = stops.map((s) => s.id);
    const coords = stops.map((s) => `${s.point.lng},${s.point.lat}`);

    // A Optimization v1 só aceita roundtrip=false com source=first E
    // destination=last (ambos fixos). Posiciona a escola no extremo certo pra ela
    // ser esse ponto fixo: no FIM na ida (a van termina na escola), no COMEÇO na
    // volta (a van sai da escola). Sem âncora (escolas diferentes), os alunos das
    // pontas ficam fixos e o miolo é otimizado — TSP aberto, aceitável.
    if (anchor) {
      const a = `${anchor.lng},${anchor.lat}`;
      if (anchorRole === "end") {
        coords.push(a);
        inputs.push(null);
      } else {
        coords.unshift(a);
        inputs.unshift(null);
      }
    }

    const url =
      `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coords.join(";")}` +
      `?access_token=${token}&source=first&destination=last&roundtrip=false`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      code?: string;
      waypoints?: { waypoint_index: number }[];
    };
    if (json.code !== "Ok" || !json.waypoints) return null;

    // waypoint_index = posição do i-ésimo coord de entrada na rota otimizada.
    const seq = json.waypoints
      .map((w, i) => ({ id: inputs[i], pos: w.waypoint_index }))
      .filter((x) => x.id !== null)
      .sort((a, b) => a.pos - b.pos)
      .map((x) => x.id as string);

    return seq.length === stops.length ? seq : null;
  } catch {
    return null;
  }
}
