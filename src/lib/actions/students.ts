"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type StudentFormState = { error: string | null };

// Monta o payload do aluno a partir do formulário (compartilhado por criar/editar).
function studentPayloadFromForm(formData: FormData) {
  const shiftRaw = String(formData.get("shift") ?? "");
  const shift =
    shiftRaw === "morning" || shiftRaw === "afternoon" || shiftRaw === "integral"
      ? shiftRaw
      : null;

  return {
    full_name: String(formData.get("full_name") ?? "").trim(),
    birth_date: emptyToNull(formData.get("birth_date")),
    school: emptyToNull(formData.get("school")),
    school_address: emptyToNull(formData.get("school_address")),
    shift,
    turma: emptyToNull(formData.get("turma")),
    entry_time: emptyToNull(formData.get("entry_time")),
    exit_time: emptyToNull(formData.get("exit_time")),
    pickup_address: emptyToNull(formData.get("pickup_address")),
    dropoff_address: emptyToNull(formData.get("dropoff_address")),
    responsible_name: emptyToNull(formData.get("responsible_name")),
    responsible_phone: emptyToNull(formData.get("responsible_phone")),
    responsible_whatsapp: emptyToNull(formData.get("responsible_whatsapp")),
    responsible_email: emptyToNull(formData.get("responsible_email")),
  };
}

// Todos os campos são obrigatórios (menos a foto). Retorna a lista de faltantes.
const REQUIRED_LABELS: Record<string, string> = {
  full_name: "Nome",
  birth_date: "Data de nascimento",
  responsible_name: "Nome do responsável",
  responsible_phone: "Telefone",
  responsible_whatsapp: "WhatsApp",
  responsible_email: "E-mail",
  school: "Escola",
  school_address: "Endereço da escola",
  turma: "Ano/Turma",
  entry_time: "Entrada",
  exit_time: "Saída",
  pickup_address: "Embarque",
  dropoff_address: "Desembarque",
};

function missingFields(payload: Record<string, unknown>): string[] {
  return Object.entries(REQUIRED_LABELS)
    .filter(([key]) => !payload[key])
    .map(([, label]) => label);
}

// Cadastro de aluno pelo motorista (dono). RLS garante driver_id = auth.uid().
export async function createStudent(
  _prev: StudentFormState,
  formData: FormData,
): Promise<StudentFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };

  const payload = studentPayloadFromForm(formData);
  const missing = missingFields(payload);
  if (missing.length)
    return { error: `Preencha todos os campos: ${missing.join(", ")}.` };

  const { data, error } = await supabase
    .from("students")
    .insert({ driver_id: user.id, ...payload })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/motorista/alunos");
  redirect(`/motorista/alunos/${data.id}`);
}

// Edita o cadastro do aluno. RLS garante que só o motorista dono altera.
export async function updateStudent(
  studentId: string,
  _prev: StudentFormState,
  formData: FormData,
): Promise<StudentFormState> {
  const supabase = await createClient();

  const payload = studentPayloadFromForm(formData);
  const missing = missingFields(payload);
  if (missing.length)
    return { error: `Preencha todos os campos: ${missing.join(", ")}.` };

  const { error } = await supabase
    .from("students")
    .update(payload)
    .eq("id", studentId);

  if (error) return { error: error.message };

  revalidatePath(`/motorista/alunos/${studentId}`);
  redirect(`/motorista/alunos/${studentId}`);
}

// Arquiva o aluno (sai da lista ativa; não apaga histórico).
export async function archiveStudent(studentId: string) {
  const supabase = await createClient();
  await supabase
    .from("students")
    .update({ status: "archived" })
    .eq("id", studentId);
  revalidatePath("/motorista/alunos");
  redirect("/motorista/alunos");
}

// Gera um convite (por aluno) com token de uso único. Um pendente por vez:
// revoga os pendentes antigos antes de criar o novo.
export async function createInvite(studentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("student_invites")
    .update({ status: "revoked" })
    .eq("student_id", studentId)
    .eq("status", "pending");

  const token = randomBytes(18).toString("base64url");

  await supabase.from("student_invites").insert({
    student_id: studentId,
    driver_id: user.id,
    token,
  });

  revalidatePath(`/motorista/alunos/${studentId}`);
}

export async function revokeInvite(inviteId: string, studentId: string) {
  const supabase = await createClient();
  await supabase
    .from("student_invites")
    .update({ status: "revoked" })
    .eq("id", inviteId)
    .eq("status", "pending");
  revalidatePath(`/motorista/alunos/${studentId}`);
}

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}
