// Detecção de sistema da página /baixar. Roda com: node --test tests/platform.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPlatform, isIosSafari } from "../src/lib/platform.ts";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const WINDOWS_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

test("iPhone → ios", () => assert.equal(detectPlatform(IPHONE_SAFARI), "ios"));
test("iPhone no Chrome → ios (mas não Safari)", () => {
  assert.equal(detectPlatform(IPHONE_CHROME), "ios");
  assert.equal(isIosSafari(IPHONE_CHROME), false);
  assert.equal(isIosSafari(IPHONE_SAFARI), true);
});
test("Android → android", () =>
  assert.equal(detectPlatform(ANDROID_CHROME), "android"));
test("iPad no modo desktop (Macintosh + toque) → ios", () =>
  assert.equal(detectPlatform(MAC_SAFARI, 5), "ios"));
test("Mac e Windows → desktop", () => {
  assert.equal(detectPlatform(MAC_SAFARI, 0), "desktop");
  assert.equal(detectPlatform(WINDOWS_CHROME, 0), "desktop");
});
