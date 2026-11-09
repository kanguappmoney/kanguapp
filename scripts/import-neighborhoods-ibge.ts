// Semeia o pool `neighborhoods` com os bairros oficiais do IBGE (Censo 2022, Malha de Bairros / Agregados por
// Bairro) para SP. Script ÚNICO e idempotente (só insere o que ainda não existe), fora do caminho de request.
//
// Fonte: https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Agregados_por_Setores_Censitarios/Agregados_por_Bairro_csv/
//   → Agregados_por_bairros_basico_BR_AAAAMMDD.zip → Agregados_por_bairros_basico_BR.csv (ISO-8859-1, separado por ';').
// Bairro só existe onde a lei municipal o institui: em SP são ~2.170 em 58 dos 645 municípios (a capital e Campinas
// não têm). O código do município (CD_MUN, 7 dígitos) é o mesmo de `cities.id`. Filtra ruído: "RP 1-1" e "Regiões de
// Planejamento" (zonas administrativas, não bairros), nomes de até 2 letras e puramente numéricos. Troca `, ; \n` por
// espaço (separadores da cobertura salva em texto). `created_by` fica nulo (semente oficial, não de motorista).
//
// SEGREDOS: só do ambiente (--env-file=.env.local).
//   node --env-file=.env.local scripts/import-neighborhoods-ibge.ts --file <csv> --dry
//   node --env-file=.env.local scripts/import-neighborhoods-ibge.ts --file <csv>
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry");
const fileIdx = process.argv.indexOf("--file");
const FILE = fileIdx > -1 ? process.argv[fileIdx + 1] : undefined;
if (!FILE) {
  console.error("Uso: --file <Agregados_por_bairros_basico_BR.csv> [--dry]");
  process.exit(1);
}

const lines = readFileSync(FILE, "latin1").split(/\r?\n/).filter(Boolean);
const head = lines[0].replace(/^﻿/, "").split(";").map((h) => h.replace(/"/g, "").trim());
const col = Object.fromEntries(head.map((h, i) => [h, i]));
for (const need of ["NM_BAIRRO", "CD_UF", "CD_MUN"]) {
  if (col[need] === undefined) {
    console.error(`Coluna ausente: ${need}`);
    process.exit(1);
  }
}

const clean = (s: string) => s.replace(/[,;\r\n]+/g, " ").replace(/\s+/g, " ").trim();
const noise = (n: string) => /^RP\s*\d/i.test(n) || /regi[õo]es? de planejamento/i.test(n) || n.length < 3 || /^[\d\s.-]+$/.test(n);

interface Cand {
  city_id: number;
  name: string;
}
const cands = new Map<string, Cand>();
let spRows = 0;
let dropped = 0;
for (const line of lines.slice(1)) {
  const f = line.split(";").map((x) => x.replace(/^"|"$/g, ""));
  if (f[col.CD_UF] !== "35") continue;
  spRows++;
  const name = clean(f[col.NM_BAIRRO] ?? "");
  if (noise(name) || name.length > 60) {
    dropped++;
    continue;
  }
  const city_id = Number(f[col.CD_MUN]);
  cands.set(`${city_id}|${name.toLowerCase()}`, { city_id, name });
}
const list = [...cands.values()];
const cityCount = new Set(list.map((c) => c.city_id)).size;
console.log(`CSV: ${spRows} bairros de SP · ${dropped} descartados como ruído · ${list.length} únicos em ${cityCount} municípios.`);
if (list.length === 0) process.exit(1);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY. Rode com --env-file=.env.local.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function all<T>(table: string, cols: string, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(cols).order(order).range(from, from + 999);
    if (error) {
      console.error(`Falha lendo ${table}: ${error.message}`);
      process.exit(1);
    }
    out.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return out;
}
const cityIds = new Set((await all<{ id: number }>("cities", "id", "id")).map((c) => c.id));
const orphan = list.filter((c) => !cityIds.has(c.city_id));
if (orphan.length) {
  console.error(`${orphan.length} bairros com município fora de cities — nada gravado.`, orphan.slice(0, 3));
  process.exit(1);
}
const existing = new Set((await all<{ city_id: number; name: string }>("neighborhoods", "city_id, name", "id")).map((n) => `${n.city_id}|${n.name.toLowerCase()}`));
const toInsert = list.filter((c) => !existing.has(`${c.city_id}|${c.name.toLowerCase()}`));
console.log(`Já no pool: ${list.length - toInsert.length} · a inserir: ${toInsert.length}.`);
if (DRY) {
  console.log("--dry: nada gravado. Exemplos:", toInsert.slice(0, 5).map((c) => `${c.city_id}:${c.name}`));
  process.exit(0);
}
for (let i = 0; i < toInsert.length; i += 500) {
  const { error } = await supabase.from("neighborhoods").insert(toInsert.slice(i, i + 500));
  if (error) {
    console.error(`Falha no lote ${i}: ${error.message}`);
    process.exit(1);
  }
}
const { count } = await supabase.from("neighborhoods").select("id", { count: "exact", head: true });
console.log(`Gravado. neighborhoods agora tem ${count} linhas.`);
