import { SignOutButton } from "@/components/SignOutButton";
import { Logo } from "@/components/Logo";

export function AppHeader({
  title,
  subtitle,
  showSignOut,
}: {
  title: string;
  subtitle?: string;
  showSignOut?: boolean;
}) {
  return (
    <header className="flex items-start justify-between bg-navy-900 px-5 pb-5 pt-6 text-white">
      <div className="flex items-center gap-3">
        <Logo variant="icon" className="h-9 w-9 shrink-0" />
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-white/60">{subtitle}</p>}
        </div>
      </div>
      {showSignOut && (
        <div className="[&_button]:!text-yellow-400">
          <SignOutButton />
        </div>
      )}
    </header>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-navy-900/5 bg-white p-4 shadow-sm ${className}`}
    >
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
