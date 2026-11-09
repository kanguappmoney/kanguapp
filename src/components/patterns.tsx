import type { ComponentType } from "react";

// Três padrões pequenos e consistentes para DIFERENCIAR itens dentro de listas/cards (somam-se ao sistema de 3
// camadas de fundo: branco / creme / azul-marinho). Cores semânticas de erro/aviso seguem como estavam.
//
// 1. StatusPill — pílula de status: verde = concluído/pago/em andamento/ativo; amarelo-claro = pendente/recomendado;
//    cinza = agendado/neutro. `overdue` (vencida) e `danger` (bloqueada/suspensa) são os tons semânticos já existentes.
// 2. IconBadge — ícone amarelo dentro de círculo azul-marinho sólido (itens de navegação/configuração/lista).
// 3. StepDot — marcador de etapa: azul-marinho = concluída, amarelo = atual, cinza = futura. Sobre fundo azul-marinho
//    (`onDark`): concluída = círculo branco, atual = amarelo, futura = branco translúcido.

export type PillTone = "done" | "pending" | "neutral" | "overdue" | "danger";

const PILL: Record<PillTone, string> = {
  done: "bg-green-100 text-green-800",
  pending: "bg-yellow-400/25 text-navy-900",
  neutral: "bg-navy-900/5 text-navy-700/70",
  // Vencida: continua âmbar (aviso), com borda mais forte para não se confundir com o pendente amarelo-claro.
  overdue: "bg-amber-100 text-amber-800 border border-amber-500",
  danger: "bg-red-100 text-red-800",
};

export function StatusPill({
  tone,
  children,
  className = "",
  onDark = false,
}: {
  tone: PillTone;
  children: React.ReactNode;
  className?: string;
  onDark?: boolean; // sobre azul-marinho: neutro = branco translúcido, pendente = amarelo cheio
}) {
  const cls =
    onDark && tone === "neutral"
      ? "bg-white/15 text-white/85"
      : onDark && tone === "pending"
        ? "bg-yellow-400 text-navy-900"
        : PILL[tone];
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls} ${className}`}
    >
      {children}
    </span>
  );
}

export function IconBadge({
  icon: Icon,
  size = "md",
  className = "",
  onDark = false,
}: {
  icon: ComponentType<{ className?: string }>;
  size?: "sm" | "md";
  className?: string;
  onDark?: boolean; // sobre azul-marinho: círculo amarelo com ícone azul-marinho
}) {
  const box = size === "sm" ? "h-9 w-9" : "h-10 w-10";
  const ico = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <span className={`flex ${box} shrink-0 items-center justify-center rounded-full ${onDark ? "bg-yellow-400 text-navy-900" : "bg-navy-900 text-yellow-400"} ${className}`}>
      <Icon className={ico} />
    </span>
  );
}

export type StepState = "done" | "current" | "future";

const DOT_LIGHT: Record<StepState, string> = {
  done: "bg-navy-900 text-white",
  current: "bg-yellow-400 text-navy-900",
  future: "bg-navy-900/10 text-navy-700/50",
};
const DOT_DARK: Record<StepState, string> = {
  done: "bg-white text-navy-900",
  current: "bg-yellow-400 text-navy-900",
  future: "bg-white/20 text-white/70",
};

export function StepDot({
  state,
  children,
  onDark = false,
  size = "md",
}: {
  state: StepState;
  children: React.ReactNode;
  onDark?: boolean;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "h-6 w-6 text-xs" : "h-8 w-8 text-sm";
  return (
    <span
      className={`flex ${box} shrink-0 items-center justify-center rounded-full font-bold ${
        onDark ? DOT_DARK[state] : DOT_LIGHT[state]
      }`}
    >
      {children}
    </span>
  );
}
