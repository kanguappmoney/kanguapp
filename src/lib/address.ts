// Limpa o endereço da parada para exibição: só "rua, número · bairro".
// A geocodificação devolve algo como
//   "Rua Jorge Beretta 69, Rp10 (Regiões De Planejamento), Mauá - São Paulo, 09320-050, Brasil, 69"
// — com CEP, país, cidade/UF, o número repetido no fim e códigos de planejamento no lugar do bairro.
// Só exibição: o endereço original segue intacto no banco e na navegação (Waze/Google).

const COUNTRY = /^(brasil|brazil)$/i;
const CEP = /^\d{5}-?\d{3}$/;
const CITY_UF = /\s[-–]\s*[A-Za-zÀ-ÿ .'-]+$/; // "Mauá - São Paulo" / "Mauá - SP"
const ONLY_NUMBER = /^\d+[A-Za-z]?$/;
// Códigos/regiões de planejamento não são bairro: "Rp10", "Rp10 (Regiões De Planejamento)", "Região ...".
const PLANNING = /^(rp\s?\d+|regi[ãa]o\b|regi[õo]es\b|\(?regi[õo]es de planejamento\)?)/i;
const PLANNING_ANY = /regi[õo]es de planejamento|\brp\d+\b/i;

function isNoise(part: string): boolean {
  return COUNTRY.test(part) || CEP.test(part);
}

export function formatStopAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  let street = parts[0];
  const rest = parts.slice(1);

  // Número isolado em qualquer lugar do resto (ex.: "Rua X, 123, Bairro" ou o "69" duplicado no fim).
  let number: string | null = null;
  const neighborhoods: string[] = [];
  for (const p of rest) {
    if (isNoise(p)) continue;
    // Formato Google: "373 - Vila Bocaina" (número - bairro).
    const nb = p.match(/^(\d+[A-Za-z]?)\s[-–]\s(.+)$/);
    if (nb) {
      number ??= nb[1];
      if (!PLANNING.test(nb[2]) && !PLANNING_ANY.test(nb[2])) neighborhoods.push(nb[2]);
      continue;
    }
    if (ONLY_NUMBER.test(p)) {
      number ??= p;
      continue;
    }
    if (PLANNING.test(p) || PLANNING_ANY.test(p)) continue;
    if (CITY_UF.test(p)) continue; // "Mauá - São Paulo": cidade/UF, não bairro
    neighborhoods.push(p);
  }

  // Número já dentro da rua ("Rua Jorge Beretta 69")? Usa-o separado por vírgula; senão acrescenta o do resto.
  const m = street.match(/^(.*\D)\s+(\d+[A-Za-z]?)$/);
  if (m) {
    street = m[1].trim();
    number = m[2];
  }

  const line = number ? `${street}, ${number}` : street;
  // Só o primeiro bairro "de verdade"; evita listar sub-regiões.
  const bairro = neighborhoods[0];
  return bairro ? `${line} · ${bairro}` : line;
}
