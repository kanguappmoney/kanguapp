// Roda com: node --test tests/access-log.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp, shouldAttempt, resetAccessCache } from "../src/lib/access-log.ts";

const hdr = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

test("clientIp: prefere o cabeçalho da borda da Vercel e pega o primeiro da lista", () => {
  assert.equal(clientIp(hdr({ "x-vercel-forwarded-for": "203.0.113.5", "x-forwarded-for": "10.0.0.1" })), "203.0.113.5");
  assert.equal(clientIp(hdr({ "x-forwarded-for": "203.0.113.5, 70.41.3.18" })), "203.0.113.5");
  assert.equal(clientIp(hdr({ "x-real-ip": "2001:db8::1" })), "2001:db8::1");
});

test("clientIp: sem cabeçalho ou lixo vira null (nada é gravado)", () => {
  assert.equal(clientIp(hdr({})), null);
  assert.equal(clientIp(hdr({ "x-forwarded-for": "unknown" })), null);
  assert.equal(clientIp(hdr({ "x-forwarded-for": "<script>" })), null);
});

test("clientIp: loopback (desenvolvimento local) nunca é gravado", () => {
  assert.equal(clientIp(hdr({ "x-forwarded-for": "::1" })), null);
  assert.equal(clientIp(hdr({ "x-forwarded-for": "127.0.0.1" })), null);
  assert.equal(clientIp(hdr({ "x-forwarded-for": "0.0.0.0" })), null);
});

test("shouldAttempt: uma vez por chave a cada 30 min", () => {
  resetAccessCache();
  const t = 1_000_000;
  assert.equal(shouldAttempt("1.1.1.1|-", t), true);
  assert.equal(shouldAttempt("1.1.1.1|-", t + 60_000), false);
  assert.equal(shouldAttempt("1.1.1.1|user", t + 60_000), true); // outro usuário, mesma chave diferente
  assert.equal(shouldAttempt("1.1.1.1|-", t + 31 * 60_000), true); // passou a janela
});
