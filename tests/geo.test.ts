// Teste da guarda G4 no cliente + throttle. Roda com: node --test tests/geo.test.ts
// (Node 24 executa TS nativo por type-stripping.) Fica FORA do build do Next
// (excluído no tsconfig) porque importa com extensão .ts explícita.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  haversineMeters,
  shouldBroadcast,
  MIN_INTERVAL_MS,
  MIN_DISTANCE_M,
  type GeoPoint,
} from "../src/lib/geo.ts";

const P: GeoPoint = { lat: -23.6672, lng: -46.4614 }; // Mauá-SP, referência
// ~30m ao norte de P (0.00027° de latitude ≈ 30m).
const P_30m_north: GeoPoint = { lat: P.lat + 0.00027, lng: P.lng };
// ~5m ao norte de P.
const P_5m_north: GeoPoint = { lat: P.lat + 0.000045, lng: P.lng };

const base = {
  active: true,
  visible: true,
  now: 100_000,
  lastSentAt: 0,
  lastSentPos: P,
  current: P_30m_north,
};

test("haversine: ~30m ao norte cai perto de 30m", () => {
  const d = haversineMeters(P, P_30m_north);
  assert.ok(d > 25 && d < 35, `esperava ~30m, veio ${d.toFixed(1)}m`);
});

test("G4: fora de rota ativa (active=false) NUNCA emite, mesmo movendo muito", () => {
  assert.equal(shouldBroadcast({ ...base, active: false }), false);
});

test("G4: aba em background (visible=false) NUNCA emite", () => {
  assert.equal(shouldBroadcast({ ...base, visible: false }), false);
});

test("primeiro fix da rota (sem envio anterior) emite na hora", () => {
  assert.equal(
    shouldBroadcast({ ...base, lastSentAt: null, lastSentPos: null }),
    true,
  );
});

test("throttle de tempo: < 10s desde o último envio não emite, mesmo tendo movido", () => {
  assert.equal(
    shouldBroadcast({ ...base, lastSentAt: base.now - (MIN_INTERVAL_MS - 1) }),
    false,
  );
});

test("throttle de distância: moveu < 20m não emite, mesmo passado o tempo", () => {
  assert.equal(
    shouldBroadcast({
      ...base,
      lastSentAt: base.now - MIN_INTERVAL_MS * 2,
      current: P_5m_north,
    }),
    false,
  );
});

test("passou o tempo E moveu o suficiente: emite", () => {
  assert.equal(
    shouldBroadcast({ ...base, lastSentAt: base.now - MIN_INTERVAL_MS * 2 }),
    true,
  );
  assert.ok(haversineMeters(base.lastSentPos, base.current) >= MIN_DISTANCE_M);
});
