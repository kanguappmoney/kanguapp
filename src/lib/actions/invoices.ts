"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { brlToCents } from "@/lib/money";

export type FinanceState = { error: string | null };

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function dueDay10() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-10`;
}

// Define a mensalidade do aluno. RLS (students update owner) garante o dono.
export async function setStudentFee(
  studentId: string,
  feeInput: string,
): Promise<FinanceState> {
  const cents = brlToCents(feeInput);
  if (cents === null) return { error: "Valor inválido." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({ monthly_fee_cents: cents })
    .eq("id", studentId);
  if (error) return { error: error.message };

  revalidatePath("/motorista/financeiro");
  return { error: null };
}

// Gera as faturas 'pending' do mês para alunos ativos com mensalidade definida.
// Idempotente: pula quem já tem fatura no período (unique student_id+billing_period).
export async function generateMonthlyInvoices(): Promise<FinanceState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const period = firstOfMonth();
  const due = dueDay10();

  const { data: students } = await supabase
    .from("students")
    .select("id, monthly_fee_cents")
    .eq("driver_id", user.id)
    .eq("status", "active")
    .not("monthly_fee_cents", "is", null);

  if (!students?.length)
    return { error: "Defina a mensalidade de pelo menos um aluno antes de gerar." };

  // Snapshot da tolerância na emissão (piso 2). Vem do default do motorista.
  const { data: prof } = await supabase
    .from("driver_profiles")
    .select("default_tolerance_days")
    .eq("user_id", user.id)
    .single();
  const tolerance = Math.max(2, prof?.default_tolerance_days ?? 2);

  const { data: existing } = await supabase
    .from("invoices")
    .select("student_id")
    .eq("driver_id", user.id)
    .eq("billing_period", period);
  const has = new Set((existing ?? []).map((e) => e.student_id));

  const toCreate = students.filter((s) => !has.has(s.id));
  if (!toCreate.length) return { error: null }; // tudo já gerado neste mês

  // guardião vinculado (primeiro) por aluno — opcional, para referência/Asaas.
  const ids = toCreate.map((s) => s.id);
  const { data: links } = await supabase
    .from("guardian_student")
    .select("student_id, guardian_id")
    .in("student_id", ids);
  const guardianByStudent = new Map<string, string>();
  for (const l of links ?? [])
    if (!guardianByStudent.has(l.student_id))
      guardianByStudent.set(l.student_id, l.guardian_id);

  const rows = toCreate.map((s) => ({
    student_id: s.id,
    guardian_id: guardianByStudent.get(s.id) ?? null,
    driver_id: user.id,
    status: "pending" as const,
    billing_period: period,
    amount_cents: s.monthly_fee_cents as number,
    due_date: due,
    tolerance_days: tolerance,
  }));

  const { error } = await supabase.from("invoices").insert(rows);
  if (error) return { error: error.message };

  revalidatePath("/motorista/financeiro");
  return { error: null };
}

// Pix manual (piloto): marca a fatura como paga. As transições sensíveis
// (reativação de suspensa, recálculo do pay_status) já vivem nos triggers.
export async function markInvoicePaid(invoiceId: string): Promise<FinanceState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({
      status: "paid",
      payment_provider: "manual",
      paid_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);
  if (error) return { error: error.message };

  await supabase
    .from("invoice_events")
    .insert({ invoice_id: invoiceId, type: "paid", channel: "in_app" });

  revalidatePath("/motorista/financeiro");
  revalidatePath(`/motorista/financeiro/${invoiceId}`);
  return { error: null };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// pending -> overdue para as faturas vencidas (hoje > vencimento). Manual no
// piloto (botão "Atualizar vencidas"); a lógica já serve de tarefa agendada.
export async function markOverdueInvoices(): Promise<FinanceState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { data: dueList } = await supabase
    .from("invoices")
    .select("id")
    .eq("driver_id", user.id)
    .eq("status", "pending")
    .lt("due_date", today());

  const ids = (dueList ?? []).map((d) => d.id);
  if (!ids.length) {
    revalidatePath("/motorista/financeiro");
    return { error: null };
  }

  await supabase.from("invoices").update({ status: "overdue" }).in("id", ids);
  await supabase
    .from("invoice_events")
    .insert(ids.map((id) => ({ invoice_id: id, type: "marked_overdue", channel: "in_app" })));

  revalidatePath("/motorista/financeiro");
  return { error: null };
}

// Régua/aviso definitivo — registra eventos. No piloto o motorista envia o aviso
// de fato por fora (WhatsApp) e usa estes botões pra registrar o estado.
async function addEvent(invoiceId: string, type: string, delivered = false) {
  const supabase = await createClient();
  const { error } = await supabase.from("invoice_events").insert({
    invoice_id: invoiceId,
    type,
    channel: "in_app",
    delivered_at: delivered ? new Date().toISOString() : null,
  });
  revalidatePath(`/motorista/financeiro/${invoiceId}`);
  return { error: error?.message ?? null };
}

export async function sendReminder(invoiceId: string) {
  return { error: await addEvent(invoiceId, "reminder_sent").then((r) => r.error) };
}
export async function sendFinalWarning(invoiceId: string) {
  return { error: (await addEvent(invoiceId, "final_warning_sent")).error };
}
// G3: registrar a ENTREGA confirmada do aviso definitivo — é isto que destrava
// a suspensão no trigger enforce_invoice_transition.
export async function confirmWarningDelivered(invoiceId: string) {
  return { error: (await addEvent(invoiceId, "final_warning_delivered", true)).error };
}
// G3: entrega falhou -> NÃO suspende sozinho; fica registrado para o motorista
// decidir manualmente.
export async function reportWarningFailed(invoiceId: string) {
  return { error: (await addEvent(invoiceId, "final_warning_failed")).error };
}

// overdue -> suspended. O trigger G3 recusa se não houver final_warning_delivered.
export async function suspendInvoice(invoiceId: string): Promise<FinanceState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ status: "suspended" })
    .eq("id", invoiceId);

  if (error) {
    if (/G3/.test(error.message))
      return {
        error:
          "Não dá para suspender sem o aviso definitivo entregue (G3). Envie o aviso e confirme a entrega primeiro.",
      };
    return { error: error.message };
  }

  await supabase
    .from("invoice_events")
    .insert({ invoice_id: invoiceId, type: "suspended", channel: "in_app" });

  revalidatePath("/motorista/financeiro");
  revalidatePath(`/motorista/financeiro/${invoiceId}`);
  return { error: null };
}

// Tolerância default do motorista (piso 2). A G3 continua obrigatória e não
// configurável — só a folga em dias é ajustável.
export async function setDefaultTolerance(days: number): Promise<FinanceState> {
  if (!Number.isInteger(days) || days < 2)
    return { error: "A tolerância mínima é de 2 dias." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { error } = await supabase
    .from("driver_profiles")
    .update({ default_tolerance_days: days })
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/motorista/financeiro/regua");
  return { error: null };
}
