// Roda com: node --test tests/navigation.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { distM, distToLine, upcomingStepIndex, type NavStep } from "../src/lib/navigation.ts";

const step = (lat: number, lng: number, m: NavStep["maneuver"] = "left"): NavStep => ({
  instruction: "x",
  maneuver: m,
  at: { lat, lng },
  distance: 100,
});

test("distM: ~111 m por 0,001° de latitude", () => {
  const d = distM({ lat: -23.67, lng: -46.46 }, { lat: -23.669, lng: -46.46 });
  assert.ok(d > 105 && d < 117, String(d));
});

test("distToLine: perto da linha ~0, fora ~ distância real", () => {
  const line: [number, number][] = [
    [-46.46, -23.67],
    [-46.45, -23.67],
  ];
  assert.ok(distToLine({ lat: -23.67, lng: -46.455 }, line) < 1);
  const off = distToLine({ lat: -23.66991, lng: -46.455 }, line); // ~10 m ao lado
  assert.ok(off > 8 && off < 13, String(off));
});

test("upcomingStepIndex: avança quando passa da manobra, nunca passa do último", () => {
  const steps = [step(-23.669, -46.46), step(-23.668, -46.46), step(-23.667, -46.46, "arrive")];
  assert.equal(upcomingStepIndex({ lat: -23.6705, lng: -46.46 }, steps), 0);
  assert.equal(upcomingStepIndex({ lat: -23.669, lng: -46.46 }, steps), 1); // em cima da 1ª manobra
  assert.equal(upcomingStepIndex({ lat: -23.667, lng: -46.46 }, steps), 0); // avanço é sequencial (a partir do passo atual)
  assert.equal(upcomingStepIndex({ lat: -23.668, lng: -46.46 }, steps, 1), 2);
  assert.equal(upcomingStepIndex({ lat: -23.667, lng: -46.46 }, steps, 2), 2);
  assert.equal(upcomingStepIndex({ lat: -23.5, lng: -46.46 }, [], 0), 0);
});
