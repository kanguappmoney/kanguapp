// Nome de exibição das escolas (INEP → legível). Regra pura, usada pelo script de importação e testável.
// O INEP entrega "ADELAIDE ESCOBAR BUENO PROFESSORA" (maiúsculas, sem acento, título/tipo no fim).
// Saída: "Professora Adelaide Escobar Bueno". O nome oficial continua guardado em `schools.name`.

// Siglas que ficam em maiúsculas.
const SIGLAS = new Set([
  "EMEF", "EMEI", "EMEB", "EMEIEF", "EMEIF", "EMEFEI", "EMEFM", "EMEBF", "EMEIB", "CEI", "CEMEI", "CMEI", "CEIM",
  "CEMEB", "CEU", "EE", "EM", "EMR", "ETEC", "FATEC", "APAE", "SESI", "SENAI", "SENAC", "SESC", "EPG", "CIEJA",
  "CEEJA", "EJA", "IFSP", "USP", "UNESP", "UNIP", "ONG", "CCI", "NEI", "CECI", "CEEI", "SP", "PM", "CEL", "CEPE",
  "CEFAM", "EEEF", "EEEM", "EEFM", "EMEFEM", "EPP", "ME", "UNICAMP", "UFSCAR", "IFSP", "CAIC", "CIEP", "UE", "EEI",
]);
// Abreviações do INEP que viram a palavra inteira (só as inequívocas no contexto escolar).
const EXPANDE: Record<string, string> = {
  CR: "Creche", ESC: "Escola", PART: "Particular", CONV: "Conveniada", MUN: "Municipal", EDUC: "Educação",
  LTDA: "Ltda.", INDIR: "Indireta", DIR: "Direta",
};
// Títulos de pessoa: abreviação → forma de exibição (a forma curta ganha ponto).
const TITULOS: Record<string, string> = {
  PROF: "Prof.", PROFA: "Profa.", PROFESSOR: "Professor", PROFESSORA: "Professora", DR: "Dr.", DRA: "Dra.",
  DOUTOR: "Doutor", DOUTORA: "Doutora", PADRE: "Padre", PE: "Pe.", IRMA: "Irmã", DOM: "Dom", DONA: "Dona",
  MONSENHOR: "Monsenhor", MONS: "Mons.", PASTOR: "Pastor", CONEGO: "Cônego", FREI: "Frei", ENGENHEIRO: "Engenheiro",
  VEREADOR: "Vereador", DEPUTADO: "Deputado", GENERAL: "General", CORONEL: "Coronel", COMENDADOR: "Comendador",
  BARAO: "Barão", VISCONDE: "Visconde", CAPITAO: "Capitão", MAJOR: "Major", TENENTE: "Tenente", SENADOR: "Senador",
};
// Tipo de instituição quando vem no fim ("RAIOS DE SOL EMEI") → vai para o começo.
const TIPOS_FIM = new Set([
  "EMEI", "EMEF", "EMEB", "EMEIEF", "EMEIF", "EMEFEI", "EMEFM", "CEI", "CEMEI", "CMEI", "CEIM", "CEMEB", "EE", "EM",
  "EMR", "COLEGIO", "ESCOLA", "CRECHE", "CEU", "ETEC", "FATEC",
]);
// Acentos só onde a palavra é inequívoca.
const ACENTOS: Record<string, string> = {
  COLEGIO: "Colégio", EDUCACAO: "Educação", JOSE: "José", JOAO: "João", SAO: "São", MARIO: "Mário", ANTONIO: "Antônio",
  CORACAO: "Coração", BERCARIO: "Berçário", INFANCIA: "Infância", MEDIO: "Médio", PRE: "Pré", ESCOLINHA: "Escolinha",
  CRIANCA: "Criança", CRIANCAS: "Crianças", AMERICA: "América", BRASILIA: "Brasília", MAE: "Mãe", IRMAO: "Irmão",
  IRMA: "Irmã", CONCEICAO: "Conceição", ASSUNCAO: "Assunção", ASSOCIACAO: "Associação", FUNDACAO: "Fundação",
  CIENCIA: "Ciência", CIENCIAS: "Ciências", TECNICO: "Técnico", TECNICA: "Técnica", PROFISSIONAL: "Profissional",
  ESPECIAL: "Especial", SOLIDARIEDADE: "Solidariedade", ALEGRIA: "Alegria", ESPERANCA: "Esperança", INFANTIL: "Infantil",
  MATERNAL: "Maternal", CENTRO: "Centro", JESUS: "Jesus", CRISTAO: "Cristão", FAMILIA: "Família", NOSSA: "Nossa",
  SENHORA: "Senhora", APARECIDA: "Aparecida", GRACA: "Graça", GRACAS: "Graças", LUCIA: "Lúcia", LUCIO: "Lúcio",
  JULIA: "Júlia", JULIO: "Júlio", CECILIA: "Cecília", MARCIA: "Márcia", SONIA: "Sônia", VANIA: "Vânia", ROSARIO: "Rosário",
  GONCALVES: "Gonçalves", GONCALO: "Gonçalo", LUIS: "Luís", ANGELA: "Ângela", ANGELICA: "Angélica", MONICA: "Mônica",
  VITORIA: "Vitória", VICTORIA: "Victória", HELIO: "Hélio", TEREZINHA: "Terezinha", ELOISA: "Eloísa", EUNICE: "Eunice",
  PAULISTA: "Paulista", MUNICIPAL: "Municipal", ESTADUAL: "Estadual", FEDERAL: "Federal", PARTICULAR: "Particular",
  HEITOR: "Heitor", CESAR: "César", ARTHUR: "Arthur", ABILIO: "Abílio", ALVARO: "Álvaro", ALVARES: "Álvares",
  AFONSO: "Afonso", ANDRE: "André", JACOME: "Jacomé", JERONIMO: "Jerônimo", BENEDITO: "Benedito", HENRIQUE: "Henrique",
  FRANCA: "França", GALVAO: "Galvão", GUIMARAES: "Guimarães", MAGALHAES: "Magalhães", MENDONCA: "Mendonça",
  PAIVA: "Paiva", TAVARES: "Tavares", VASCONCELOS: "Vasconcelos", ESTACAO: "Estação", SOLIDARIA: "Solidária",
  APRENDIZ: "Aprendiz", APRENDIZADO: "Aprendizado", AVENTURA: "Aventura", ESPACO: "Espaço", MUNDO: "Mundo",
  DESCOBERTA: "Descoberta", SABER: "Saber", FUTURO: "Futuro", EDUCACIONAL: "Educacional", UNIVERSITARIO: "Universitário",
  UNIVERSIDADE: "Universidade", INSTITUTO: "Instituto", ENSINO: "Ensino", FUNDAMENTAL: "Fundamental",
  MAGICO: "Mágico", MAGICA: "Mágica", ARCO: "Arco", IRIS: "Íris", PEQUENO: "Pequeno", PRINCIPE: "Príncipe",
  PRINCESA: "Princesa", ESTRELA: "Estrela", ARVORE: "Árvore", GEMEOS: "Gêmeos", BERCO: "Berço",
};
const LIGACOES = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);
const ROMANO = /^(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XX)$/;

function capitaliza(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function palavra(t: string, primeira: boolean): string {
  if (t.includes("-")) return t.split("-").map((p) => (p ? palavra(p, false) : p)).join("-");
  if (/^\d/.test(t) || t === "&") return t;
  if (ROMANO.test(t) && t.length > 1) return t;
  if (SIGLAS.has(t)) return t;
  if (EXPANDE[t]) return EXPANDE[t];
  if (!primeira && LIGACOES.has(t)) return t.toLowerCase();
  if (ACENTOS[t]) return ACENTOS[t];
  if (TITULOS[t]) return TITULOS[t];
  if (t.length <= 2 && !LIGACOES.has(t)) return t; // iniciais/siglas curtas (MV, JK, P) não viram "Mv"
  return capitaliza(t);
}

export function friendlyName(official: string): string {
  let tokens = official.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (tokens.length === 0) return official;

  // "E M E I JAYME…" → junta a sequência inicial de letras soltas (3 ou 4) numa sigla.
  let run = 0;
  while (run < tokens.length && tokens[run].length === 1 && /[A-Z]/.test(tokens[run])) run++;
  if (run >= 3 && run <= 4 && run < tokens.length) tokens = [tokens.slice(0, run).join(""), ...tokens.slice(run)];

  // Prefixo de tipo ("EMEI …") fica no começo; o título vai logo depois dele. "CEL JTO …" (prefixo
  // desconhecido) não é reordenado — só tem o título formatado no lugar.
  const prefixo = SIGLAS.has(tokens[0]) && TIPOS_FIM.has(tokens[0]) ? tokens.shift()! : null;
  const desconhecido = !prefixo && (SIGLAS.has(tokens[0]) || tokens[0] in EXPANDE);
  // "CR P CONV …" = Creche Particular Conveniada; "REC INF" = Recreação Infantil.
  tokens = tokens.map((t, i, a) => (t === "P" && a[i + 1] === "CONV" ? "PART" : t));
  for (let i = 0; i < tokens.length - 1; i++)
    if (tokens[i] === "REC" && tokens[i + 1] === "INF") tokens.splice(i, 2, "RECREACAO_INFANTIL");

  let tipo: string | null = null;
  let titulo: string | null = null;
  if (!prefixo && !desconhecido && tokens.length >= 2 && TIPOS_FIM.has(tokens[tokens.length - 1])) tipo = tokens.pop()!;
  if (!desconhecido && tokens.length >= 2 && TITULOS[tokens[tokens.length - 1]]) {
    titulo = TITULOS[tokens.pop()!];
  }

  const corpo = tokens.map((t, i) =>
    t === "RECREACAO_INFANTIL" ? "Recreação Infantil" : palavra(t, i === 0 && !prefixo && !tipo && !titulo),
  );
  const partes = [
    ...(prefixo ? [prefixo] : []),
    ...(tipo ? [palavra(tipo, true)] : []),
    ...(titulo ? [titulo] : []),
    ...corpo,
  ];
  return partes.join(" ");
}
