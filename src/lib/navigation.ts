// Navegação dentro do app (Modo Direção): rota da van até a PRÓXIMA parada, com instruções curva a curva.
// Só roda no cliente, durante a perna em andamento e em foreground (a mesma janela do G4 que já alimenta
// useDriverPosition): a posição do motorista continua só na memória e vai apenas para a Directions do Mapbox
// (destino = parada do próprio motorista; G5 intacto). Nada disso é gravado.

export interface LngLat {
  lat: number;
  lng: number;
}

export type Maneuver = "left" | "right" | "straight" | "uturn" | "arrive";

export interface NavStep {
  instruction: string; // "Vire à esquerda na Rua X" (pt-BR, vem do Mapbox)
  maneuver: Maneuver;
  at: LngLat; // onde a manobra acontece
  distance: number; // metros do passo (até a PRÓXIMA manobra)
}

export interface NavRoute {
  line: [number, number][]; // lng,lat — segue as ruas
  steps: NavStep[];
  distance: number; // metros restantes (no momento da busca)
  duration: number; // segundos
}

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function distM(a: LngLat, b: LngLat): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Distância do ponto à polilinha (segmento a segmento, aproximação plana — ok em escala de rua).
export function distToLine(p: LngLat, line: [number, number][]): number {
  if (line.length === 0) return Infinity;
  const kx = Math.cos(rad(p.lat)) * R * (Math.PI / 180);
  const ky = R * (Math.PI / 180);
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const ax = (line[i][0] - p.lng) * kx;
    const ay = (line[i][1] - p.lat) * ky;
    const bx = (line[i + 1][0] - p.lng) * kx;
    const by = (line[i + 1][1] - p.lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  if (line.length === 1) {
    best = Math.hypot((line[0][0] - p.lng) * kx, (line[0][1] - p.lat) * ky);
  }
  return best;
}

// Passo atual: a manobra "à frente" é steps[idx]; avança enquanto o motorista já passou dela
// (a menos de PASSED_M do ponto da manobra) e ainda há passos depois. O último passo é a chegada.
export const PASSED_M = 25;
export function upcomingStepIndex(pos: LngLat, steps: NavStep[], from = 0): number {
  let i = Math.min(Math.max(from, 0), Math.max(steps.length - 1, 0));
  while (i < steps.length - 1 && distM(pos, steps[i].at) < PASSED_M) i++;
  return i;
}

function toManeuver(type: string, modifier?: string): Maneuver {
  if (type === "arrive") return "arrive";
  if (modifier === "uturn") return "uturn";
  if (modifier?.includes("left")) return "left";
  if (modifier?.includes("right")) return "right";
  return "straight";
}

interface MbStep {
  distance: number;
  maneuver: { instruction?: string; type: string; modifier?: string; location: [number, number] };
}

// Rota da posição atual até a parada (Directions do Mapbox, instruções em português).
export async function fetchNavRoute(
  token: string,
  from: LngLat,
  to: LngLat,
  signal?: AbortSignal,
): Promise<NavRoute | null> {
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?overview=full&geometries=geojson&steps=true&language=pt&access_token=${token}`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      code?: string;
      routes?: {
        distance: number;
        duration: number;
        geometry?: { coordinates?: [number, number][] };
        legs?: { steps?: MbStep[] }[];
      }[];
    };
    const r = json.routes?.[0];
    if (json.code !== "Ok" || !r?.geometry?.coordinates) return null;
    const mb = r.legs?.[0]?.steps ?? [];
    // O passo i descreve a manobra que ACONTECE no início do passo i+1 (instrução de i+1), então a "manobra à
    // frente" de cada passo é a do passo seguinte. Montamos a lista por manobra, com a distância até ela.
    const steps: NavStep[] = mb.slice(1).map((s, i) => ({
      instruction: s.maneuver.instruction ?? "Siga em frente",
      maneuver: toManeuver(s.maneuver.type, s.maneuver.modifier),
      at: { lng: s.maneuver.location[0], lat: s.maneuver.location[1] },
      distance: mb[i].distance,
    }));
    if (steps.length === 0) {
      steps.push({ instruction: "Você chegou ao destino", maneuver: "arrive", at: to, distance: r.distance });
    }
    return { line: r.geometry.coordinates, steps, distance: r.distance, duration: r.duration };
  } catch {
    return null;
  }
}
