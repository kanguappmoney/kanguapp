// Gráficos do painel Financeiro (R11) em SVG puro — sem lib de gráfico (o
// projeto não tinha nenhuma; 4 formas simples não justificam dependência).
// Renderizam no servidor; o hover é o <title> nativo de cada marca. Só
// apresentação: recebem os números já calculados em lib/finance-dashboard.
//
// Cores: identidade (categorias de despesa) usa os 3 primeiros slots da paleta
// categórica validada (azul, laranja, água — passam CVD/normal em todos os
// pares no branco); magnitude única (barras, ranking, aros) usa o marinho da
// marca sobre trilho cinza. Texto nunca na cor da série.

export const CATEGORY_COLORS = {
  combustivel: "#2a78d6",
  manutencao: "#eb6834",
  outros: "#1baf7a",
} as const;

const INK = "#0d1b3d"; // marinho da marca (marca de magnitude)
const TRACK = "#e5e8ee"; // trilho/linha de base, recessivo

// ---------------------------------------------------------------------------
// 1) Donut — fatias por categoria. Total 0 → aro cinza vazio (nada inventado).
// ---------------------------------------------------------------------------
export function Donut({
  slices,
  size = 132,
  label,
}: {
  slices: { key: string; label: string; value: number; color: string; display: string }[];
  size?: number;
  label: string; // aria-label (resumo textual)
}) {
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((a, s) => a + s.value, 0);
  const visible = slices.filter((s) => s.value > 0);
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TRACK} strokeWidth={stroke} />
      {total > 0 &&
        visible.map((s) => {
          const len = (s.value / total) * c;
          // Espaçador de 2px entre fatias (só quando há mais de uma).
          const gap = visible.length > 1 ? 2 : 0;
          const el = (
            <circle
              key={s.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${Math.max(len - gap, 0)} ${c}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            >
              <title>{`${s.label}: ${s.display}`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 2) Barras lado a lado — recebido × despesas × lucro do mês (um eixo, R$).
//    Lucro negativo desce abaixo da linha de base.
// ---------------------------------------------------------------------------
export function MoneyBars({
  bars,
  label,
}: {
  bars: { key: string; label: string; cents: number; display: string }[];
  label: string;
}) {
  const W = 300;
  const H = 150;
  const max = Math.max(...bars.map((b) => b.cents), 0);
  const min = Math.min(...bars.map((b) => b.cents), 0);
  const top = 18; // espaço do rótulo de valor (barras positivas)
  // Espaço do nome + (se houver negativa) do rótulo de valor abaixo da barra.
  const bottom = 22 + (min < 0 ? 16 : 0);
  const plot = H - top - bottom;
  const span = max - min || 1;
  // Tudo zero → base embaixo (sem barras), não uma linha solta no topo.
  const zeroY = max === 0 && min === 0 ? top + plot : top + (max / span) * plot;
  const slot = W / bars.length;
  const barW = 44;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
      <line x1={0} x2={W} y1={zeroY} y2={zeroY} stroke={TRACK} strokeWidth={1} />
      {bars.map((b, i) => {
        const h = (Math.abs(b.cents) / span) * plot;
        const x = i * slot + (slot - barW) / 2;
        const y = b.cents >= 0 ? zeroY - h : zeroY;
        const valueY = b.cents >= 0 ? y - 5 : y + h + 12;
        return (
          <g key={b.key}>
            {h > 0 && (
              <path d={roundedBar(x, y, barW, h, b.cents >= 0)} fill={INK}>
                <title>{`${b.label}: ${b.display}`}</title>
              </path>
            )}
            <text x={x + barW / 2} y={valueY} textAnchor="middle" fontSize={11} fontWeight={600} fill={INK}>
              {b.display}
            </text>
            <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="#5b6478">
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Barra com 4px arredondados só na ponta de dado (base reta, presa à linha de 0).
function roundedBar(x: number, y: number, w: number, h: number, up: boolean) {
  const r = Math.min(4, h, w / 2);
  if (up)
    return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
  return `M${x},${y} V${y + h - r} Q${x},${y + h} ${x + r},${y + h} H${x + w - r} Q${x + w},${y + h} ${x + w},${y + h - r} V${y} Z`;
}

// ---------------------------------------------------------------------------
// 3) Barra horizontal — ranking (top 5). HTML: o nome da escola quebra linha.
// ---------------------------------------------------------------------------
export function RankBars({ items }: { items: { label: string; count: number }[] }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ol className="space-y-2.5">
      {items.map((it, i) => (
        <li key={it.label} title={`${it.label}: ${it.count}`}>
          <div className="flex items-start gap-2 text-sm">
            <span className="w-4 shrink-0 font-semibold text-navy-700/50">{i + 1}</span>
            <span className="min-w-0 flex-1 text-navy-900">{it.label}</span>
            <span className="shrink-0 font-semibold text-navy-900">{it.count}</span>
          </div>
          <div className="ml-6 mt-1 h-2 rounded-full" style={{ background: TRACK }}>
            <div
              className="h-2 rounded-full"
              style={{ width: `${(it.count / max) * 100}%`, background: INK }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// 4) Aro/gauge — % preenchido. `null` (sem dado suficiente) → só o trilho cinza.
// ---------------------------------------------------------------------------
export function Gauge({ value, size = 40, label }: { value: number | null; size?: number; label: string }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.min(Math.max(value, 0), 1);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={value == null ? `${label}: sem dado suficiente` : `${label}: ${Math.round(v * 100)}%`}
      className="shrink-0"
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TRACK} strokeWidth={stroke} />
      {value != null && v > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={INK}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${v * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
      <title>{value == null ? `${label}: sem dado suficiente` : `${label}: ${Math.round(v * 100)}%`}</title>
    </svg>
  );
}
