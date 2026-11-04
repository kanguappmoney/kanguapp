import { Logo } from "@/components/Logo";
// Linha do tempo do responsável (modo G6 'timeline'). Sem mapa, sem GPS.
// Alimentada só pelos agregados de get_active_journey (route_events confirmados).

export interface JourneyChild {
  name: string;
  position: number;
  state: "waiting" | "boarded" | "absent";
}

export interface Journey {
  execution_id: string;
  route_name: string;
  direction: "outbound" | "inbound";
  total_stops: number;
  confirmed_count: number;
  ended: boolean;
  children: JourneyChild[];
}

function statusLabel(j: Journey, child: JourneyChild): string {
  if (j.ended) return "Rota concluída.";
  if (child.state === "absent")
    return `${firstName(child.name)} está marcado(a) como ausente hoje.`;
  if (child.state === "boarded")
    return j.direction === "outbound"
      ? `${firstName(child.name)} embarcou. A caminho da escola.`
      : `${firstName(child.name)} foi deixado(a) em casa.`;
  return `A caminho da parada de ${firstName(child.name)} (parada ${child.position} de ${j.total_stops}).`;
}

function firstName(n: string) {
  return n.split(" ")[0];
}

function childMilestone(j: Journey, child: JourneyChild) {
  const boardWord = j.direction === "outbound" ? "Embarque" : "Desembarque";
  return `${boardWord} de ${firstName(child.name)}`;
}

export function JourneyTimeline({ journey }: { journey: Journey }) {
  const primary = journey.children[0];
  const pct = journey.total_stops
    ? Math.round((journey.confirmed_count / journey.total_stops) * 100)
    : 0;
  // Posição do canguru: no degrau confirmado (barra por degraus). Fica parado
  // entre confirmações — não desliza (não há GPS).
  const stepPct = journey.ended ? 100 : pct;

  return (
    <div className="rounded-2xl bg-navy-900 p-4 text-white">
      <p className="text-xs font-semibold uppercase tracking-wide text-yellow-400">
        {journey.route_name}
      </p>

      {/* Rótulo de estado vivo (prioridade alta) */}
      <p className="mt-1 text-lg font-semibold text-white">
        {primary ? statusLabel(journey, primary) : "Rota em andamento"}
      </p>

      {/* Barra por degraus + canguru estático no degrau atual */}
      <div className="relative mt-5 mb-2">
        <div className="h-2 rounded-full bg-white/15">
          <div
            className="h-2 rounded-full bg-yellow-400 transition-all duration-500"
            style={{ width: `${stepPct}%` }}
          />
        </div>
        {/* Canguru da marca (lucide não tem canguru; é o mesmo asset do Logo). */}
        <div
          className="absolute -top-3 -translate-x-1/2 transition-all duration-500"
          style={{ left: `${stepPct}%` }}
          aria-hidden
        >
          <Logo variant="icon" alt="" className="h-7 w-7" />
        </div>
      </div>
      <p className="text-xs text-white/60">
        {journey.confirmed_count} de {journey.total_stops} paradas confirmadas
      </p>

      {/* Marcos do próprio filho (nunca de outras crianças — G5) */}
      <ul className="mt-4 space-y-2">
        <Milestone done label="Rota iniciada" />
        {journey.children.map((c) => (
          <Milestone
            key={c.name + c.position}
            done={c.state === "boarded"}
            warn={c.state === "absent"}
            label={
              c.state === "absent"
                ? `${firstName(c.name)} — ausente hoje`
                : childMilestone(journey, c)
            }
          />
        ))}
        <Milestone done={journey.ended} label="Rota concluída" />
      </ul>
    </div>
  );
}

function Milestone({
  done,
  warn,
  label,
}: {
  done?: boolean;
  warn?: boolean;
  label: string;
}) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
          warn
            ? "bg-amber-100 text-amber-700"
            : done
              ? "bg-green-100 text-green-700"
              : "bg-white/10 text-white/50"
        }`}
      >
        {warn ? "!" : done ? "✓" : "•"}
      </span>
      <span className={done || warn ? "text-white" : "text-white/50"}>
        {label}
      </span>
    </li>
  );
}
