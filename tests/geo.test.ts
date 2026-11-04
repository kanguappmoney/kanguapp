// Teste da guarda G4 no cliente + throttle. Roda com: node --test tests/geo.test.ts
// (Node 24 executa TS nativo por type-stripping.) Fica FORA do build do Next
// (excluído no tsconfig) porque importa com extensão .ts explícita.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  haversineMeters,
  shouldBroadcast,
  stopDistanceMeters,
  withinBoardingRange,
  BOARDING_PROXIMITY_M,
  SHEET_COLLAPSE_ABOVE_M,
  sheetAutoTarget,
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

// --- Gate de embarque a 100m (G1/G2) -----------------------------------------
// ~150m ao norte de P (0.00135° de latitude ≈ 150m).
const P_150m_north: GeoPoint = { lat: P.lat + 0.00135, lng: P.lng };

test("100m: sem GPS (driver null) => distância null", () => {
  assert.equal(stopDistanceMeters(null, P), null);
});

test("100m: aluno sem coordenada (stop null) => distância null", () => {
  assert.equal(stopDistanceMeters(P, null), null);
});

test("100m: dentro do raio (~30m) libera o botão normal", () => {
  const d = stopDistanceMeters(P, P_30m_north);
  assert.ok(d !== null && d <= BOARDING_PROXIMITY_M);
  assert.equal(withinBoardingRange(d), true);
});

test("100m: fora do raio (~150m) NÃO libera o normal (mas 'mesmo assim' cobre)", () => {
  const d = stopDistanceMeters(P, P_150m_north);
  assert.ok(d !== null && d > BOARDING_PROXIMITY_M);
  assert.equal(withinBoardingRange(d), false);
});

test("100m: sem confirmação de proximidade (null) => normal não libera", () => {
  // G1: o gate nunca vira trava — quem cobre o null é o 'embarcar mesmo assim'.
  assert.equal(withinBoardingRange(null), false);
});

test("100m: threshold é 100", () => {
  assert.equal(BOARDING_PROXIMITY_M, 100);
});

// --- Painel do Modo Direção (R9): recolher/expandir com histerese -------------
test("sheetAutoTarget: sem dado (GPS/coordenada) expande — nunca esconde a ação", () => {
  assert.equal(sheetAutoTarget(null), "expand");
});

test("sheetAutoTarget: ≤100m expande (borda inclusa); >130m recolhe", () => {
  assert.equal(sheetAutoTarget(0), "expand");
  assert.equal(sheetAutoTarget(BOARDING_PROXIMITY_M), "expand");
  assert.equal(sheetAutoTarget(SHEET_COLLAPSE_ABOVE_M), "hold"); // 130 ainda é faixa morta
  assert.equal(sheetAutoTarget(SHEET_COLLAPSE_ABOVE_M + 1), "collapse");
  assert.equal(sheetAutoTarget(3000), "collapse");
});

test("sheetAutoTarget: entre 100 e 130m é faixa morta (hold) — GPS oscilando não pisca", () => {
  for (const d of [100.5, 105, 110, 120, 129.9]) assert.equal(sheetAutoTarget(d), "hold");
  // O gate do arraste e o expandir do painel usam a MESMA borda de 100m.
  assert.equal(sheetAutoTarget(BOARDING_PROXIMITY_M) === "expand", withinBoardingRange(BOARDING_PROXIMITY_M));
});

test("sheetAutoTarget: simulação de GPS oscilando em torno dos 100m não troca de estado", () => {
  // Reproduz o defeito achado no navegador: 99 → 105 → 98 → 103 → 99 → 104.
  let collapsed = true; // chegou de longe, recolhido
  const flips: number[] = [];
  for (const d of [150, 101, 99, 105, 98, 103, 99, 104, 120]) {
    const t = sheetAutoTarget(d);
    if (t === "hold") continue;
    const next = t === "collapse";
    if (next !== collapsed) flips.push(d);
    collapsed = next;
  }
  assert.deepEqual(flips, [99]); // expande UMA vez (ao cruzar 100m) e fica
  assert.equal(collapsed, false);
});
