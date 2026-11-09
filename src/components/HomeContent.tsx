import Link from "next/link";
import {
  CalendarCheck,
  MapPin,
  Play,
  ChevronRight,
  Truck,
  ListChecks,
  Route,
} from "lucide-react";
import { Section } from "@/components/ui";
import { StatusPill, StepDot } from "@/components/patterns";
import { RouteRunList } from "@/components/RouteRunList";
import { DriverHeaderActions } from "@/components/DriverHeaderActions";
import type { RouteWithStops, TodayExec } from "@/lib/routes-today";
import type { ActiveBoard, BoardStop } from "@/lib/drive-board";
import type { DepartureSuggestion } from "@/lib/departure";

// Parte visual da home do motorista, com props puras (sem I/O). A page faz as
// leituras e passa aqui — separar dado de apresentação deixa o layout testável e
// previsualizável sem auth. Dois estados: bloco vivo (perna rodando) ou lista de
// rotas pra iniciar.
export interface HomeContentProps {
  firstName: string;
  avatarUrl: string | null;
  unread: number;
  vehicleLabel: string | null;
  greeting: string;
  alunos: number;
  ausencias: number;
  paradas: number;
  board: ActiveBoard | null;
  mapUrl: string | null;
  idleMapUrl: string | null;
  routes: RouteWithStops[];
  execByLeg: Map<string, TodayExec>;
  departureByRoute: Map<string, DepartureSuggestion>;
  routesEmptyText: string;
}

export function HomeContent({
  firstName,
  avatarUrl,
  unread,
  vehicleLabel,
  greeting,
  alunos,
  ausencias,
  paradas,
  board,
  mapUrl,
  idleMapUrl,
  routes,
  execByLeg,
  departureByRoute,
  routesEmptyText,
}: HomeContentProps) {
  return (
    <>
      {/* Cabeçalho fixo: saudação + avatar (→ Configurações) + sininho. */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-navy-900/10 bg-white px-5 pb-5 pt-6">
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
        <DriverHeaderActions
          firstName={firstName}
          avatarUrl={avatarUrl}
          unread={unread}
        />
      </header>

      <div className="px-4 pb-6">
        {/* Chip do veículo (placa real do perfil). Só identifica — sem "online". */}
        {vehicleLabel && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-navy-900/10 bg-white px-3 py-1.5 text-sm font-medium text-navy-800">
            <Truck className="h-4 w-4 text-navy-700/60" />
            {vehicleLabel}
          </div>
        )}

        {/* Resumo de hoje — creme. Alunos e paradas viram atalho; ausências (sem tela própria) é informativo. */}
        <Section tone="cream" icon={CalendarCheck} title="Resumo de hoje" className="mt-4">
          <div className="grid grid-cols-3 divide-x divide-yellow-400/40 text-center">
            <Counter value={alunos} label="alunos" href="/motorista/alunos" />
            <Counter value={ausencias} label="ausências" />
            <Counter value={paradas} label="paradas" href="/motorista/rotas" />
          </div>
        </Section>

        {/* Mapa sempre visível: bloco vivo (traçado da perna rodando) OU mapa
            idle centrado no endereço do motorista quando nada roda (G4-safe). */}
        {board ? (
          <RunningBlock
            board={board}
            mapUrl={mapUrl}
            vehicleLabel={vehicleLabel}
            avatarUrl={avatarUrl}
            firstName={firstName}
          />
        ) : (
          <IdleMap mapUrl={idleMapUrl} />
        )}

        {/* Rotas de hoje SEMPRE abaixo do mapa — concluídas e próximas. Ocioso: é o foco da tela (azul-marinho);
            com rota rodando o foco é a parada atual, então aqui fica em branco. */}
        <Section tone={board ? "white" : "navy"} icon={Route} title="Rota de hoje" className="mt-4">
          <RouteRunList
            routes={routes}
            execByLeg={execByLeg}
            departureByRoute={departureByRoute}
            emptyText={routesEmptyText}
          />
        </Section>

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

// --- Home ociosa: mapa estático da região do motorista (endereço geocodificado,
// SEM GPS — G4 não permite rastreio fora de in_progress) + aviso. ----------------
function IdleMap({ mapUrl }: { mapUrl: string | null }) {
  return (
    <Section icon={MapPin} title="Sua região" className="mt-4 overflow-hidden">
      <div className="-mx-4 -mb-4 overflow-hidden rounded-b-2xl">
        {mapUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mapUrl} alt="Sua região" className="h-44 w-full object-cover" />
        ) : (
          <div className="flex h-28 items-center justify-center bg-navy-900/[0.03] text-sm text-navy-700/40">
            Mapa indisponível
          </div>
        )}
        <p className="bg-navy-900/[0.03] px-4 py-3 text-center text-sm text-navy-700/60">
          Nenhuma rota em andamento agora
        </p>
      </div>
    </Section>
  );
}

// --- Perna em andamento: próxima parada + embarque real. -----------------------
function RunningBlock({
  board,
  mapUrl,
  vehicleLabel,
  avatarUrl,
  firstName,
}: {
  board: ActiveBoard;
  mapUrl: string | null;
  vehicleLabel: string | null;
  avatarUrl: string | null;
  firstName: string;
}) {
  const pct = board.total
    ? Math.round((board.boardedCount / board.total) * 100)
    : 0;
  const label = board.kind === "pickup" ? "embarcaram" : "desembarcaram";

  return (
    <>
      {/* Faixa do motorista: foto + placa/modelo da van (dado já existente). */}
      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-navy-900/10 bg-white p-3">
        <Avatar url={avatarUrl} name={firstName} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-navy-900">{firstName}</p>
          {vehicleLabel && (
            <p className="flex items-center gap-1 truncate text-sm text-navy-700/60">
              <Truck className="h-3.5 w-3.5 shrink-0" />
              {vehicleLabel}
            </p>
          )}
        </div>
      </div>

      {/* Próxima parada (dado vivo). Endereço é do próprio aluno do motorista. */}
      {board.nextStop && (
        <div className="mt-4 overflow-hidden rounded-2xl bg-navy-900 text-white">
          {/* Mini-mapa da rota (traçado + pinos). Some sem token/coordenada. */}
          {mapUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mapUrl}
              alt={`Rota até ${board.nextStop.name}`}
              className="h-52 w-full object-cover"
            />
          )}
          <div className="p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-yellow-400">
              Próxima parada
            </p>
            <div className="flex items-center gap-3">
              <Avatar url={board.nextStop.photoUrl} name={board.nextStop.name} dark />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold">
                  {board.nextStop.name}
                </p>
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
      <Section icon={ListChecks} title="Lista de embarque" className="mt-4">
        <p className="-mt-1 mb-2 text-xs text-navy-700/60">
          {board.boardedCount} de {board.total} {label}
        </p>
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
              <StepDot
                size="sm"
                state={
                  s.state === "pending"
                    ? s.studentId === board.nextStop?.studentId
                      ? "current"
                      : "future"
                    : "done"
                }
              >
                {s.position}
              </StepDot>
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
      </Section>
    </>
  );
}

function Counter({ value, label, href }: { value: number; label: string; href?: string }) {
  const inner = (
    <div className="px-2 py-1">
      <p className="text-2xl font-bold leading-none text-navy-900">{value}</p>
      <p className="mt-1 text-xs text-navy-700/70">{label}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-lg transition hover:bg-yellow-400/20">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function StatusChip({ stop, isNext }: { stop: BoardStop; isNext: boolean }) {
  if (stop.state === "boarded") return <StatusPill tone="done">Embarcou</StatusPill>;
  if (stop.state === "absent") return <StatusPill tone="neutral">Ausente</StatusPill>;
  if (isNext) return <StatusPill tone="pending">Próxima</StatusPill>;
  return <StatusPill tone="neutral">Aguardando</StatusPill>;
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
