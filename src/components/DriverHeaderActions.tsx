import Link from "next/link";
import { Bell } from "lucide-react";
import { getDriverHeader } from "@/lib/driver-header";

// Canto direito do cabeçalho fixo do motorista: avatar (→ Configurações) +
// sininho (→ notificações, com contador de não-lidas). Visual puro — igual em
// todas as telas principais.
export function DriverHeaderActions({
  firstName,
  avatarUrl,
  unread,
}: {
  firstName: string;
  avatarUrl: string | null;
  unread: number;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Link
        href="/motorista/perfil"
        aria-label="Configurações"
        className="block h-11 w-11 overflow-hidden rounded-full"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={firstName}
            className="h-11 w-11 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-navy-900/10 text-sm font-semibold text-navy-700/70">
            {firstName[0]?.toUpperCase()}
          </span>
        )}
      </Link>
      <Link
        href="/motorista/notificacoes"
        aria-label={unread ? `Notificações (${unread} novas)` : "Notificações"}
        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-navy-900/10 text-navy-700/60"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-400 px-1 text-[10px] font-bold text-navy-900">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>
    </div>
  );
}

// Versão que carrega os próprios dados — para as telas com AppHeader.
export async function DriverActions() {
  const data = await getDriverHeader();
  return <DriverHeaderActions {...data} />;
}
