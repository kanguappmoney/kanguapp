"use client";

import { useActionState } from "react";
import { updateStudent, type StudentFormState } from "@/lib/actions/students";
import { PhotoSlot } from "@/components/PhotoSlot";

const initial: StudentFormState = { error: null };

export interface StudentDefaults {
  id: string;
  full_name: string;
  school: string | null;
  shift: string | null;
  turma: string | null;
  entry_time: string | null;
  exit_time: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  responsible_name: string | null;
  responsible_phone: string | null;
}

export function EditStudentForm({ student }: { student: StudentDefaults }) {
  const action = updateStudent.bind(null, student.id);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Nome completo" name="full_name" defaultValue={student.full_name} required />
      <Field label="Escola" name="school" defaultValue={student.school ?? ""} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-navy-800">Turno</span>
        <select
          name="shift"
          defaultValue={student.shift ?? "morning"}
          className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3"
        >
          <option value="morning">Manhã</option>
          <option value="afternoon">Tarde</option>
        </select>
      </label>
      <Field label="Turma" name="turma" defaultValue={student.turma ?? ""} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Entra na escola" name="entry_time" type="time" defaultValue={student.entry_time ?? ""} />
        <Field label="Sai da escola" name="exit_time" type="time" defaultValue={student.exit_time ?? ""} />
      </div>
      <Field label="Endereço de embarque" name="pickup_address" defaultValue={student.pickup_address ?? ""} />
      <Field label="Endereço de desembarque" name="dropoff_address" defaultValue={student.dropoff_address ?? ""} />
      <Field label="Nome do responsável" name="responsible_name" defaultValue={student.responsible_name ?? ""} />
      <Field
        label="Telefone / WhatsApp do responsável"
        name="responsible_phone"
        type="tel"
        defaultValue={student.responsible_phone ?? ""}
      />
      <PhotoSlot label="Foto do aluno" />

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-navy-900 py-3 font-semibold text-yellow-400 disabled:opacity-60"
      >
        {pending ? "Salvando…" : "Salvar alterações"}
      </button>
    </form>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-navy-800">
        {label}
      </span>
      <input
        {...props}
        className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3 outline-none focus:border-navy-700 focus:ring-2 focus:ring-yellow-400/40"
      />
    </label>
  );
}
