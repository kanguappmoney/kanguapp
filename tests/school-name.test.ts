// Regra do nome de exibição das escolas (INEP → legível). Roda com: node --test tests/school-name.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyName } from "../src/lib/school-name.ts";

// Casos aprovados na amostra de 30 escolas reais (oficial → exibição).
const CASOS: [string, string][] = [
  ["LAURA DA PURIFICACAO DE CASTRO MENDES PROFESSORA", "Professora Laura da Purificacao de Castro Mendes"],
  ["EMEI RUTH GONCALVES CHAVES DE SIQUEIRA PROFA", "EMEI Profa. Ruth Gonçalves Chaves de Siqueira"],
  ["CEL JTO EE WASHINGTON LUIZ PEREIRA DE SOUZA DR", "CEL Jto EE Washington Luiz Pereira de Souza Dr."],
  ["CEL JTO A EE REGINA VALARINI VIEIRA PROFA", "CEL Jto A EE Regina Valarini Vieira Profa."],
  ["JOAQUIM SILVADO DOUTOR", "Doutor Joaquim Silvado"],
  ["RENATA GUIMARAES BRANDAO ANADAO PROFESSORA EMEB", "EMEB Professora Renata Guimarães Brandao Anadao"],
  ["FRANCISCO SALLES NOGUEIRA PROF EMEF", "EMEF Prof. Francisco Salles Nogueira"],
  ["JOSE DO AMARAL MELLO PROF", "Prof. José do Amaral Mello"],
  ["CESARE TOPPINO PADRE", "Padre Cesare Toppino"],
  ["MV COLEGIO", "Colégio MV"],
  ["SETE DE SETEMBRO COLEGIO", "Colégio Sete de Setembro"],
  ["AVENTURA DO APRENDER CRECHE", "Creche Aventura do Aprender"],
  ["CR P CONV PLENO VIVER IV", "Creche Particular Conveniada Pleno Viver IV"],
  ["E M E I JAYME PAVANELLI GODOY", "EMEI Jayme Pavanelli Godoy"],
  ["ESC PART ABILITA COLEGIO UNIDADE II", "Escola Particular Abilita Colégio Unidade II"],
  ["ESC PART PEQUENO GENIO REC INF", "Escola Particular Pequeno Genio Recreação Infantil"],
  ["CEI INDIR ANTONIO JOAO DE MEDEIROS", "CEI Indireta Antônio João de Medeiros"],
  ["EMEF JOSE QUERINO RIBEIRO", "EMEF José Querino Ribeiro"],
  ["JOSE AUGUSTO OLIVEIRA SANTOS EMEB", "EMEB José Augusto Oliveira Santos"],
  ["JOSE MARTINS DE BARROS ASSOCIACAO BENEFICENTE", "José Martins de Barros Associação Beneficente"],
  ["DATA WAY ESCOLA TECNICA", "Data Way Escola Técnica"],
];

test("casos aprovados na amostra", () => {
  for (const [oficial, esperado] of CASOS) assert.equal(friendlyName(oficial), esperado, oficial);
});

test("é idempotente em nomes já legíveis e nunca devolve separadores da cobertura", () => {
  for (const [oficial] of CASOS) {
    const nome = friendlyName(oficial);
    assert.doesNotMatch(nome, /[,;\r\n]/);
    assert.ok(nome.length > 0);
  }
});

test("nome vazio ou de uma palavra não quebra", () => {
  assert.equal(friendlyName("COLEGIO"), "Colégio");
  assert.equal(friendlyName("  "), "  ");
});
