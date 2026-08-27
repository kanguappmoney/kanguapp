import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppHeader, Card, SectionTitle, Placeholder } from "@/components/ui";

const PAY_CHIP: Record<string, { label: string; cls: string }> = {
  ok: { label: "Em dia", cls: "bg-green-100 text-green-800" },
  at_risk: { label: "Vencida", cls: "bg-amber-100 text-amber-800" },
  blocked: { label: "Suspenso", cls: "bg-red-100 text-red-800" },
};

const SHIFT_LABEL: Record<string, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
};

export default async function AlunosPage() {
  const supabase = await createClient();
  const { data: students } = await supabase
    .from("students")
    .select("id, full_name, school, shift, pay_status, status")
    .eq("status", "active")
    .order("full_name");

  return (
    <>
      <AppHeader title="Alunos" subtitle="Quem você atende" />
      <div className="px-4 pb-6">
        <div className="mt-4">
          <Link
            href="/motorista/alunos/novo"
            className="block w-full rounded-xl bg-yellow-400 py-3 text-center font-semibold text-navy-900"
          >
            ➕ Adicionar aluno
          </Link>
        </div>

        <SectionTitle>Lista de alunos</SectionTitle>
        {!students?.length ? (
          <Placeholder>
            Nenhum aluno cadastrado ainda. Toque em “Adicionar aluno”.
          </Placeholder>
        ) : (
          <div className="space-y-2">
            {students.map((s) => {
              const chip = PAY_CHIP[s.pay_status] ?? PAY_CHIP.ok;
              return (
                <Link key={s.id} href={`/motorista/alunos/${s.id}`}>
                  <Card className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-navy-900">{s.full_name}</p>
                      <p className="text-sm text-navy-700/60">
                        {[s.school, s.shift && SHIFT_LABEL[s.shift]]
                          .filter(Boolean)
                          .join(" • ") || "—"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${chip.cls}`}
                    >
                      {chip.label}
                    </span>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
