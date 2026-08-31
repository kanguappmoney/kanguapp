import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/ui";
import { FinanceiroPanel } from "@/components/FinanceiroPanel";

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default async function FinanceiroPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: students } = await supabase
    .from("students")
    .select("id, full_name, monthly_fee_cents")
    .eq("driver_id", user!.id)
    .eq("status", "active")
    .order("full_name");

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, student_id, status, amount_cents, due_date, students(full_name)")
    .eq("driver_id", user!.id)
    .eq("billing_period", firstOfMonth())
    .order("created_at");

  const invoiceRows = (invoices ?? []).map((i) => ({
    id: i.id,
    student_id: i.student_id,
    status: i.status,
    amount_cents: i.amount_cents,
    due_date: i.due_date,
    // @ts-expect-error relação aninhada do supabase-js
    name: i.students?.full_name ?? "Aluno",
  }));

  return (
    <>
      <AppHeader title="Financeiro" subtitle="Gestão inteligente" />
      <div className="px-4 pb-6 pt-4">
        <FinanceiroPanel students={students ?? []} invoices={invoiceRows} />
      </div>
    </>
  );
}
