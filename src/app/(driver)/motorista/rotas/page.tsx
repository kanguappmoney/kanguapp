import Link from "next/link";
import { Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppHeader, Card, SectionTitle, Placeholder } from "@/components/ui";
import { startOrReview } from "@/lib/actions/routes";

const DIRECTION_LABEL: Record<string, string> = {
  outbound: "Ida",
  inbound: "Volta",
  both: "Ida e volta",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Chave da execução de uma perna. Legado (uma perna) usa 'single'.
function execKey(routeId: string, leg: string | null) {
  return `${routeId}:${leg ?? "single"}`;
}

export default async function RotasPage() {
  const supabase = await createClient();

  const { data: routes } = await supabase
    .from("routes")
    .select("id, name, direction, route_stops(kind)")
    .order("created_at", { ascending: false });

  // Execuções de hoje (pra mostrar "em andamento"/"concluída") — agora por perna.
  const routeIds = routes?.map((r) => r.id) ?? [];
  const { data: execs } = routeIds.length
    ? await supabase
        .from("route_executions")
        .select("id, route_id, leg, status")
        .eq("service_date", today())
        .in("route_id", routeIds)
    : { data: [] };
  const execByLeg = new Map(
    execs?.map((e) => [execKey(e.route_id, e.leg), e]),
  );

  return (
    <>
      <AppHeader title="Rotas" subtitle="Suas rotas e o dia de hoje" />
      <div className="px-4 pb-6">
        <div className="mt-4">
          <Link
            href="/motorista/rotas/nova"
            className="block w-full rounded-xl bg-yellow-400 py-3 text-center font-semibold text-navy-900"
          >
            ➕ Nova rota
          </Link>
        </div>

        <SectionTitle>Minhas rotas</SectionTitle>
        {!routes?.length ? (
          <Placeholder>
            Nenhuma rota ainda. Crie uma e escolha os alunos e a ordem das
            paradas.
          </Placeholder>
        ) : (
          <div className="space-y-2">
            {routes.map((r) => {
              const kinds = (r.route_stops ?? []).map(
                (s: { kind: string }) => s.kind,
              );
              const total = kinds.length;
              const pickupCount = kinds.filter((k) => k === "pickup").length;
              const dropoffCount = kinds.filter((k) => k === "dropoff").length;

              // Rota 'both' com alguma perna em andamento hoje: editar está
              // travado (G2 no banco). Some com o botão — conveniência por cima
              // da lei, não no lugar dela.
              const running =
                execByLeg.get(execKey(r.id, "pickup"))?.status ===
                  "in_progress" ||
                execByLeg.get(execKey(r.id, "dropoff"))?.status ===
                  "in_progress";

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
                    {r.direction === "both" && !running && (
                      <Link
                        href={`/motorista/rotas/${r.id}/editar`}
                        className="flex shrink-0 items-center gap-1 rounded-lg border border-navy-900/10 px-2.5 py-1.5 text-xs font-medium text-navy-700/70"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </Link>
                    )}
                  </div>

                  {r.direction === "both" ? (
                    // Rota encorpada: duas pernas, cada uma sua execução no dia.
                    // Dois botões explícitos — o motorista roda a perna que ele
                    // escolheu (G2: o app não adivinha pela hora).
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
        )}
      </div>
    </>
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
