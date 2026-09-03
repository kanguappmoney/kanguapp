import Link from "next/link";
import { Link2 as LinkIcon, ClipboardCheck } from "lucide-react";
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
  integral: "Integral",
};

export default async function AlunosPage() {
  const supabase = await createClient();
  const { data: students } = await supabase
    .from("students")
    .select("id, full_name, school, shift, pay_status, status")
    .eq("status", "active")
    .order("full_name");

  // Ausências de hoje (selo informativo na lista).
  const ids = students?.map((s) => s.id) ?? [];
  const { data: absToday } = ids.length
    ? await supabase
        .from("absences")
        .select("student_id")
        .eq("service_date", new Date().toISOString().slice(0, 10))
        .in("student_id", ids)
    : { data: [] };
  const absentSet = new Set((absToday ?? []).map((a) => a.student_id));

  // Cadastros vindos do link de captação, aguardando aprovação (RLS: só os deste
  // motorista).
  const { count: pendingCount } = await supabase
    .from("capture_submissions")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return (
    <>
      <AppHeader title="Alunos" subtitle="Quem você atende" />
      <div className="px-4 pb-6">
        <div className="mt-4 space-y-2">
          <Link
            href="/motorista/alunos/novo"
            className="block w-full rounded-xl bg-yellow-400 py-3 text-center font-semibold text-navy-900"
          >
            ➕ Adicionar aluno
          </Link>
          <Link
            href="/motorista/alunos/captacao"
            className="flex items-center justify-center gap-2 rounded-xl border border-navy-900/15 py-3 text-center font-semibold text-navy-900"
          >
            <LinkIcon className="h-4 w-4" />
            Links de captação
          </Link>
          {(pendingCount ?? 0) > 0 && (
            <Link
              href="/motorista/alunos/aprovacoes"
              className="flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 py-3 text-center font-semibold text-amber-900"
            >
              <ClipboardCheck className="h-4 w-4" />
              Cadastros a aprovar
              <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">
                {pendingCount}
              </span>
            </Link>
          )}
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
                    <div className="flex shrink-0 items-center gap-2">
                      {absentSet.has(s.id) && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          Ausente hoje
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${chip.cls}`}
                      >
                        {chip.label}
                      </span>
                    </div>
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
