// Roda com: node --test tests/address.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatStopAddress } from "../src/lib/address.ts";

test("remove CEP, país, cidade/UF, número duplicado e código de planejamento", () => {
  assert.equal(
    formatStopAddress(
      "Rua Jorge Beretta 69, Rp10 (Regiões De Planejamento), Mauá - São Paulo, 09320-050, Brasil, 69",
    ),
    "Rua Jorge Beretta, 69",
  );
});

test("mantém bairro quando é nome real", () => {
  assert.equal(
    formatStopAddress("R. Álvares Machado, 373 - Vila Bocaina, Mauá - SP, 09310-020"),
    "R. Álvares Machado, 373 · Vila Bocaina",
  );
  assert.equal(
    formatStopAddress("Avenida Barão de Mauá 100, Vila Noêmia, Mauá - São Paulo, 09310-000, Brasil, 100"),
    "Avenida Barão de Mauá, 100 · Vila Noêmia",
  );
});

test("número no resto e rua sem número", () => {
  assert.equal(formatStopAddress("Rua das Flores, 12, Centro, Mauá - SP, Brasil"), "Rua das Flores, 12 · Centro");
  assert.equal(formatStopAddress("Rua das Flores"), "Rua das Flores");
});

test("texto simples sem vírgulas e vazio", () => {
  assert.equal(formatStopAddress("Rua jorge beretta 69 Mauá São Paulo"), "Rua jorge beretta 69 Mauá São Paulo");
  assert.equal(formatStopAddress(null), null);
  assert.equal(formatStopAddress("  "), null);
});
