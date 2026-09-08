import Link from "next/link";
import { Pencil, CalendarClock, Clock } from "lucide-react";
import { Card, Placeholder } from "@/components/ui";
import { startOrReview } from "@/lib/actions/routes";
import {
  execKey,
  type RouteWithStops,
  type TodayExec,
} from "@/lib/routes-today";
import type { DepartureSuggestion } from "@/lib/departure";

const DIRECTION_LABEL: Record<string, string> = {
  outbound: "Ida",
  inbound: "Volta",
  both: "Ida e volta",
};

// Lista de rotas com o controle de início por perna. Fonte única compartilhada
// pela home (operar) e pela /rotas (gerenciar). showEdit liga o botão Editar —
// desligado na home, que é só "começar o dia agora", sem gestão.
export function RouteRunList({
  routes,
  execByLeg,
  departureByRoute,
  showEdit = false,
  emptyText = "Nenhuma rota ainda.",
}: {
  routes: RouteWithStops[];
  execByLeg: Map<string, TodayExec>;
  departureByRoute?: Map<string, DepartureSuggestion>;
  showEdit?: boolean;
  emptyText?: string;
}) {
  if (!routes.length) return <Placeholder>{emptyText}</Placeholder>;

  return (
    <div className="space-y-2">
      {routes.map((r) => {
        const kinds = (r.route_stops ?? []).map((s) => s.kind);
        const total = kinds.length;
        const pickupCount = kinds.filter((k) => k === "pickup").length;
        const dropoffCount = kinds.filter((k) => k === "dropoff").length;

        // Rota 'both' com alguma perna em andamento hoje: editar está travado
        // (G2 no banco). Some com o botão — conveniência por cima da lei.
        const running =
          execByLeg.get(execKey(r.id, "pickup"))?.status === "in_progress" ||
          execByLeg.get(execKey(r.id, "dropoff"))?.status === "in_progress";

        return (
          <Card key={r.id} className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-navy-900">{r.name}</p>
                <p className="text-sm text-navy-700/60">
                  {DIRECTION_LABEL[r.direction]} • {total}{" "}
                  {total === 1 ? "parada" : "paradas"}
                </p>
              </div>
              {showEdit && (
                <div className="flex shrink-0 items-center gap-1.5">
                  {/* Exceções: calendário futuro, vale pra qualquer rota e mesmo
                      com perna rodando (G2 não se aplica a feriado/reposição). */}
                  <Link
                    href={`/motorista/rotas/${r.id}/excecoes`}
                    className="flex items-center gap-1 rounded-lg border border-navy-900/10 px-2.5 py-1.5 text-xs font-medium text-navy-700/70"
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    Exceções
                  </Link>
                  {/* Editar congela com perna in_progress (G2) e só rota 'both'. */}
                  {r.direction === "both" && !running && (
                    <Link
                      href={`/motorista/rotas/${r.id}/editar`}
                      className="flex items-center gap-1 rounded-lg border border-navy-900/10 px-2.5 py-1.5 text-xs font-medium text-navy-700/70"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Sugestão de horário de saída (só perna de ida não iniciada, quando
                a home passa o mapa). Informativo — nunca bloqueia iniciar. */}
            {departureByRoute?.get(r.id) && (
              <div className="flex items-center gap-2 rounded-xl bg-yellow-400/15 px-3 py-2 text-sm text-navy-800">
                <Clock className="h-4 w-4 shrink-0 text-navy-700/60" />
                <span>
                  Saia até as{" "}
                  <strong className="font-semibold">
                    {departureByRoute.get(r.id)!.leaveBy}
                  </strong>{" "}
                  para não atrasar {departureByRoute.get(r.id)!.studentName}
                </span>
              </div>
            )}

            {r.direction === "both" ? (
              // Rota encorpada: duas pernas, cada uma sua execução no dia. Dois
              // botões explícitos — o motorista roda a perna que escolheu (G2: o
              // app não adivinha pela hora).
              <div className="grid grid-cols-2 gap-2">
                <LegControl
                  routeId={r.id}
                  leg="pickup"
                  label="ida"
                  count={pickupCount}
                  exec={execByLeg.get(execKey(r.id, "pickup"))}
                />
                <LegControl
                  routeId={r.id}
                  leg="dropoff"
                  label="volta"
                  count={dropoffCount}
                  exec={execByLeg.get(execKey(r.id, "dropoff"))}
                />
              </div>
            ) : (
              // Rota antiga de uma perna — leg null ('single'). Inalterada.
              <LegControl
                routeId={r.id}
                count={total}
                exec={execByLeg.get(execKey(r.id, null))}
              />
            )}
          </Card>
        );
      })}
    </div>
  );
}

// Controle de uma perna: reflete o estado da execução daquela perna e oferece a
// ação certa (iniciar / continuar / concluída). Sem `leg` = rota de uma perna.
function LegControl({
  routeId,
  leg,
  label,
  count,
  exec,
}: {
  routeId: string;
  leg?: "pickup" | "dropoff";
  label?: string;
  count: number;
  exec?: { id: string; status: string };
}) {
  const running = exec?.status === "in_progress";
  const done = exec?.status === "completed";
  const legLabel = label ? label[0].toUpperCase() + label.slice(1) : null;

  // Numa perna vazia da 'both' (ex.: quem só vai não tem volta), não há o que
  // rodar — deixa claro em vez de oferecer um botão morto.
  if (leg && count === 0) {
    return (
      <div className="rounded-xl border border-dashed border-navy-900/15 py-2.5 text-center text-xs text-navy-700/40">
        {legLabel} • sem alunos
      </div>
    );
  }

  if (running) {
    return (
      <Link
        href={`/motorista/rota/${exec!.id}`}
        className="block rounded-xl bg-yellow-400 py-2.5 text-center text-sm font-semibold text-navy-900"
      >
        {legLabel ? `Continuar ${label}` : "Continuar rota"}
      </Link>
    );
  }

  if (done) {
    return (
      <div className="rounded-xl border border-navy-900/10 py-2.5 text-center text-xs text-navy-700/60">
        {legLabel ? `${legLabel} concluída` : "Concluída hoje"}
      </div>
    );
  }

  return (
    <form action={startOrReview.bind(null, routeId, leg)}>
      <button className="w-full rounded-xl bg-yellow-400 py-2.5 text-sm font-semibold text-navy-900">
        {legLabel ? `Iniciar ${label}` : "Iniciar rota"}
      </button>
    </form>
  );
}
