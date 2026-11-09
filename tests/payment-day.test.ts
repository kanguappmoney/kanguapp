// Roda com: node --test tests/payment-day.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { dueDateFor, paymentDayLabel } from "../src/lib/payment-day.ts";

test("sem dia: padrão 10", () => {
  assert.equal(dueDateFor("2026-11", null), "2026-11-10");
  assert.equal(dueDateFor("2026-11", undefined), "2026-11-10");
});

test("dia escolhido", () => {
  assert.equal(dueDateFor("2026-11", 5), "2026-11-05");
  assert.equal(dueDateFor("2026-11", 28), "2026-11-28");
});

test("mês curto usa o último dia", () => {
  assert.equal(dueDateFor("2026-02", 31), "2026-02-28");
  assert.equal(dueDateFor("2028-02", 31), "2028-02-29"); // bissexto
  assert.equal(dueDateFor("2026-04", 31), "2026-04-30");
  assert.equal(dueDateFor("2026-01", 31), "2026-01-31");
});

test("rótulo", () => {
  assert.equal(paymentDayLabel(15), "Dia 15 de cada mês");
  assert.equal(paymentDayLabel(null), "Não definida");
});
