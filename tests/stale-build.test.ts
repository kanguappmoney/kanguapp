// Roda com: node --test tests/stale-build.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isStaleBuildError, shouldAutoReload, RELOAD_GUARD_MS } from "../src/lib/stale-build.ts";

test("reconhece os erros de versão trocada", () => {
  assert.ok(isStaleBuildError("Cannot read properties of undefined (reading 'call')"));
  assert.ok(isStaleBuildError("ChunkLoadError: Loading chunk 1255 failed."));
  assert.ok(isStaleBuildError("Loading chunk app/page failed"));
  assert.ok(isStaleBuildError("Failed to find Server Action \"abc\". This request might be from an older or newer deployment."));
});

test("não confunde erro comum com versão trocada", () => {
  assert.equal(isStaleBuildError("Esta rota está em andamento hoje."), false);
  assert.equal(isStaleBuildError("Cannot read properties of null (reading 'name')"), false);
  assert.equal(isStaleBuildError(""), false);
  assert.equal(isStaleBuildError(undefined), false);
});

test("anti-laço: recarrega no máximo uma vez por janela", () => {
  assert.equal(shouldAutoReload(null, 1_000_000), true);
  assert.equal(shouldAutoReload(1_000_000, 1_000_000 + 5_000), false);
  assert.equal(shouldAutoReload(1_000_000, 1_000_000 + RELOAD_GUARD_MS + 1), true);
});
