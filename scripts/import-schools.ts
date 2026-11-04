// Importa as escolas de SP (Censo Escolar / INEP) para `public.schools`. Script ÚNICO e
// idempotente (upsert por código INEP), fora do caminho de request.
//
// Fonte: microdados do Censo Escolar (INEP, dados abertos). Baixe e extraia você mesmo o CSV:
//   https://download.inep.gov.br/dados_abertos/microdados_censo_escolar_2024.zip
//   → dados/microdados_ed_basica_2024.csv  (confira o MD5 com o md5_*.txt do zip)
// Filtro: SG_UF = SP e TP_SITUACAO_FUNCIONAMENTO = 1 (em atividade). A tabela `cities` precisa já
// estar carregada (scripts/import-cities.ts): a escola liga à cidade pelo código IBGE.
//
// SEGREDOS: só do ambiente (--env-file=.env.local); nada hardcoded.
//
// Rodar (o CSV pode ficar fora do repositório):
//   node --env-file=.env.local scripts/import-schools.ts --file <csv> --dry   # só conta e mostra
//   node --env-file=.env.local scripts/import-schools.ts --file <csv>         # grava
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry");
const fileIdx = process.argv.indexOf("--file");
const FILE = fileIdx > -1 ? process.argv[fileIdx + 1] : undefined;
if (!FILE) {
  console.error("Uso: --file <caminho do microdados_ed_basica_AAAA.csv> [--dry]");
  process.exit(1);
}

interface Row {
  inep_code: number;
  city_id: number;
  name: string;
  dependency: number | null;
  census_year: number;
}

// O CSV do INEP é ISO-8859-1, separado por ';' e SEM aspas (os nomes não têm ';').
const rl = createInterface({ input: createReadStream(FILE, { encoding: "latin1" }), crlfDelay: Infinity });
let col: Record<string, number> | null = null;
let total = 0;
let sp = 0;
let notActive = 0;
const rows: Row[] = [];
const seen = new Set<number>();
let dup = 0;

for await (const line of rl) {
  if (!col) {
    col = Object.fromEntries(line.replace(/^﻿/, "").split(";").map((n, i) => [n.trim(), i]));
    for (const need of ["NU_ANO_CENSO", "SG_UF", "NO_ENTIDADE", "CO_ENTIDADE", "CO_MUNICIPIO", "TP_SITUACAO_FUNCIONAMENTO", "TP_DEPENDENCIA"]) {
      if (col[need] === undefined) {
        console.error(`Coluna ausente no CSV: ${need}`);
        process.exit(1);
      }
    }
    continue;
  }
  if (!line) continue;
  total++;
  const f = line.split(";");
  if (f[col.SG_UF] !== "SP") continue;
  sp++;
  if (f[col.TP_SITUACAO_FUNCIONAMENTO] !== "1") {
    notActive++;
    continue;
  }
  const inep = Number(f[col.CO_ENTIDADE]);
  if (seen.has(inep)) {
    dup++;
    continue;
  }
  seen.add(inep);
  const dep = Number(f[col.TP_DEPENDENCIA]);
  rows.push({
    inep_code: inep,
    city_id: Number(f[col.CO_MUNICIPIO]),
    name: f[col.NO_ENTIDADE].replace(/\s+/g, " ").trim(),
    dependency: dep >= 1 && dep <= 4 ? dep : null,
    census_year: Number(f[col.NU_ANO_CENSO]),
  });
}

const years = new Set(rows.map((r) => r.census_year));
console.log(`CSV: ${total} escolas no Brasil · ${sp} em SP · ${notActive} fora de atividade · ${dup} duplicadas · ${rows.length} a importar (ano ${[...years].join(",")}).`);
if (rows.length === 0 || years.size !== 1 || rows.some((r) => !r.name || !Number.isInteger(r.inep_code) || !Number.isInteger(r.city_id))) {
  console.error("Dados inconsistentes (vazio, mais de um ano ou linha inválida) — nada gravado.");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SECRET_KEY) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY. Rode com --env-file=.env.local.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });

// Cidades que existem em `cities` (645). Escola com município fora da lista é descartada e relatada.
const cityIds = new Set<number>();
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase.from("cities").select("id").range(from, from + 999);
  if (error) {
    console.error(`Falha lendo cities: ${error.message}`);
    process.exit(1);
  }
  data.forEach((c) => cityIds.add(c.id));
  if (data.length < 1000) break;
}
if (cityIds.size !== 645) {
  console.error(`cities tem ${cityIds.size} linhas (esperado 645). Rode antes scripts/import-cities.ts.`);
  process.exit(1);
}
const valid = rows.filter((r) => cityIds.has(r.city_id));
const orphan = rows.length - valid.length;
const byCity = new Map<number, number>();
valid.forEach((r) => byCity.set(r.city_id, (byCity.get(r.city_id) ?? 0) + 1));
console.log(`Ligadas a uma cidade de SP: ${valid.length} (descartadas por município desconhecido: ${orphan}) · cidades com ao menos 1 escola: ${byCity.size}/645.`);
if (orphan > 0) {
  console.error("Há escolas de SP com município fora de `cities` — investigue antes de gravar.");
  process.exit(1);
}
if (DRY) {
  const top = [...byCity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  console.log(`--dry: nada gravado. Maiores cidades (código IBGE → escolas): ${top.map(([c, n]) => `${c}→${n}`).join(", ")}.`);
  process.exit(0);
}

for (let i = 0; i < valid.length; i += 500) {
  const { error } = await supabase.from("schools").upsert(valid.slice(i, i + 500), { onConflict: "inep_code" });
  if (error) {
    console.error(`Falha no lote ${i}: ${error.message}`);
    process.exit(1);
  }
  if ((i / 500) % 10 === 0) console.log(`  ${Math.min(i + 500, valid.length)}/${valid.length}`);
}
const { count } = await supabase.from("schools").select("inep_code", { count: "exact", head: true });
console.log(`Gravado. schools agora tem ${count} linhas.`);
