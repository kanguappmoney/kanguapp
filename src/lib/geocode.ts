import { regionParams } from "@/lib/geo-region";

// Geocoding server-side compartilhado (sugestão de saída, mapa idle da home).
// Mesma API/params do AddressAutocomplete, com viés de região (SP/ABC/Mauá) pra
// não casar rua homônima no BR inteiro. Timeout curto; qualquer furo → null.
export async function geocodeAddress(
  address: string,
  token: string,
  timeoutMs = 1500,
): Promise<{ lat: number; lng: number } | null> {
  if (!token || !address.trim()) return null;
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json` +
    `?access_token=${token}&country=br&language=pt&limit=1&types=address,place,locality,neighborhood` +
    regionParams();
  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(id);
    if (!res.ok) return null;
    const json = (await res.json()) as { features?: { center: [number, number] }[] };
    const c = json.features?.[0]?.center; // [lng, lat]
    return c ? { lat: c[1], lng: c[0] } : null;
  } catch {
    return null;
  }
}
