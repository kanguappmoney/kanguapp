import { SignOutButton } from "@/components/SignOutButton";
import { Logo } from "@/components/Logo";

// `actions` = canto direito (ex.: avatar + sininho do motorista). Com ações, o
// cabeçalho fica fixo no topo (sticky) ao rolar.
export function AppHeader({
  title,
  subtitle,
  showSignOut,
  actions,
}: {
  title: string;
  subtitle?: string;
  showSignOut?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <header
      className={`flex items-start justify-between border-b border-navy-900/10 bg-white px-5 pb-5 pt-6 text-navy-900 ${
        actions ? "sticky top-0 z-20 items-center" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <Logo variant="icon" className="h-9 w-9 shrink-0" />
        <div>
          <h1 className="text-xl font-bold text-navy-900">{title}</h1>
          {subtitle && <p className="text-sm text-navy-700/50">{subtitle}</p>}
        </div>
      </div>
      {showSignOut && <SignOutButton />}
      {actions}
    </header>
  );
}

// Hierarquia de fundo (3 camadas): white = padrão · cream = destaque secundário (perfil, avisos
// informativos) · navy = destaque primário (a informação/ação mais importante da tela; texto branco/amarelo).
const TONE = {
  white: "border border-navy-900/5 bg-white shadow-sm",
  cream: "border border-yellow-400/40 bg-cream",
  navy: "bg-navy-900 text-white",
} as const;

export function Card({
  children,
  className = "",
  tone = "white",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: keyof typeof TONE;
}) {
  return (
    <div className={`rounded-2xl p-4 ${TONE[tone]} ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-navy-700/50">
      {children}
    </h2>
  );
}

export function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <Card className="border-dashed text-center text-sm text-navy-700/60">
      {children}
    </Card>
  );
}
