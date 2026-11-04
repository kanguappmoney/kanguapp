// Cobertura do motorista (cidades/bairros/escolas) — helpers puros do seletor guiado.
//
// O armazenamento NÃO muda (Frente C): três colunas `text` com nomes separados por vírgula,
// que `marketplace_tokens()` (banco) quebra em `[,;\n]+`. Por isso um nome nunca pode conter
// esses separadores: `cleanName` os troca por espaço (mesma regra de `add_neighborhood`).

export const MAX_SCHOOLS_PER_CITY = 150;

export function cleanName(s: string): string {
  return s.replace(/[,;\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

// Chave de comparação: sem diferença de maiúsculas (a mesma regra do filtro de busca no banco).
export function nameKey(s: string): string {
  return cleanName(s).toLowerCase();
}

// Trechos de um campo salvo (mesmo critério do banco), já limpos e sem repetição.
export function parseList(text: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (text ?? "").split(/[,;\n]+/)) {
    const name = cleanName(raw);
    const k = name.toLowerCase();
    if (name && !seen.has(k)) {
      seen.add(k);
      out.push(name);
    }
  }
  return out;
}

export function joinList(names: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const name = cleanName(n);
    const k = name.toLowerCase();
    if (name && !seen.has(k)) {
      seen.add(k);
      out.push(name);
    }
  }
  return out.join(", ");
}

export function sortPt(names: string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}
