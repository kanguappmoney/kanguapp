// Fonte ÚNICA de "hoje" no fuso do piloto (São Paulo, UTC-3). O servidor da
// Vercel roda em UTC: das ~21h à meia-noite locais ele já virou o dia em UTC, o
// que erraria tanto o match da execução do dia quanto o dia-da-semana da
// recorrência — bem na janela em que a volta pode estar rodando. Centralizar
// aqui garante que a DATA e o DIA-DA-SEMANA saem da MESMA computação e não podem
// divergir entre si nem entre os dois usos (execução × route_runs_on).

export interface SaoPauloDay {
  // ISO 'YYYY-MM-DD' no fuso de São Paulo — casa com service_date (tipo date).
  date: string;
  // Dia da semana ISO: 1=Seg … 7=Dom (mesma convenção de routes.weekdays).
  isoDow: number;
}

// Dia-da-semana ISO (1=Seg … 7=Dom) de uma data 'YYYY-MM-DD'. Ancorado ao
// meio-dia UTC pra que a leitura do dia nunca escorregue por fuso. Única fonte do
// "date → isoDow" (saoPauloDay e a sugestão de recorrência da UI usam este mesmo).
export function isoDowOf(date: string): number {
  const utcDow = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0=Dom … 6=Sáb
  return utcDow === 0 ? 7 : utcDow; // 1=Seg … 7=Dom
}

// A data vem do relógio local de São Paulo; o dia-da-semana é DERIVADO dessa
// mesma string (não de um segundo `new Date()`). Uma computação, dois valores.
export function saoPauloDay(now: Date = new Date()): SaoPauloDay {
  const date = now.toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  }); // en-CA => 'YYYY-MM-DD'
  return { date, isoDow: isoDowOf(date) };
}

// Atalho para quem só precisa da data (match de execução do dia).
export function saoPauloToday(now: Date = new Date()): string {
  return saoPauloDay(now).date;
}
