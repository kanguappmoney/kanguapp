import Link from "next/link";
import {
  Bell,
  Users,
  CalendarCheck,
  MapPin,
  Play,
  ChevronRight,
  Truck,
} from "lucide-react";
import { Card } from "@/components/ui";
import { RouteRunList } from "@/components/RouteRunList";
import type { RouteWithStops, TodayExec } from "@/lib/routes-today";
import type { ActiveBoard, BoardStop } from "@/lib/drive-board";

// Parte visual da home do motorista, com props puras (sem I/O). A page faz as
// leituras e passa aqui — separar dado de apresentação deixa o layout testável e
// previsualizável sem auth. Dois estados: bloco vivo (perna rodando) ou lista de
// rotas pra iniciar.
export interface HomeContentProps {
  firstName: string;
  avatarUrl: string | null;
  vehicleLabel: string | null;
  greeting: string;
  alunos: number;
  ausencias: number;
  paradas: number;
  board: ActiveBoard | null;
  routes: RouteWithStops[];
  execByLeg: Map<string, TodayExec>;
}

export function HomeContent({
  firstName,
  avatarUrl,
  vehicleLabel,
  greeting,
  alunos,
  ausencias,
  paradas,
  board,
  routes,
  execByLeg,
}: HomeContentProps) {
  return (
    <>
      {/* Cabeçalho: saudação + avatar (→ perfil, onde vive o sair) + sino. */}
      <header className="flex items-center justify-between border-b border-navy-900/10 bg-white px-5 pb-5 pt-6">
        <div>
          <h1 className="font-display text-xl font-semibold text-navy-900">
            {greeting}, {firstName}
          </h1>
          {board ? (
            // Perna em andamento explícita: a manhã (embarque) é operação
            // diferente da tarde (desembarque). O selo torna isso legível de
            // relance — o dado vem do leg da execução.
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded-full bg-yellow-400 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-navy-900">
                {board.kind === "pickup" ? "Ida" : "Volta"}
              </span>
              <span className="text-sm text-navy-700/50">em andamento</span>
            </div>
          ) : (
            <p className="text-sm text-navy-700/50">Sua operação de hoje</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/motorista/perfil"
            aria-label="Seu perfil"
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
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-navy-900/10 text-navy-700/60">
            <Bell className="h-5 w-5" />
          </span>
        </div>
      </header>

      <div className="px-4 pb-6">
        {/* Chip do veículo (placa real do perfil). Só identifica — sem "online". */}
        {vehicleLabel && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-navy-900/10 bg-white px-3 py-1.5 text-sm font-medium text-navy-800">
            <Truck className="h-4 w-4 text-navy-700/60" />
            {vehicleLabel}
          </div>
        )}

        {/* Contadores reais. */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Counter icon={Users} value={alunos} label="alunos" highlight />
          <Counter icon={CalendarCheck} value={ausencias} label="ausências" />
          <Counter icon={MapPin} value={paradas} label="paradas" />
        </div>

        {board ? (
          <RunningBlock board={board} />
        ) : (
          <>
            <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-navy-700/50">
              Rota de hoje
            </h2>
            <RouteRunList
              routes={routes}
              execByLeg={execByLeg}
              emptyText="Nenhuma rota ainda. Monte a primeira na aba Rotas."
            />
          </>
        )}

        {/* Ponte home ↔ /rotas: gestão vive lá (criar/editar). */}
        <Link
          href="/motorista/rotas"
          className="mt-4 flex items-center justify-center gap-1 text-sm font-medium text-navy-700/60"
        >
          Ver todas as rotas / gerenciar
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </>
  );
}

// --- Perna em andamento: próxima parada + embarque real. -----------------------
function RunningBlock({ board }: { board: ActiveBoard }) {
  const pct = board.total
    ? Math.round((board.boardedCount / board.total) * 100)
    : 0;
  const label = board.kind === "pickup" ? "embarcaram" : "desembarcaram";

  return (
    <>
      {/* Próxima parada (dado vivo). Endereço é do próprio aluno do motorista. */}
      {board.nextStop && (
        <div className="mt-6 rounded-2xl bg-navy-900 p-4 text-white">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-yellow-400">
            Próxima parada
          </p>
          <div className="flex items-center gap-3">
            <Avatar url={board.nextStop.photoUrl} name={board.nextStop.name} dark />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{board.nextStop.name}</p>
              {board.nextStop.address && (
                <p className="truncate text-sm text-white/60">
                  {board.nextStop.address}
                </p>
              )}
            </div>
            <Link
              href={`/motorista/alunos/${board.nextStop.studentId}`}
              className="shrink-0 rounded-xl bg-yellow-400 px-3 py-2 text-xs font-semibold text-navy-900"
            >
              Ver detalhes
            </Link>
          </div>
        </div>
      )}

      {/* Botão hero: continuar a rota que já roda (→ Modo Direção). */}
      <Link
        href={`/motorista/rota/${board.executionId}`}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-yellow-400 py-4 font-display text-lg font-semibold text-navy-900"
      >
        <Play className="h-5 w-5 fill-navy-900" />
        Continuar {board.kind === "pickup" ? "ida" : "volta"}
      </Link>

      {/* Lista de embarque (dado vivo). */}
      <Card className="mt-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-semibold text-navy-900">Lista de embarque</span>
          <span className="text-xs text-navy-700/50">
            {board.boardedCount} de {board.total} {label}
          </span>
        </div>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-navy-900/10">
          <div
            className="h-full rounded-full bg-yellow-400"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="space-y-1">
          {board.stops.slice(0, 5).map((s) => (
            <Link
              key={s.studentId}
              href={`/motorista/alunos/${s.studentId}`}
              className="flex items-center gap-3 rounded-xl px-1 py-2"
            >
              <Avatar url={s.photoUrl} name={s.name} />
              <span className="flex-1 truncate text-sm font-medium text-navy-900">
                {s.name}
              </span>
              <StatusChip
                stop={s}
                isNext={s.studentId === board.nextStop?.studentId}
              />
              <ChevronRight className="h-4 w-4 text-navy-700/30" />
            </Link>
          ))}
        </div>

        <Link
          href={`/motorista/rota/${board.executionId}`}
          className="mt-2 flex items-center justify-center gap-1 border-t border-navy-900/5 pt-3 text-sm font-medium text-navy-700/60"
        >
          Ver todos os alunos
          <ChevronRight className="h-4 w-4" />
        </Link>
      </Card>
    </>
  );
}

function Counter({
  icon: Icon,
  value,
  label,
  highlight,
}: {
  icon: typeof Users;
  value: number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "bg-yellow-400/15" : ""}>
      <Icon className="mb-1 h-5 w-5 text-navy-700/50" />
      <p className="text-2xl font-bold leading-none text-navy-900">{value}</p>
      <p className="mt-1 text-xs text-navy-700/60">{label}</p>
    </Card>
  );
}

function StatusChip({ stop, isNext }: { stop: BoardStop; isNext: boolean }) {
  if (stop.state === "boarded")
    return <Chip cls="bg-green-100 text-green-800">Embarcou</Chip>;
  if (stop.state === "absent")
    return <Chip cls="bg-navy-900/10 text-navy-700/60">Ausente</Chip>;
  if (isNext) return <Chip cls="bg-yellow-400 text-navy-900">Próxima</Chip>;
  return <Chip cls="bg-navy-900/5 text-navy-700/50">Aguardando</Chip>;
}

function Chip({ children, cls }: { children: React.ReactNode; cls: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
      {children}
    </span>
  );
}

function Avatar({
  url,
  name,
  dark,
}: {
  url: string | null;
  name: string;
  dark?: boolean;
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className="h-10 w-10 shrink-0 rounded-full object-cover"
      />
    );
  }
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
        dark ? "bg-white/15 text-white" : "bg-navy-900/10 text-navy-700/70"
      }`}
    >
      {initials}
    </div>
  );
}
