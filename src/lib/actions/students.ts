"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type StudentFormState = { error: string | null };

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

  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return { error: "O nome do aluno é obrigatório." };

  const shiftRaw = String(formData.get("shift") ?? "");
  const shift = shiftRaw === "morning" || shiftRaw === "afternoon" ? shiftRaw : null;

  const { data, error } = await supabase
    .from("students")
    .insert({
      driver_id: user.id,
      full_name,
      school: emptyToNull(formData.get("school")),
      shift,
      turma: emptyToNull(formData.get("turma")),
      pickup_address: emptyToNull(formData.get("pickup_address")),
      dropoff_address: emptyToNull(formData.get("dropoff_address")),
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/motorista/alunos");
  redirect(`/motorista/alunos/${data.id}`);
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
