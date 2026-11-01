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
import { NewExpenseSheet } from "@/components/NewExpenseSheet";
import { SegmentedTabs } from "@/components/SegmentedTabs";
import { MensalidadesFilters } from "@/components/MensalidadesFilters";
import { MensalidadesList, type MensalidadeRow } from "@/components/MensalidadesList";

// Mês corrente no fuso de São Paulo ('YYYY-MM' do saoPauloToday).
function firstOfMonth() {
  return `${saoPauloToday().slice(0, 7)}-01`;
}

type Tab = "visao" | "receber" | "despesas" | "mensalidades";
const TABS: { key: Tab; label: string }[] = [
  { key: "visao", label: "Visão Geral" },
  { key: "receber", label: "A receber" },
  { key: "despesas", label: "Despesas" },
  { key: "mensalidades", label: "Mensalidades" },
];

// Financeiro em 4 abas de primeiro nível (sem aninhar): Visão Geral (painel R11
// + "+ Nova despesa"), A receber (FinanceiroPanel, intocado: mês corrente),
// Despesas (ExpensesPanel do mês selecionado) e Mensalidades (consulta com
// filtros). A aba vive em `?aba=`; cada aba só carrega o próprio dado.
export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{
    mes?: string;
    aba?: string;
    escola?: string;
    turno?: string;
    rota?: string;
  }>;
}) {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { mes, aba, escola, turno, rota } = await searchParams;
  const now = currentMonth();
  const month = isValidMonth(mes) ? mes : now;
  const tab: Tab = TABS.some((t) => t.key === aba) ? (aba as Tab) : "visao";
  const months = [
    { ym: shiftMonth(now, -1), label: "Anterior" },
    { ym: now, label: "Atual" },
    { ym: shiftMonth(now, 1), label: "Próximo" },
  ];
  // Data sugerida no formulário de despesa: hoje no mês atual; dia 1 nos outros.
  const expenseDefaultDate = month === now ? saoPauloToday() : `${month}-01`;

  return (
    <>
      <AppHeader
        title="Financeiro"
        subtitle="Gestão inteligente"
        actions={<DriverActions />}
      />
      <div className="space-y-5 px-4 pb-6 pt-4">
        <SegmentedTabs
          active={tab}
          tabs={TABS.map((t) => ({
            key: t.key,
            label: t.label,
            href: `/motorista/financeiro?aba=${t.key}&mes=${month}`,
          }))}
        />

        {tab === "visao" && (
          <VisaoGeral
            driverId={user!.id}
            month={month}
            months={months}
            expenseDefaultDate={expenseDefaultDate}
          />
        )}
        {tab === "receber" && <AReceber driverId={user!.id} />}
        {tab === "despesas" && (
          <Despesas
            driverId={user!.id}
            month={month}
            months={months}
            expenseDefaultDate={expenseDefaultDate}
          />
        )}
        {tab === "mensalidades" && (
          <Mensalidades
            driverId={user!.id}
            filters={{ escola, turno, rota }}
          />
        )}
      </div>
    </>
  );
}

type Months = { ym: string; label: string }[];

// --- Visão Geral: o painel R11 como está + "+ Nova despesa" (sheet) ----------
async function VisaoGeral({
  driverId,
  month,
  months,
  expenseDefaultDate,
}: {
  driverId: string;
  month: string;
  months: Months;
  expenseDefaultDate: string;
}) {
  const dashboard = await getFinanceDashboard(driverId, month);
  return (
    <>
      <NewExpenseSheet defaultDate={expenseDefaultDate} />
      <MonthSelector months={months} selected={month} tab="visao" />
      <FinanceDashboard data={dashboard} />
    </>
  );
}

// --- A receber: exatamente como antes (mês corrente) -------------------------
async function AReceber({ driverId }: { driverId: string }) {
  const supabase = await createClient();

  const { data: students } = await supabase
    .from("students")
    .select("id, full_name, monthly_fee_cents")
    .eq("driver_id", driverId)
    .eq("status", "active")
    .order("full_name");

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, student_id, status, amount_cents, due_date, students(full_name)")
    .eq("driver_id", driverId)
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

  return <FinanceiroPanel students={students ?? []} invoices={invoiceRows} />;
}

// --- Despesas: exatamente como antes (mês selecionado) -----------------------
async function Despesas({
  driverId,
  month,
  months,
  expenseDefaultDate,
}: {
  driverId: string;
  month: string;
  months: Months;
  expenseDefaultDate: string;
}) {
  const supabase = await createClient();
  const { data: expenses } = await supabase
    .from("driver_expenses")
    .select("id, category, amount_cents, expense_date, note")
    .eq("driver_id", driverId)
    .gte("expense_date", `${month}-01`)
    .lt("expense_date", `${shiftMonth(month, 1)}-01`)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <>
      <MonthSelector months={months} selected={month} tab="despesas" />
      <ExpensesPanel
        expenses={(expenses ?? []) as Expense[]}
        defaultDate={expenseDefaultDate}
        monthLabel={monthLabel(month)}
      />
    </>
  );
}

// --- Mensalidades: consulta dos ativos, filtros escola × turno × rota --------
async function Mensalidades({
  driverId,
  filters,
}: {
  driverId: string;
  filters: { escola?: string; turno?: string; rota?: string };
}) {
  const supabase = await createClient();
  const [{ data: students }, { data: routes }, { data: stops }] = await Promise.all([
    supabase
      .from("students")
      .select("id, full_name, school, school_address, shift, monthly_fee_cents, pay_status")
      .eq("driver_id", driverId)
      .eq("status", "active")
      .order("full_name"),
    supabase.from("routes").select("id, name").eq("driver_id", driverId).order("name"),
    supabase.from("route_stops").select("route_id, student_id"),
  ]);

  const routeName = new Map((routes ?? []).map((r) => [r.id, r.name]));
  const routesOf = new Map<string, Set<string>>(); // aluno → rotas
  for (const s of stops ?? []) {
    if (!routeName.has(s.route_id)) continue;
    if (!routesOf.has(s.student_id)) routesOf.set(s.student_id, new Set());
    routesOf.get(s.student_id)!.add(s.route_id);
  }

  // Escola = nome cadastrado (cai no endereço se não houver nome), valor bruto.
  const schoolOf = (s: { school: string | null; school_address: string | null }) =>
    s.school ?? s.school_address ?? "Sem escola";

  const all: MensalidadeRow[] = (students ?? []).map((s) => ({
    id: s.id,
    name: s.full_name,
    school: schoolOf(s),
    shift: s.shift,
    feeCents: s.monthly_fee_cents,
    payStatus: s.pay_status,
    routes: [...(routesOf.get(s.id) ?? [])].map((id) => routeName.get(id)!),
  }));

  // Cada filtro é opcional e eles se combinam (E).
  const rows = all.filter(
    (r) =>
      (!filters.escola || r.school === filters.escola) &&
      (!filters.turno || r.shift === filters.turno) &&
      (!filters.rota || (routesOf.get(r.id)?.has(filters.rota) ?? false)),
  );
  const schools = [...new Set(all.map((r) => r.school))].sort((a, b) => a.localeCompare(b));

  return (
    <>
      <MensalidadesFilters schools={schools} routes={routes ?? []} />
      <MensalidadesList
        rows={rows}
        filtered={!!(filters.escola || filters.turno || filters.rota)}
      />
    </>
  );
}
