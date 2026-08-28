import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, SectionTitle } from "@/components/ui";
import { startExecution } from "@/lib/actions/routes";

const LEG_LABEL: Record<string, string> = {
  outbound: "ida",
  inbound: "volta",
  both: "ida e volta",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default async function RevisaoHojePage({
  params,
}: {
  params: Promise<{ routeId: string }>;
}) {
  const { routeId } = await params;
  const supabase = await createClient();

  const { data: route } = await supabase
    .from("routes")
    .select("id, name")
    .eq("id", routeId)
    .single();
  if (!route) notFound();

  const { data: stops } = await supabase
    .from("route_stops")
    .select("student_id, students(full_name)")
    .eq("route_id", routeId)
    .order("position");

  const studentIds = stops?.map((s) => s.student_id) ?? [];
  const nameById = new Map(
    // @ts-expect-error relação aninhada do supabase-js
    (stops ?? []).map((s) => [s.student_id, s.students?.full_name as string]),
  );

  const { data: absences } = studentIds.length
    ? await supabase
        .from("absences")
        .select("student_id, leg")
        .eq("service_date", today())
        .in("student_id", studentIds)
    : { data: [] };

  return (
    <>
      <header className="flex items-center gap-3 border-b border-navy-900/10 bg-white px-4 pb-5 pt-6 text-navy-900">
        <Link href="/motorista/rotas" className="text-navy-900/70">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-navy-900">Revisão de hoje</h1>
          <p className="text-sm text-navy-700/50">{route.name}</p>
        </div>
      </header>

      <div className="px-4 pb-8">
        {/* Ausências de hoje — informativo. (Suspensões a revisar entram com o
            bloco financeiro; escopo travado.) */}
        <SectionTitle>Ausências de hoje</SectionTitle>
        {!absences?.length ? (
          <Card className="text-sm text-navy-700/60">
            Nenhuma ausência informada. Todos entram na rota.
          </Card>
        ) : (
          <div className="space-y-2">
            {absences.map((a) => (
              <Card
                key={a.student_id}
                className="flex items-center justify-between"
              >
                <span className="font-medium text-navy-900">
                  {nameById.get(a.student_id) ?? "Aluno"}
                </span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  Ausente ({LEG_LABEL[a.leg] ?? a.leg})
                </span>
              </Card>
            ))}
          </div>
        )}

        <p className="mt-6 text-sm text-navy-700/60">
          Confira antes de sair. Você sempre confirma o início da rota — nada é
          pulado sem você ver.
        </p>

        {/* G2: início só com confirmação explícita do motorista. */}
        <form action={startExecution.bind(null, routeId)} className="mt-3">
          <button className="w-full rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900">
            Confirmar e iniciar rota
          </button>
        </form>
      </div>
    </>
  );
}
