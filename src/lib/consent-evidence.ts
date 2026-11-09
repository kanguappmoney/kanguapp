import "server-only";
import { createHash } from "crypto";
import { headers } from "next/headers";
import { clientIp } from "@/lib/access-log";
import { CONSENT_VERSION, TEMPLATES, fill, type ConsentKind } from "@/lib/consent-texts";

// Monta a evidência de um aceite NO SERVIDOR (nunca confia no que o navegador diz ter exibido): versão, hash do
// modelo (texto com marcadores + declarações), cópia do texto já com os nomes, declarações marcadas, IP e dispositivo.
export async function buildEvidence(
  kind: ConsentKind,
  vars: { provider?: string; child?: string },
  opts: { checked?: boolean[]; method?: "remote" | "assisted_in_person" | "driver_self" } = {},
) {
  const h = await headers();
  const tpl = TEMPLATES[kind];
  const templateText = [...tpl.paragraphs, ...tpl.checkboxes].join("\n\n");
  const sha256 = createHash("sha256").update(`${CONSENT_VERSION}\n${kind}\n${templateText}`, "utf8").digest("hex");
  const shown = fill(tpl.paragraphs, vars);
  const checks = tpl.checkboxes.map((text, i) => ({ text, checked: opts.checked?.[i] === true }));
  const snapshot = [...shown, ...checks.map((c) => `[${c.checked ? "x" : " "}] ${c.text}`)].join("\n\n");
  return {
    version: CONSENT_VERSION,
    sha256,
    snapshot,
    checks,
    method: opts.method ?? "remote",
    ip: clientIp(h),
    user_agent: h.get("user-agent") ?? null,
  };
}
