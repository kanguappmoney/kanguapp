import { createClient } from "@/lib/supabase/server";
import { AppHeader, Card, SectionTitle } from "@/components/ui";
import { AbsenceForm } from "@/components/AbsenceForm";
import { UndoAbsenceButton } from "@/components/UndoAbsenceButton";

const LEG_LABEL: Record<string, string> = {
  outbound: "Ida",
  inbound: "Volta",
  both: "Ida e volta",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function brDate(d: string) {
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}

export default async function AusenciasPage() {
  const supabase = await createClient();

  // RLS retorna só os filhos vinculados.
  const { data: children } = await supabase
    .from("students")
    .select("id, full_name")
    .eq("status", "active")
    .order("full_name");

  const nameById = new Map((children ?? []).map((c) => [c.id, c.full_name]));

  // Ausências informadas de hoje em diante.
  const { data: absences } = await supabase
    .from("absences")
    .select("id, student_id, service_date, leg")
    .gte("service_date", today())
    .order("service_date");

  return (
    <>
      <AppHeader title="Ausências" subtitle="Avise quando o filho não for" />
      <div className="px-4 pb-6">
        {!children?.length ? (
          <Card className="mt-4 border-dashed text-center text-sm text-navy-700/60">
            Nenhuma criança vinculada ainda.
          </Card>
        ) : (
          <>
            <SectionTitle>Informar ausência</SectionTitle>
            <AbsenceForm children={children} />

            <SectionTitle>Ausências informadas</SectionTitle>
            {!absences?.length ? (
              <Card className="text-sm text-navy-700/60">
                Nenhuma ausência informada.
              </Card>
            ) : (
              <div className="space-y-2">
                {absences.map((a) => (
                  <Card key={a.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-navy-900">
                        {nameById.get(a.student_id) ?? "Criança"}
                      </p>
                      <p className="text-sm text-navy-700/60">
                        {brDate(a.service_date)} • {LEG_LABEL[a.leg] ?? a.leg}
                      </p>
                    </div>
                    <UndoAbsenceButton absenceId={a.id} />
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
