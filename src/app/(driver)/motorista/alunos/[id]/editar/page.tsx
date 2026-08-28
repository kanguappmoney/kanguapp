import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditStudentForm } from "@/components/EditStudentForm";

// Postgres time volta como "HH:MM:SS"; o input type=time quer "HH:MM".
function hhmm(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}

export default async function EditarAlunoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select(
      "id, full_name, birth_date, school, school_address, shift, turma, entry_time, exit_time, pickup_address, dropoff_address, responsible_name, responsible_phone, responsible_whatsapp, responsible_email",
    )
    .eq("id", id)
    .single();

  if (!student) notFound();

  return (
    <>
      <header className="flex items-center gap-3 bg-navy-900 px-4 pb-5 pt-6 text-white">
        <Link href={`/motorista/alunos/${id}`} className="text-white/70">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-lg font-bold">Editar aluno</h1>
      </header>
      <div className="px-4 pb-8">
        <EditStudentForm
          student={{
            ...student,
            entry_time: hhmm(student.entry_time),
            exit_time: hhmm(student.exit_time),
          }}
        />
      </div>
    </>
  );
}
