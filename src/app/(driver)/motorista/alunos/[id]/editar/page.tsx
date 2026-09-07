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
      "id, full_name, birth_date, school, school_address, school_lat, school_lng, shift, turma, entry_time, exit_time, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, responsible_name, responsible_phone, responsible_whatsapp, responsible_email",
    )
    .eq("id", id)
    .single();

  if (!student) notFound();

  return (
    <>
      <header className="flex items-center gap-3 border-b border-navy-900/10 bg-white px-4 pb-5 pt-6 text-navy-900">
        <Link href={`/motorista/alunos/${id}`} className="text-navy-900/70">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-lg font-bold text-navy-900">Editar aluno</h1>
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
