// Prova HTTP da exposição (fatia E): com a chave anon (pública) confirma que set_config e as funções internas NÃO são chamáveis
// por RPC e que as tabelas sensíveis recusam leitura anônima. Rodar da raiz do repositório: node docs/seguranca/http_exposure.mjs
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const calls = [["set_config", { setting_name: "kangu.consent_internal", new_value: "1", is_local: true }], ["_insert_consent", {}], ["_anonymize_student", { p_student: "00000000-0000-0000-0000-000000000000", p_reason: "admin", p_detail: null, p_actor: null }], ["anonymize_due_students", {}], ["purge_stale_submissions", {}], ["admin_erase_student", { p_student_id: "00000000-0000-0000-0000-000000000000" }], ["_student_in_transit_today", { p_student: "00000000-0000-0000-0000-000000000000" }], ["approve_capture", { p_submission_id: "00000000-0000-0000-0000-000000000000" }]];
for (const [fn, body] of calls) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: ANON, authorization: `Bearer ${ANON}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const t = (await r.text()).slice(0, 110).replace(/\s+/g, " ");
  console.log(fn.padEnd(28), r.status, t);
}
for (const tb of ["consents", "erasure_ledger", "erasure_deferred", "app_access_log", "retention_exceptions", "students", "invoices", "occurrences"]) {
  const r = await fetch(`${URL_}/rest/v1/${tb}?select=*&limit=1`, { headers: { apikey: ANON, authorization: `Bearer ${ANON}` } });
  console.log(("GET " + tb).padEnd(28), r.status, (await r.text()).slice(0, 80).replace(/\s+/g, " "));
}
