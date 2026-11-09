// Dia de pagamento (vencimento) por aluno. Sem dia definido, vale o padrão do piloto: dia 10.
export const DEFAULT_DUE_DAY = 10;

// Vencimento de um mês ("YYYY-MM") para o dia escolhido (1–31). Mês curto usa o último dia do mês
// (dia 31 → 30/abr, 28 ou 29/fev). Devolve "YYYY-MM-DD".
export function dueDateFor(ym: string, day: number | null | undefined): string {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d = Math.min(Math.max(day ?? DEFAULT_DUE_DAY, 1), last);
  return `${ym}-${String(d).padStart(2, "0")}`;
}

export function paymentDayLabel(day: number | null | undefined): string {
  return day ? `Dia ${day} de cada mês` : "Não definida";
}
