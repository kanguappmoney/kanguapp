// Espelho em teste de route_runs_on (banco, migration 029). Roda com:
//   node --test tests/recurrence.test.ts
// Node 24 executa TS por type-stripping. Importa com extensão .ts explícita
// (tests/ é excluído do build do Next no tsconfig).
//
// Os vetores são OS MESMOS dos checks 1–4 de docs/tests/recorrencia.sql — mesma
// entrada, mesma saída esperada. Se o JS (routeRunsToday) e o SQL (route_runs_on)
// divergirem no futuro, um destes casos quebra e vira o alarme. (Checks 5/RLS e
// 6/guarda são do banco — não cabem num helper puro.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { routeRunsToday } from "../src/lib/recurrence.ts";

const SEG_A_SEX = [1, 2, 3, 4, 5];
const SEG = 1; // isodow da segunda
const SAB = 6; // isodow do sábado

// CHECK 1 — regra do dia da semana: rota Seg–Sex roda na segunda, não no sábado.
test("check 1: regra do dia da semana (segunda sim, sábado não)", () => {
  assert.equal(routeRunsToday(SEG_A_SEX, null, SEG), true);
  assert.equal(routeRunsToday(SEG_A_SEX, null, SAB), false);
});

// CHECK 2 — 'skip' (feriado) força NÃO rodar num dia que rodaria (segunda).
test("check 2: skip força não rodar num dia que rodaria", () => {
  assert.equal(routeRunsToday(SEG_A_SEX, "skip", SEG), false);
});

// CHECK 3 — 'extra' (reposição) força RODAR num dia que não rodaria (sábado).
test("check 3: extra força rodar num dia que não rodaria", () => {
  assert.equal(routeRunsToday(SEG_A_SEX, "extra", SAB), true);
});

// CHECK 4 — backfill: rota sem weekdays nasce Seg–Sex (mesmo array) e se comporta
// como a regra do dia. Aqui o array default é a própria entrada.
test("check 4: backfill Seg–Sex se comporta como a regra do dia", () => {
  assert.equal(routeRunsToday(SEG_A_SEX, null, SEG), true);
  assert.equal(routeRunsToday(SEG_A_SEX, null, SAB), false);
});
