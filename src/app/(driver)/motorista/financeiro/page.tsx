import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/ui";
import { DriverActions } from "@/components/DriverHeaderActions";
import { FinanceiroPanel } from "@/components/FinanceiroPanel";
import { saoPauloToday } from "@/lib/day";
import {
  currentMonth,
  getFinanceDashboard,
  isValidMonth,
  shiftMonth,
} from "@/lib/finance-dashboard";
import {
  FinanceDashboard,
  MonthSelector,
  monthLabel,
} from "@/components/FinanceDashboard";
import { ExpensesPanel, type Expense } from "@/components/ExpensesPanel";

// Mês corrente no fuso de São Paulo ('YYYY-MM' do saoPauloToday).
function firstOfMonth() {
  return `${saoPauloToday().slice(0, 7)}-01`;
}

// R11: painel (seletor de mês + 3 grupos) no topo; abaixo, 2 sub-abas — "A
// receber" (o FinanceiroPanel de antes, intocado: mês corrente) e "Despesas".
export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; aba?: string }>;
}) {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { mes, aba } = await searchParams;
  const now = currentMonth();
  const month = isValidMonth(mes) ? mes : now;
  const tab = aba === "despesas" ? "despesas" : "receber";
  const months = [
    { ym: shiftMonth(now, -1), label: "Anterior" },
    { ym: now, label: "Atual" },
    { ym: shiftMonth(now, 1), label: "Próximo" },
  ];

  const dashboard = await getFinanceDashboard(user!.id, month);

  // Despesas do mês selecionado (sub-aba "Despesas").
  const { data: expenses } = await supabase
    .from("driver_expenses")
    .select("id, category, amount_cents, expense_date, note")
    .eq("driver_id", user!.id)
    .gte("expense_date", `${month}-01`)
    .lt("expense_date", `${shiftMonth(month, 1)}-01`)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

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
      <AppHeader
        title="Financeiro"
        subtitle="Gestão inteligente"
        actions={<DriverActions />}
      />
      <div className="space-y-5 px-4 pb-6 pt-4">
        <MonthSelector months={months} selected={month} tab={tab} />
        <FinanceDashboard data={dashboard} />

        {/* Sub-abas */}
        <div className="grid grid-cols-2 rounded-xl bg-navy-900/5 p-1">
          {[
            { key: "receber", label: "A receber" },
            { key: "despesas", label: "Despesas" },
          ].map((t) => (
            <Link
              key={t.key}
              href={`/motorista/financeiro?mes=${month}&aba=${t.key}`}
              aria-current={tab === t.key ? "page" : undefined}
              className={`rounded-lg py-2 text-center text-sm font-semibold ${
                tab === t.key ? "bg-white text-navy-900 shadow-sm" : "text-navy-700/60"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {tab === "receber" ? (
          <FinanceiroPanel students={students ?? []} invoices={invoiceRows} />
        ) : (
          <ExpensesPanel
            expenses={(expenses ?? []) as Expense[]}
            defaultDate={month === now ? saoPauloToday() : `${month}-01`}
            monthLabel={monthLabel(month)}
          />
        )}
      </div>
    </>
  );
}
