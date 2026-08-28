import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, SectionTitle } from "@/components/ui";
import { InvitePanel } from "@/components/InvitePanel";
import { PhotoSlot } from "@/components/PhotoSlot";
import { ArchiveButton } from "@/components/ArchiveButton";

const SHIFT_LABEL: Record<string, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  integral: "Integral",
};

function hhmm(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}

// Data ISO (yyyy-mm-dd) → dd/mm/aaaa.
function brDate(d: string | null): string | null {
  if (!d) return null;
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}

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
      "id, full_name, birth_date, school, school_address, shift, turma, entry_time, exit_time, pickup_address, dropoff_address, responsible_name, responsible_phone, responsible_whatsapp, responsible_email, pay_status",
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

  // Responsáveis já vinculados. Duas queries: guardian_student não tem FK direta
  // para users (aponta para guardians), então o embed do PostgREST não resolve.
  const { data: links } = await supabase
    .from("guardian_student")
    .select("guardian_id")
    .eq("student_id", id);

  const guardianIds = links?.map((l) => l.guardian_id) ?? [];
  const { data: guardians } = guardianIds.length
    ? await supabase.from("users").select("id, full_name").in("id", guardianIds)
    : { data: [] };

  return (
    <>
      <header className="flex items-center justify-between gap-3 border-b border-navy-900/10 bg-white px-4 pb-5 pt-6 text-navy-900">
        <div className="flex items-center gap-3">
          <Link href="/motorista/alunos" className="text-navy-900/70">
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <h1 className="text-lg font-bold text-navy-900">{student.full_name}</h1>
        </div>
        <Link
          href={`/motorista/alunos/${id}/editar`}
          className="rounded-lg bg-navy-900/5 px-3 py-1.5 text-sm font-medium text-navy-900"
        >
          Editar
        </Link>
      </header>

      <div className="px-4 pb-6">
        <div className="mt-4">
          <PhotoSlot label="Foto do aluno" />
        </div>

        <SectionTitle>Dados do aluno</SectionTitle>
        <Card className="space-y-1 text-sm">
          <Row label="Nascimento" value={brDate(student.birth_date)} />
        </Card>

        <SectionTitle>Dados escolares</SectionTitle>
        <Card className="space-y-1 text-sm">
          <Row label="Escola" value={student.school} />
          <Row label="Endereço da escola" value={student.school_address} />
          <Row
            label="Turno"
            value={student.shift ? SHIFT_LABEL[student.shift] : null}
          />
          <Row label="Turma" value={student.turma} />
          <Row label="Entra na escola" value={hhmm(student.entry_time)} />
          <Row label="Sai da escola" value={hhmm(student.exit_time)} />
        </Card>

        <SectionTitle>Embarque e desembarque</SectionTitle>
        <Card className="space-y-1 text-sm">
          <Row label="Embarque" value={student.pickup_address} />
          <Row label="Desembarque" value={student.dropoff_address} />
        </Card>

        <SectionTitle>Contato do responsável</SectionTitle>
        <Card className="space-y-1 text-sm">
          <Row label="Nome" value={student.responsible_name} />
          <Row label="Telefone" value={student.responsible_phone} />
          <Row label="WhatsApp" value={student.responsible_whatsapp} />
          <Row label="E-mail" value={student.responsible_email} />
        </Card>

        <SectionTitle>Responsáveis</SectionTitle>
        {guardians?.length ? (
          <Card className="space-y-1">
            {guardians.map((g) => (
              <p key={g.id} className="text-sm text-navy-900">
                👤 {g.full_name}
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

        <div className="mt-8">
          <ArchiveButton studentId={id} />
        </div>
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
