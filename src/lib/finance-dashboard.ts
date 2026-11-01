import { createClient } from "@/lib/supabase/server";
import { isoDowOf, saoPauloToday } from "@/lib/day";
import { routeRunsToday, type ExceptionKind } from "@/lib/recurrence";

// R11 — painel do Financeiro (3 grupos, 1 número por card, sem gráfico). Tudo
// recortado pelo mês selecionado ('YYYY-MM', fuso de São Paulo), exceto o que é
// ESTADO ATUAL por definição: "a receber" (pending), "em atraso"
// (overdue/suspended) e "alunos ativos". Um número sem base honesta vira `null`
// → a tela mostra "sem dado suficiente" (nunca 0% inventado).

// ---------------------------------------------------------------------------
// Mês
// ---------------------------------------------------------------------------
export function currentMonth(): string {
  return saoPauloToday().slice(0, 7);
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isValidMonth(v: string | undefined): v is string {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

// [início, fim) do mês: datas ('YYYY-MM-DD') e instantes em São Paulo (UTC-3 —
// sem horário de verão desde 2019), para comparar timestamptz (paid_at etc.).
function bounds(ym: string) {
  const start = `${ym}-01`;
  const next = `${shiftMonth(ym, 1)}-01`;
  return {
    start,
    next,
    startTs: `${start}T00:00:00-03:00`,
    nextTs: `${next}T00:00:00-03:00`,
  };
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Data ('YYYY-MM-DD') de um instante no fuso de São Paulo.
function spDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// HH:MM:SS de um instante no relógio de São Paulo (p/ comparar com `time`).
function spClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour12: false,
  });
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export interface FinanceDashboard {
  month: string;
  finance: {
    receivedCents: number; // faturas pagas no mês (paid_at no mês)
    receivableCents: number; // pending em aberto (estado atual)
    overdueCents: number; // overdue + suspended (estado atual)
    overdueStudents: number;
    defaultRate: number | null; // overdue+suspended / faturas do mês
    expensesCents: number;
    netCents: number; // recebido − despesas
  };
  students: {
    active: number;
    newInMonth: number;
    attendanceRate: number | null; // 1 − ausências / oportunidades
    topSchools: { address: string; count: number }[];
  };
  operation: {
    lateRate: number | null; // ida iniciada depois do pickup_target_time
    lateCount: number;
    eligible: number;
  };
}

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------
export async function getFinanceDashboard(
  driverId: string,
  ym: string,
): Promise<FinanceDashboard> {
  const supabase = await createClient();
  const { start, next, startTs, nextTs } = bounds(ym);

  const [
    { data: invoices },
    { data: expenses },
    { data: students },
    { data: routes },
    { data: stops },
    { data: exceptions },
    { data: absences },
    { data: execs },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("student_id, status, amount_cents, paid_at, billing_period")
      .eq("driver_id", driverId),
    supabase
      .from("driver_expenses")
      .select("amount_cents")
      .eq("driver_id", driverId)
      .gte("expense_date", start)
      .lt("expense_date", next),
    supabase
      .from("students")
      .select("id, status, created_at, school_address")
      .eq("driver_id", driverId),
    supabase
      .from("routes")
      .select("id, direction, weekdays, pickup_target_time, created_at")
      .eq("driver_id", driverId),
    supabase.from("route_stops").select("route_id, student_id"),
    supabase
      .from("route_exceptions")
      .select("route_id, date, kind")
      .gte("date", start)
      .lt("date", next),
    supabase
      .from("absences")
      .select("student_id, service_date")
      .gte("service_date", start)
      .lt("service_date", next),
    supabase
      .from("route_executions")
      .select(
        "id, route_id, leg, service_date, started_at, route_events(student_id, type)",
      )
      .gte("service_date", start)
      .lt("service_date", next),
  ]);

  // --- Financeiro ---------------------------------------------------------
  const inv = invoices ?? [];
  const sum = (rows: { amount_cents: number }[]) =>
    rows.reduce((acc, r) => acc + r.amount_cents, 0);

  // Receita recebida: pagas com paid_at dentro do mês (comparado como instante).
  const inMonth = (iso: string | null) =>
    !!iso && new Date(iso) >= new Date(startTs) && new Date(iso) < new Date(nextTs);
  const received = sum(inv.filter((i) => i.status === "paid" && inMonth(i.paid_at)));
  const receivable = sum(inv.filter((i) => i.status === "pending"));
  const overdue = inv.filter((i) => i.status === "overdue" || i.status === "suspended");
  const monthInvoices = inv.filter(
    (i) => i.billing_period === start && i.status !== "canceled",
  );
  const monthOverdue = monthInvoices.filter(
    (i) => i.status === "overdue" || i.status === "suspended",
  ).length;
  const expensesCents = sum(expenses ?? []);

  // --- Alunos -------------------------------------------------------------
  const allStudents = students ?? [];
  const active = allStudents.filter((s) => s.status === "active");
  const newInMonth = allStudents.filter((s) => inMonth(s.created_at)).length;

  // Ranking por school_address BRUTO (sem normalizar — decisão travada).
  const bySchool = new Map<string, number>();
  for (const s of active) {
    const key = s.school_address ?? "Sem endereço da escola";
    bySchool.set(key, (bySchool.get(key) ?? 0) + 1);
  }
  const topSchools = [...bySchool.entries()]
    .map(([address, count]) => ({ address, count }))
    .sort((a, b) => b.count - a.count || a.address.localeCompare(b.address))
    .slice(0, 5);

  const attendanceRate = attendance({
    start,
    next,
    activeSince: new Map(active.map((s) => [s.id, spDate(s.created_at)])),
    routes: routes ?? [],
    stops: stops ?? [],
    exceptions: exceptions ?? [],
    absences: absences ?? [],
    execs: execs ?? [],
  });

  // --- Operação: atraso da ida (sem margem) -------------------------------
  // Só rotas com pickup_target_time; ida = perna pickup (ou legado outbound).
  const routeById = new Map((routes ?? []).map((r) => [r.id, r]));
  let eligible = 0;
  let lateCount = 0;
  for (const e of execs ?? []) {
    const r = routeById.get(e.route_id);
    if (!r?.pickup_target_time || !e.started_at) continue;
    const isIda = e.leg === "pickup" || (e.leg == null && r.direction === "outbound");
    if (!isIda) continue;
    eligible++;
    if (spClock(e.started_at) > r.pickup_target_time) lateCount++;
  }

  return {
    month: ym,
    finance: {
      receivedCents: received,
      receivableCents: receivable,
      overdueCents: sum(overdue),
      overdueStudents: new Set(overdue.map((i) => i.student_id)).size,
      defaultRate: monthInvoices.length ? monthOverdue / monthInvoices.length : null,
      expensesCents,
      netCents: received - expensesCents,
    },
    students: {
      active: active.length,
      newInMonth,
      attendanceRate,
      topSchools,
    },
    operation: {
      lateRate: eligible ? lateCount / eligible : null,
      lateCount,
      eligible,
    },
  };
}

// Frequência (proxy "agenda + execuções", decisão do Abner): oportunidade =
// aluno ativo × dia do mês (até hoje; a partir do cadastro do aluno e da rota)
// em que uma rota dele roda pela
// recorrência (mesma regra do route_runs_on, via routeRunsToday, com as
// exceções). Ausência = (aluno, dia) com ausência declarada pelo pai
// (absences) OU "Ausente" marcado pelo motorista (route_events) — só conta se
// cair numa oportunidade. Sem oportunidade (mês futuro, sem rota) → null.
function attendance(input: {
  start: string;
  next: string;
  activeSince: Map<string, string>; // aluno ativo → dia do cadastro (SP)
  routes: { id: string; weekdays: number[] | null; created_at: string }[];
  stops: { route_id: string; student_id: string }[];
  exceptions: { route_id: string; date: string; kind: string }[];
  absences: { student_id: string; service_date: string }[];
  execs: {
    service_date: string;
    route_events: { student_id: string | null; type: string }[] | null;
  }[];
}): number | null {
  // Último dia contável: hoje no mês corrente; o último dia num mês passado.
  const today = saoPauloToday();
  const last = today < input.next ? today : addDays(input.next, -1);
  if (last < input.start) return null; // mês futuro: nada aconteceu

  const studentsByRoute = new Map<string, Set<string>>();
  for (const s of input.stops) {
    if (!input.activeSince.has(s.student_id)) continue;
    if (!studentsByRoute.has(s.route_id)) studentsByRoute.set(s.route_id, new Set());
    studentsByRoute.get(s.route_id)!.add(s.student_id);
  }
  const exceptionOf = new Map(
    input.exceptions.map((e) => [`${e.route_id}|${e.date}`, e.kind as ExceptionKind]),
  );

  // Só conta dias a partir do cadastro da rota e do aluno — antes disso não
  // havia como o aluno estar na van (senão viraria "falta" inventada).
  const routeSince = new Map(input.routes.map((r) => [r.id, spDate(r.created_at)]));
  const opportunities = new Set<string>(); // "aluno|dia"
  for (let day = input.start; day <= last; day = addDays(day, 1)) {
    const dow = isoDowOf(day);
    for (const r of input.routes) {
      const kids = studentsByRoute.get(r.id);
      if (!kids?.size || day < routeSince.get(r.id)!) continue;
      if (!routeRunsToday(r.weekdays, exceptionOf.get(`${r.id}|${day}`) ?? null, dow)) continue;
      for (const k of kids) if (day >= input.activeSince.get(k)!) opportunities.add(`${k}|${day}`);
    }
  }
  if (!opportunities.size) return null;

  const absent = new Set<string>();
  for (const a of input.absences) absent.add(`${a.student_id}|${a.service_date}`);
  for (const e of input.execs)
    for (const ev of e.route_events ?? [])
      if (ev.type === "student_absent" && ev.student_id)
        absent.add(`${ev.student_id}|${e.service_date}`);

  let absentCount = 0;
  for (const key of absent) if (opportunities.has(key)) absentCount++;
  return 1 - absentCount / opportunities.size;
}
