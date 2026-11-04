// Importa as cidades de SP (IBGE) para `public.cities`. Script ÚNICO e idempotente (upsert por
// código IBGE): rodar de novo atualiza nomes, não duplica. Fora do caminho de request.
//
// Fonte: https://servicodados.ibge.gov.br/api/v1/localidades/estados/SP/municipios
//
// SEGREDOS: lidos SÓ do ambiente (--env-file=.env.local); nada hardcoded. Usa a
// SUPABASE_SECRET_KEY (server) porque `cities` não tem policy de escrita.
//
// Rodar:
//   node --env-file=.env.local scripts/import-cities.ts --dry   # só conta e mostra
//   node --env-file=.env.local scripts/import-cities.ts         # grava
import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry");
const URL_IBGE = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/SP/municipios";

interface Municipio {
  id: number;
  nome: string;
  microrregiao?: { mesorregiao?: { UF?: { sigla?: string } } };
}

const res = await fetch(URL_IBGE);
if (!res.ok) {
  console.error(`IBGE respondeu ${res.status}`);
  process.exit(1);
}
const data = (await res.json()) as Municipio[];

// Sanidade: SP tem 645 municípios; ids e nomes únicos; todos de SP.
const rows = data.map((m) => ({ id: m.id, name: m.nome.trim(), state: "SP" }));
const ids = new Set(rows.map((r) => r.id));
const names = new Set(rows.map((r) => r.name.toLowerCase()));
const notSP = data.filter((m) => m.microrregiao?.mesorregiao?.UF?.sigla !== "SP");
if (rows.length !== 645 || ids.size !== rows.length || names.size !== rows.length || notSP.length) {
  console.error(
    `Resposta inesperada: ${rows.length} linhas, ${ids.size} ids únicos, ${names.size} nomes únicos, ${notSP.length} fora de SP (esperado 645/645/645/0).`,
  );
  process.exit(1);
}
console.log(`IBGE: ${rows.length} municípios de SP (ex.: ${rows.slice(0, 3).map((r) => r.name).join(", ")}).`);
if (DRY) {
  console.log("--dry: nada gravado.");
  process.exit(0);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SECRET_KEY) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY. Rode com --env-file=.env.local.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });

for (let i = 0; i < rows.length; i += 200) {
  const { error } = await supabase.from("cities").upsert(rows.slice(i, i + 200), { onConflict: "id" });
  if (error) {
    console.error(`Falha no lote ${i}: ${error.message}`);
    process.exit(1);
  }
}
const { count } = await supabase.from("cities").select("id", { count: "exact", head: true });
console.log(`Gravado. cities agora tem ${count} linhas.`);
