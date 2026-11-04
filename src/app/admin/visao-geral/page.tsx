import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Donut, MoneyBars, RankBars } from "@/components/charts";
import { ErrorNote, Panel, StatCard } from "@/components/admin/AdminUi";
import { getOverview } from "@/lib/admin";

type SP = Promise<Record<string, string | string[] | undefined>>;

// Cores das fatias (paleta categórica validada do charts.tsx: azul, água, laranja).
const COLORS = { trial: "#2a78d6", active: "#1baf7a", paused: "#eb6834" } as const;
const FUNNEL_COLORS = { approved: "#1baf7a", rejected: "#eb6834", pending: "#2a78d6" } as const;

// Landing do /admin: números do negócio, novos cadastros, funil do marketplace e
// assinaturas. Atualiza sozinho (polling a cada 45 s — AutoRefresh, sem websocket).
export default async function AdminVisaoGeralPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.dias) ? sp.dias[0] : sp.dias;
  const days: 7 | 30 = raw === "7" ? 7 : 30;

  const { data: o, error } = await getOverview(days);
  if (error || !o) {
    return (
      <>
        <h2 className="mb-4 font-display text-xl text-navy-900">Visão geral</h2>
        <ErrorNote message={error ?? "sem dados"} />
      </>
    );
  }

  const st = o.drivers_by_status;
  const f = o.funnel;
  const conv = f.searches > 0 ? Math.round((f.requests / f.searches) * 100) : null;
  const updatedAt = new Date().toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const bars = (key: "drivers" | "guardians" | "students") =>
    o.series.map((b, i) => ({
      key: `${key}-${i}`,
      label: b.label,
      cents: b[key], // o componente é genérico: o campo guarda a contagem
      display: String(b[key]),
    }));
  const total = (key: "drivers" | "guardians" | "students") =>
    o.series.reduce((a, b) => a + b[key], 0);

  return (
    <>
      <AutoRefresh seconds={45} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-display text-xl text-navy-900">Visão geral</h2>
        <p className="text-xs text-navy-700/60" data-testid="atualizado">
          Atualiza sozinha a cada 45 s · última leitura {updatedAt}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          testId="card-motoristas"
          label="Motoristas"
          value={o.drivers_total}
          detail={`Trial ${st.trial} · Ativa ${st.active} · Pausada ${st.paused}`}
        />
        <StatCard
          testId="card-perfil"
          label="Perfil completo"
          value={`${o.profile_complete} de ${o.drivers_total}`}
        />
        <StatCard
          testId="card-vitrine"
          label="Na vitrine"
          value={`${o.listed_visible} de ${o.drivers_total}`}
          detail="aparecendo de verdade em /buscar"
        />
        <StatCard
          testId="card-responsaveis"
          label="Responsáveis ativos"
          value={o.guardians_active}
          detail={`de ${o.guardians_total} cadastrados (≥1 aluno ativo)`}
        />
        <StatCard testId="card-alunos" label="Alunos ativos" value={o.students_active} />
      </div>

      <h3 className="mb-2 mt-8 font-display text-lg text-navy-900">Novos cadastros — últimos 30 dias</h3>
      <p className="mb-3 text-xs text-navy-700/60">Cada barra = 5 dias (data de início do intervalo).</p>
      <div className="grid gap-3 md:grid-cols-3">
        <Panel title={`Motoristas · ${total("drivers")}`}>
          <MoneyBars bars={bars("drivers")} label="Novos motoristas a cada 5 dias" />
        </Panel>
        <Panel title={`Responsáveis · ${total("guardians")}`}>
          <MoneyBars bars={bars("guardians")} label="Novos responsáveis a cada 5 dias" />
        </Panel>
        <Panel title={`Alunos · ${total("students")}`}>
          <MoneyBars bars={bars("students")} label="Novos alunos a cada 5 dias" />
        </Panel>
      </div>

      <div className="mb-2 mt-8 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg text-navy-900">Marketplace</h3>
        <div className="flex gap-2" role="group" aria-label="Período">
          {([7, 30] as const).map((d) => (
            <Link
              key={d}
              href={`/admin/visao-geral?dias=${d}`}
              prefetch={false}
              aria-current={d === days ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                d === days ? "bg-navy-900 text-white" : "bg-white text-navy-900 shadow-sm"
              }`}
            >
              {d} dias
            </Link>
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Panel
          title="Buscas → pedidos"
          hint={`Últimos ${days} dias. Pedidos = enviados pelo link genérico da vitrine.`}
        >
          <RankBars
            items={[
              { label: "Buscas em /buscar", count: f.searches },
              { label: "Pedidos de vaga enviados", count: f.requests },
            ]}
          />
          <p className="mt-3 text-sm text-navy-700/70" data-testid="conversao">
            {conv === null ? "Sem buscas no período." : `${conv}% das buscas viraram pedido.`}
          </p>
        </Panel>
        <Panel title="Pedidos por situação" hint={`Últimos ${days} dias.`}>
          <div className="flex items-center gap-5">
            <Donut
              label={`Pedidos: ${f.approved} aprovados, ${f.rejected} rejeitados, ${f.pending} pendentes`}
              slices={[
                { key: "approved", label: "Aprovados", value: f.approved, color: FUNNEL_COLORS.approved, display: String(f.approved) },
                { key: "rejected", label: "Rejeitados", value: f.rejected, color: FUNNEL_COLORS.rejected, display: String(f.rejected) },
                { key: "pending", label: "Pendentes", value: f.pending, color: FUNNEL_COLORS.pending, display: String(f.pending) },
              ]}
            />
            <Legend
              rows={[
                { color: FUNNEL_COLORS.approved, label: "Aprovados", value: f.approved },
                { color: FUNNEL_COLORS.rejected, label: "Rejeitados", value: f.rejected },
                { color: FUNNEL_COLORS.pending, label: "Pendentes", value: f.pending },
              ]}
            />
          </div>
        </Panel>
        <Panel title="Cidades mais buscadas" hint={`Top 5 · ${days} dias.`}>
          {o.top_cities.length ? (
            <RankBars items={o.top_cities.map((c) => ({ label: c.label, count: c.count }))} />
          ) : (
            <p className="text-sm text-navy-700/60">Nenhuma busca com cidade no período.</p>
          )}
        </Panel>
        <Panel title="Escolas mais buscadas" hint={`Top 5 · ${days} dias.`}>
          {o.top_schools.length ? (
            <RankBars items={o.top_schools.map((c) => ({ label: c.label, count: c.count }))} />
          ) : (
            <p className="text-sm text-navy-700/60">Nenhuma busca com escola no período.</p>
          )}
        </Panel>
      </div>

      <h3 className="mb-2 mt-8 font-display text-lg text-navy-900">Assinaturas</h3>
      <Panel title="Motoristas por situação da assinatura">
        <div className="flex items-center gap-5">
          <Donut
            label={`Assinaturas: ${st.trial} trial, ${st.active} ativas, ${st.paused} pausadas`}
            slices={[
              { key: "trial", label: "Trial", value: st.trial, color: COLORS.trial, display: String(st.trial) },
              { key: "active", label: "Ativa", value: st.active, color: COLORS.active, display: String(st.active) },
              { key: "paused", label: "Pausada", value: st.paused, color: COLORS.paused, display: String(st.paused) },
            ]}
          />
          <Legend
            rows={[
              { color: COLORS.trial, label: "Trial", value: st.trial },
              { color: COLORS.active, label: "Ativa", value: st.active },
              { color: COLORS.paused, label: "Pausada", value: st.paused },
            ]}
          />
        </div>
        <p className="mt-3 text-xs text-navy-700/60">
          A cobrança é feita fora do app no piloto — veja a lista em “Assinaturas”.
        </p>
      </Panel>
    </>
  );
}

function Legend({ rows }: { rows: { color: string; label: string; value: number }[] }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: r.color }} aria-hidden />
          <span className="text-navy-900">{r.label}</span>
          <span className="font-semibold text-navy-900">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}
