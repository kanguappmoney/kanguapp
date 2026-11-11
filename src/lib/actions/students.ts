"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfileGate, profileGateError } from "@/lib/profile-gate";

export type StudentFormState = { error: string | null };

// Endereço em partes (rua, número, bairro, cidade). O texto composto é refeito aqui,
// no mesmo formato do banco: "rua, número - bairro, cidade". Faltou parte → o texto fica
// nulo e o aluno cai na lista de obrigatórios faltantes.
function addressPartsFromForm(formData: FormData, prefix: "pickup" | "dropoff") {
  const g = (k: string) => emptyToNull(formData.get(`${prefix}_${k}`));
  const street = g("street");
  const number = g("number");
  const neighborhood = g("neighborhood");
  const city = g("city");
  const complete = street && number && neighborhood && city;
  return {
    [`${prefix}_street`]: street,
    [`${prefix}_number`]: number,
    [`${prefix}_neighborhood`]: neighborhood,
    [`${prefix}_city`]: city,
    [`${prefix}_address`]: complete ? `${street}, ${number} - ${neighborhood}, ${city}` : null,
  } as Record<string, string | null>;
}

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
    ...addressPartsFromForm(formData, "pickup"),
    ...addressPartsFromForm(formData, "dropoff"),
    // Coordenadas (Rotas 2.0 Fatia A): enriquecimento opcional para a rota
    // sugerida. Vazio = null; nunca entram em REQUIRED_LABELS (não travam o
    // cadastro se o geocoding falhar).
    school_lat: numOrNull(formData.get("school_lat")),
    school_lng: numOrNull(formData.get("school_lng")),
    pickup_lat: numOrNull(formData.get("pickup_lat")),
    pickup_lng: numOrNull(formData.get("pickup_lng")),
    dropoff_lat: numOrNull(formData.get("dropoff_lat")),
    dropoff_lng: numOrNull(formData.get("dropoff_lng")),
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
  pickup_street: "Embarque: rua",
  pickup_number: "Embarque: número",
  pickup_neighborhood: "Embarque: bairro",
  pickup_city: "Embarque: cidade",
  dropoff_street: "Desembarque: rua",
  dropoff_number: "Desembarque: número",
  dropoff_neighborhood: "Desembarque: bairro",
  dropoff_city: "Desembarque: cidade",
};

function missingFields(payload: Record<string, unknown>): string[] {
  return Object.entries(REQUIRED_LABELS)
    .filter(([key]) => !payload[key])
    .map(([, label]) => label);
}

// Grava o caminho da foto no aluno (a imagem já foi enviada ao Storage pelo
// cliente autenticado — RLS do bucket só deixa o motorista dono subir).
export async function setStudentPhoto(studentId: string, photoPath: string) {
  const supabase = await createClient();
  await supabase
    .from("students")
    .update({ photo_path: photoPath })
    .eq("id", studentId);
  revalidatePath(`/motorista/alunos/${studentId}`);
}

// Edita o cadastro do aluno. RLS garante que só o motorista dono altera.
export async function updateStudent(
  studentId: string,
  _prev: StudentFormState,
  formData: FormData,
): Promise<StudentFormState> {
  const supabase = await createClient();

  const gate = await getProfileGate();
  if (!gate.complete) return { error: profileGateError(gate) };

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
  if (!(await getProfileGate()).complete) return; // a tela mostra o aviso

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

// Coordenada do formulário: número válido ou null (campo vazio / não geocodado).
function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
