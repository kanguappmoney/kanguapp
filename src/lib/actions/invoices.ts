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
  return { error: null };
}
