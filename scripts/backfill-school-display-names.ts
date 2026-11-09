// Preenche `schools.display_name` (nome legível) a partir de `schools.name` (oficial, INEP) com a
// regra de src/lib/school-name.ts. Único e idempotente; NÃO altera `name`. Fora do caminho de request.
//   node --env-file=.env.local scripts/backfill-school-display-names.ts --dry   # só mostra amostra/contagem
//   node --env-file=.env.local scripts/backfill-school-display-names.ts         # grava
import { createClient } from "@supabase/supabase-js";
import { friendlyName } from "../src/lib/school-name.ts";

const DRY = process.argv.includes("--dry");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY. Rode com --env-file=.env.local.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

interface Row {
  inep_code: number;
  city_id: number;
  name: string;
  dependency: number | null;
  census_year: number;
  display_name: string | null;
}
const rows: Row[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase
    .from("schools")
    .select("inep_code, city_id, name, dependency, census_year, display_name")
    .order("inep_code")
    .range(from, from + 999);
  if (error) {
    console.error(`Falha lendo schools: ${error.message}`);
    process.exit(1);
  }
  rows.push(...(data as Row[]));
  if (data.length < 1000) break;
}
const out = rows.map((r) => ({ ...r, display_name: friendlyName(r.name) }));
const bad = out.filter((r) => !r.display_name || /[,;\r\n]/.test(r.display_name));
const changed = out.filter((r, i) => r.display_name !== rows[i].display_name).length;
console.log(`${rows.length} escolas · ${changed} a gravar · ${bad.length} inválidas.`);
if (bad.length) {
  console.error("Nomes de exibição inválidos (vazio ou com separador):", bad.slice(0, 5).map((r) => r.name));
  process.exit(1);
}
if (DRY) process.exit(0);

for (let i = 0; i < out.length; i += 500) {
  const { error } = await supabase.from("schools").upsert(out.slice(i, i + 500), { onConflict: "inep_code" });
  if (error) {
    console.error(`Falha no lote ${i}: ${error.message}`);
    process.exit(1);
  }
}
const { count } = await supabase.from("schools").select("inep_code", { count: "exact", head: true }).not("display_name", "is", null);
console.log(`Gravado. ${count} escolas com display_name.`);
