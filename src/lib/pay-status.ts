// Status de pagamento do aluno (students.pay_status) — rótulos e cores únicos
// do app: lista de Alunos e aba Mensalidades do Financeiro.
//   ok = em dia · at_risk = vencida, dentro da tolerância (em risco) ·
//   blocked = fatura suspensa (bloqueado).
export const PAY_CHIP: Record<string, { label: string; cls: string }> = {
  ok: { label: "Em dia", cls: "bg-green-100 text-green-800" },
  at_risk: { label: "Vencida", cls: "bg-amber-100 text-amber-800" },
  blocked: { label: "Suspenso", cls: "bg-red-100 text-red-800" },
};

export const SHIFT_LABEL: Record<string, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  integral: "Integral",
};
