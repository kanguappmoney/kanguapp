import { PaymentDayField } from "@/components/PaymentDayField";
import Link from "next/link";
import { ArrowLeft, GraduationCap, Mail, MapPin, Phone, School, User, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InfoRow, Section } from "@/components/ui";
import { InvitePanel } from "@/components/InvitePanel";
import { ProfileGateNotice } from "@/components/ProfileGateNotice";
import { getProfileGate } from "@/lib/profile-gate";
import { PhotoUploader } from "@/components/PhotoUploader";
import { ArchiveButton } from "@/components/ArchiveButton";
import { StatusPill } from "@/components/patterns";
import { PAY_CHIP } from "@/lib/pay-status";

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
      "id, full_name, birth_date, school, school_address, shift, turma, entry_time, exit_time, pickup_address, dropoff_address, responsible_name, responsible_phone, responsible_whatsapp, responsible_email, photo_path, pay_status, payment_due_day",
    )
    .eq("id", id)
    .single();

  if (!student) notFound();

  // URL assinada da foto (bucket privado). RLS permite ao motorista dono.
  let photoUrl: string | null = null;
  if (student.photo_path) {
    const { data: signed } = await supabase.storage
      .from("student-photos")
      .createSignedUrl(student.photo_path, 3600);
    photoUrl = signed?.signedUrl ?? null;
  }

  // Foto: só com a autorização de foto do responsável (texto próprio, opcional e separada da dos dados).
  const { data: photoAllowed } = await supabase.rpc("student_photo_allowed", { p_student_id: id });

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

  // Portão de perfil completo: sem veículo completo, não gera convite.
  const gate = await getProfileGate();

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

      <div className="space-y-4 px-4 pb-6 pt-4">
        {/* Resumo — azul-marinho: quem é o aluno e como está agora */}
        <Section tone="navy" icon={GraduationCap} title="Resumo">
          {photoAllowed ? (
            <PhotoUploader studentId={id} currentUrl={photoUrl} onDark />
          ) : (
            <p className="text-sm text-white/70">
              Foto: depende da autorização do responsável. Ele pode autorizar em Perfil → Autorizações.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(() => {
              const pay = PAY_CHIP[student.pay_status] ?? PAY_CHIP.ok;
              return <StatusPill tone={pay.tone} onDark>{pay.label}</StatusPill>;
            })()}
            {student.shift && <StatusPill tone="neutral" onDark>{SHIFT_LABEL[student.shift]}</StatusPill>}
          </div>
          {student.school && <p className="mt-3 text-sm text-white/70">{student.school}</p>}
        </Section>

        {/* Pagamento — creme */}
        <PaymentDayField studentId={id} initialDay={student.payment_due_day ?? null} />

        <Section icon={User} title="Dados do aluno">
          <InfoRow label="Nascimento" value={brDate(student.birth_date)} />
        </Section>

        <Section icon={School} title="Dados escolares">
          <InfoRow label="Escola" value={student.school} />
          <InfoRow label="Endereço da escola" value={student.school_address} />
          <InfoRow label="Turno" value={student.shift ? SHIFT_LABEL[student.shift] : null} />
          <InfoRow label="Turma" value={student.turma} />
          <InfoRow label="Entra na escola" value={hhmm(student.entry_time)} />
          <InfoRow label="Sai da escola" value={hhmm(student.exit_time)} />
        </Section>

        <Section icon={MapPin} title="Embarque e desembarque">
          <InfoRow label="Embarque" value={student.pickup_address} />
          <InfoRow label="Desembarque" value={student.dropoff_address} />
        </Section>

        <Section icon={Phone} title="Contato do responsável">
          <InfoRow label="Nome" value={student.responsible_name} />
          <InfoRow label="Telefone" value={student.responsible_phone} />
          <InfoRow label="WhatsApp" value={student.responsible_whatsapp} />
          <InfoRow label="E-mail" value={student.responsible_email} />
        </Section>

        <Section icon={Users} title="Responsáveis vinculados">
          {guardians?.length ? (
            <div className="space-y-1">
              {guardians.map((g) => (
                <p key={g.id} className="flex items-center gap-2 py-1 text-sm text-navy-900">
                  <User className="h-4 w-4 text-navy-700/50" /> {g.full_name}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-navy-700/60">Nenhum responsável vinculado ainda.</p>
          )}
        </Section>

        {gate.complete ? (
          <Section icon={Mail} title="Convite do responsável">
            <InvitePanel studentId={id} invite={invite ?? null} />
          </Section>
        ) : (
          <ProfileGateNotice missing={gate.missing} action="enviar convites" />
        )}

        <div className="pt-4">
          <ArchiveButton studentId={id} />
        </div>
      </div>
    </>
  );
}

