export type Platform = "android" | "ios" | "desktop";

export function detectPlatform(ua: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  // iPadOS 13+ se identifica como Macintosh; só o toque o distingue de um Mac.
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

// iOS só instala pelo Safari; outros navegadores (Chrome, Firefox…) não têm o passo.
export function isIosSafari(ua: string) {
  return !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram/i.test(ua);
}
