import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, SectionTitle } from "@/components/ui";
import { InvitePanel } from "@/components/InvitePanel";

const SHIFT_LABEL: Record<string, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
};

export default async function DetalheAlunoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select(
      "id, full_name, school, shift, turma, pickup_address, dropoff_address, pay_status",
    )
    .eq("id", id)
    .single();

  if (!student) notFound();

  // Convite pendente ativo (se houver).
  const { data: invite } = await supabase
    .from("student_invites")
    .select("id, token, expires_at")
    .eq("student_id", id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Responsáveis já vinculados.
  const { data: guardians } = await supabase
    .from("guardian_student")
    .select("guardian_id, users:guardian_id(full_name)")
    .eq("student_id", id);

  return (
    <>
      <header className="flex items-center gap-3 bg-navy-900 px-4 pb-5 pt-6 text-white">
        <Link href="/motorista/alunos" className="text-white/70">
          ←
        </Link>
        <h1 className="text-lg font-bold">{student.full_name}</h1>
      </header>

      <div className="px-4 pb-6">
        <SectionTitle>Dados escolares</SectionTitle>
        <Card className="space-y-1 text-sm">
          <Row label="Escola" value={student.school} />
          <Row
            label="Turno"
            value={student.shift ? SHIFT_LABEL[student.shift] : null}
          />
          <Row label="Turma" value={student.turma} />
        </Card>

        <SectionTitle>Embarque e desembarque</SectionTitle>
        <Card className="space-y-1 text-sm">
          <Row label="Embarque" value={student.pickup_address} />
          <Row label="Desembarque" value={student.dropoff_address} />
        </Card>

        <SectionTitle>Responsáveis</SectionTitle>
        {guardians?.length ? (
          <Card className="space-y-1">
            {guardians.map((g) => (
              <p key={g.guardian_id} className="text-sm text-navy-900">
                {/* @ts-expect-error relação aninhada do supabase-js */}
                👤 {g.users?.full_name ?? "Responsável"}
              </p>
            ))}
          </Card>
        ) : (
          <Card className="border-dashed text-sm text-navy-700/60">
            Nenhum responsável vinculado ainda.
          </Card>
        )}

        <SectionTitle>Convite do responsável</SectionTitle>
        <Card>
          <InvitePanel studentId={id} invite={invite ?? null} />
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-navy-700/60">{label}</span>
      <span className="text-right font-medium text-navy-900">
        {value || "—"}
      </span>
    </div>
  );
}
