// Viés de região para o geocoding do Mapbox. O piloto é São Paulo / ABC / Mauá;
// sem isto a busca acerta "a rua de nome parecido" em QUALQUER lugar do Brasil
// (Rio, Manaus, Belém…), gerando coordenadas absurdas. Fonte única usada tanto
// pelo cadastro ao vivo (AddressAutocomplete) quanto pelo backfill.
//
// - proximity=lng,lat: BIAS — ordena os resultados por proximidade do centro.
// - bbox=minLng,minLat,maxLng,maxLat: FILTRO rígido — só resultados dentro da
//   caixa. Aqui, o estado de São Paulo (cobre a capital, ABC, Mauá, interior).

// Centro da metrópole (capital + ABC), em lng,lat.
export const SP_PROXIMITY = "-46.57,-23.60";

// Caixa do estado de São Paulo (minLng,minLat,maxLng,maxLat).
export const SP_BBOX = "-53.11,-25.31,-44.16,-19.78";

// Sufixo de querystring com o viés de região (começa com &).
export function regionParams(): string {
  return `&proximity=${SP_PROXIMITY}&bbox=${SP_BBOX}`;
}
