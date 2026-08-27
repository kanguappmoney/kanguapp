import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppHeader, Card, SectionTitle, Placeholder } from "@/components/ui";
import { startOrReview } from "@/lib/actions/routes";

const DIRECTION_LABEL: Record<string, string> = {
  outbound: "Ida",
  inbound: "Volta",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default async function RotasPage() {
  const supabase = await createClient();

  const { data: routes } = await supabase
    .from("routes")
    .select("id, name, direction, route_stops(count)")
    .order("created_at", { ascending: false });

  // Execuções de hoje (pra mostrar "em andamento").
  const routeIds = routes?.map((r) => r.id) ?? [];
  const { data: execs } = routeIds.length
    ? await supabase
        .from("route_executions")
        .select("id, route_id, status")
        .eq("service_date", today())
        .in("route_id", routeIds)
    : { data: [] };
  const execByRoute = new Map(execs?.map((e) => [e.route_id, e]));

  return (
    <>
      <AppHeader title="Rotas" subtitle="Suas rotas e o dia de hoje" />
      <div className="px-4 pb-6">
        <div className="mt-4">
          <Link
            href="/motorista/rotas/nova"
            className="block w-full rounded-xl bg-navy-900 py-3 text-center font-semibold text-yellow-400"
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
              const count = r.route_stops?.[0]?.count ?? 0;
              const exec = execByRoute.get(r.id);
              const running = exec?.status === "in_progress";
              const done = exec?.status === "completed";
              return (
                <Card key={r.id} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-navy-900">{r.name}</p>
                      <p className="text-sm text-navy-700/60">
                        {DIRECTION_LABEL[r.direction]} • {count}{" "}
                        {count === 1 ? "parada" : "paradas"}
                      </p>
                    </div>
                    {running && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        Em andamento
                      </span>
                    )}
                    {done && (
                      <span className="rounded-full bg-navy-900/5 px-2 py-0.5 text-xs text-navy-700/70">
                        Concluída hoje
                      </span>
                    )}
                  </div>

                  {running ? (
                    <Link
                      href={`/motorista/rota/${exec!.id}`}
                      className="block w-full rounded-xl bg-navy-900 py-2.5 text-center font-semibold text-yellow-400"
                    >
                      Continuar rota
                    </Link>
                  ) : done ? null : (
                    <form action={startOrReview.bind(null, r.id)}>
                      <button className="w-full rounded-xl bg-navy-900 py-2.5 font-semibold text-yellow-400">
                        Iniciar rota
                      </button>
                    </form>
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
