import type { ActiveBoard, BoardStop } from "@/lib/drive-board";

// URL do mini-mapa da home (Mapbox Static Images API — um <img>, sem mapbox-gl).
// Desenha o TRAÇADO da rota (paradas pendentes + escola) por cima dos pinos,
// usando a geometria polyline da Directions API. Camadas de degradação, nunca
// trava a home: traçado+pinos → só pinos → sem mapa. Roda no SERVER (a página é
// SSR): a lista de coordenadas das paradas não vai pro cliente.

const DIRECTIONS_TIMEOUT_MS = 1200; // curto: a home não espera a rota desenhar
const MAX_COORDS = 25; // teto da Directions; acima, cai pra só pinos
const NAVY = "0D1B3D";
const YELLOW = "FFD000";

interface LngLat {
  lng: number;
  lat: number;
}

function hasCoord(s: BoardStop): s is BoardStop & { lat: number; lng: number } {
  return s.lat != null && s.lng != null;
}

// Sequência de pontos do traçado: na ida termina na escola, na volta começa nela.
function sequence(board: ActiveBoard): LngLat[] {
  const pending = board.stops
    .filter((s) => s.state === "pending" && hasCoord(s))
    .map((s) => ({ lng: s.lng as number, lat: s.lat as number }));
  const anchor = board.schoolAnchor;
  if (!anchor) return pending;
  return board.kind === "pickup"
    ? [...pending, anchor]
    : [anchor, ...pending];
}

async function directionsPolyline(
  coords: LngLat[],
  token: string,
): Promise<string | null> {
  const path = coords.map((c) => `${c.lng},${c.lat}`).join(";");
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${path}` +
    `?overview=simplified&geometries=polyline&access_token=${token}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), DIRECTIONS_TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      code?: string;
      routes?: { geometry?: string }[];
    };
    if (json.code !== "Ok") return null;
    return json.routes?.[0]?.geometry ?? null;
  } catch {
    return null; // timeout/rede: sem linha, só pinos
  }
}

// Overlays de pino: próxima parada em amarelo (grande), demais pendentes + escola
// em navy (pequeno). Cap de pinos p/ não estourar a URL; acima, só a próxima.
function pinOverlays(board: ActiveBoard): string {
  const pins: string[] = [];
  const next = board.nextStop;
  if (next && hasCoord(next))
    pins.push(`pin-l+${YELLOW}(${next.lng},${next.lat})`);

  const others = board.stops.filter(
    (s) => s.state === "pending" && hasCoord(s) && s.studentId !== next?.studentId,
  );
  if (others.length <= 10) {
    for (const s of others)
      pins.push(`pin-s+${NAVY}(${s.lng},${s.lat})`);
    if (board.schoolAnchor)
      pins.push(`pin-s+${NAVY}(${board.schoolAnchor.lng},${board.schoolAnchor.lat})`);
  }
  return pins.join(",");
}

// URL final. Com traçado se a Directions responder a tempo; senão, só os pinos.
// null = sem token, sem coordenada, ou nada a mostrar (home degrada sem mapa).
export async function buildRouteMapUrl(
  token: string,
  board: ActiveBoard,
): Promise<string | null> {
  if (!token) return null;
  const pins = pinOverlays(board);
  if (!pins) return null; // nenhuma parada pendente com coordenada

  const coords = sequence(board);
  let pathOverlay = "";
  if (coords.length >= 2 && coords.length <= MAX_COORDS) {
    const poly = await directionsPolyline(coords, token);
    if (poly)
      pathOverlay = `path-4+${NAVY}-0.9(${encodeURIComponent(poly)}),`;
  }

  return (
    `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/` +
    `${pathOverlay}${pins}/auto/640x360@2x?access_token=${token}`
  );
}
