import type { PillTone } from "@/components/patterns";

// Status de pagamento do aluno (students.pay_status) — rótulos e cores únicos
// do app: lista de Alunos e aba Mensalidades do Financeiro.
//   ok = em dia · at_risk = vencida, dentro da tolerância (em risco) ·
//   blocked = fatura suspensa (bloqueado).
export const PAY_CHIP: Record<string, { label: string; tone: PillTone }> = {
  ok: { label: "Em dia", tone: "done" },
  at_risk: { label: "Vencida", tone: "overdue" },
  blocked: { label: "Suspenso", tone: "danger" },
};

// Status da fatura (invoices.status) — um mapa só para motorista (Financeiro, detalhe) e responsável (Pagamentos).
// Em aberto = pendente (amarelo-claro); Vencida segue âmbar (aviso) com borda mais forte; Suspensa segue vermelha.
export const INVOICE_STATUS: Record<string, { label: string; tone: PillTone }> = {
  pending: { label: "Em aberto", tone: "pending" },
  overdue: { label: "Vencida", tone: "overdue" },
  suspended: { label: "Suspensa", tone: "danger" },
  paid: { label: "Paga", tone: "done" },
  canceled: { label: "Cancelada", tone: "neutral" },
};

export const SHIFT_LABEL: Record<string, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  integral: "Integral",
};
