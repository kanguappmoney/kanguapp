// Lógica pura do Modo Mapa (G4 + throttle de custo). Sem dependência de browser
// nem de React — de propósito, pra ser testável e provar a guarda sem simular GPS.

export interface GeoPoint {
  lat: number;
  lng: number;
}

// Distância em metros entre dois pontos (Haversine). Usada pelo gate de "moveu > X".
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6_371_000; // raio da Terra em metros
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Throttle do doc: no máx. 1x a cada ~10s E só se moveu > ~20m. Corta custo e escrita.
export const MIN_INTERVAL_MS = 10_000;
export const MIN_DISTANCE_M = 20;

export interface BroadcastDecision {
  active: boolean; // execução in_progress (G4 — nunca fora de rota ativa)
  visible: boolean; // aba em foreground (G4 — nunca em background)
  now: number;
  lastSentAt: number | null;
  lastSentPos: GeoPoint | null;
  current: GeoPoint;
}

// Decide se a posição atual deve ser emitida. As duas primeiras checagens são a
// G4 no cliente (espelham a RLS `guardian_can_see_live_position` no banco, que é
// o gate final). O resto é o throttle de custo.
export function shouldBroadcast(d: BroadcastDecision): boolean {
  if (!d.active) return false; // G4 — só durante rota ativa
  if (!d.visible) return false; // G4 — só em foreground
  // Primeiro fix da rota: emite já, pra o pai ver a van imediatamente.
  if (d.lastSentAt === null || d.lastSentPos === null) return true;
  const timeOk = d.now - d.lastSentAt >= MIN_INTERVAL_MS;
  const movedOk = haversineMeters(d.lastSentPos, d.current) >= MIN_DISTANCE_M;
  return timeOk && movedOk;
}
