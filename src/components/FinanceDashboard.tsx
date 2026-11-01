import Link from "next/link";
import { centsToBRL } from "@/lib/money";
import type { FinanceDashboard as Data } from "@/lib/finance-dashboard";

// R11 — painel do topo do Financeiro: seletor de mês (anterior/atual/próximo) e
// 3 grupos de cards, 1 número por card, sem gráfico. Apresentação pura.

const NO_DATA = "sem dado suficiente";

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function pct(v: number | null): string {
  return v == null ? NO_DATA : `${Math.round(v * 100)}%`;
}

export function MonthSelector({
  months,
  selected,
  tab,
}: {
  months: { ym: string; label: string }[]; // anterior, atual, próximo
  selected: string;
  tab: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {months.map((m) => {
        const active = m.ym === selected;
        return (
          <Link
            key={m.ym}
            href={`/motorista/financeiro?mes=${m.ym}&aba=${tab}`}
            aria-current={active ? "page" : undefined}
            className={`rounded-xl px-2 py-2 text-center text-sm font-semibold ${
              active
                ? "bg-navy-900 text-white"
                : "border border-navy-900/10 bg-white text-navy-700/70"
            }`}
          >
            <span className="block text-[10px] font-medium uppercase tracking-wide opacity-70">
              {m.label}
            </span>
            {monthLabel(m.ym)}
          </Link>
        );
      })}
    </div>
  );
}

export function FinanceDashboard({ data }: { data: Data }) {
  const { finance: f, students: s, operation: o } = data;
  return (
    <div className="space-y-5">
      <Group title="Financeiro">
        <Stat label="Receita recebida" value={centsToBRL(f.receivedCents)} hint="faturas pagas no mês" />
        <Stat label="A receber" value={centsToBRL(f.receivableCents)} hint="pendentes em aberto" />
        <Stat
          label="Em atraso"
          value={centsToBRL(f.overdueCents)}
          hint={`${f.overdueStudents} ${f.overdueStudents === 1 ? "aluno" : "alunos"} • vencidas e suspensas`}
        />
        <Stat label="Inadimplência" value={pct(f.defaultRate)} hint="das faturas do mês" />
        <Stat label="Despesas do mês" value={centsToBRL(f.expensesCents)} />
        <Stat
          label="Lucro líquido"
          value={centsToBRL(f.netCents)}
          hint="recebido − despesas"
          tone={f.netCents < 0 ? "bad" : "default"}
        />
      </Group>

      <Group title="Alunos">
        <Stat label="Ativos" value={String(s.active)} />
        <Stat label="Novos no mês" value={String(s.newInMonth)} />
        <Stat label="Frequência" value={pct(s.attendanceRate)} hint="presença nos dias agendados" />
      </Group>
      <div className="rounded-2xl border border-navy-900/5 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium text-navy-700/60">Top 5 escolas (alunos ativos)</p>
        {s.topSchools.length ? (
          <ol className="mt-2 space-y-1.5">
            {s.topSchools.map((t, i) => (
              <li key={t.address} className="flex items-start gap-2 text-sm">
                <span className="w-4 shrink-0 font-semibold text-navy-700/50">{i + 1}</span>
                <span className="min-w-0 flex-1 text-navy-900">{t.address}</span>
                <span className="shrink-0 font-semibold text-navy-900">{t.count}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-navy-700/50">{NO_DATA}</p>
        )}
      </div>

      <Group title="Operação">
        <Stat
          label="Atraso de rota"
          value={pct(o.lateRate)}
          hint={
            o.eligible
              ? `${o.lateCount} de ${o.eligible} idas após o horário-alvo`
              : "rotas sem horário-alvo ou sem ida no mês"
          }
        />
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-700/50">
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "bad";
}) {
  const noData = value === NO_DATA;
  return (
    <div className="rounded-2xl border border-navy-900/5 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-navy-700/60">{label}</p>
      <p
        className={`mt-1 font-bold ${
          noData
            ? "text-sm text-navy-700/40"
            : tone === "bad"
              ? "text-lg text-red-700"
              : "text-lg text-navy-900"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] leading-tight text-navy-700/50">{hint}</p>}
    </div>
  );
}
