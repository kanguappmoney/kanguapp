"use client";

import { useActionState } from "react";
import { updateStudent, type StudentFormState } from "@/lib/actions/students";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { AddressFields } from "@/components/AddressFields";
import { SchoolPicker } from "@/components/SchoolPicker";
import { Section } from "@/components/ui";
import { GraduationCap, MapPin, School, Users } from "lucide-react";

const initial: StudentFormState = { error: null };

export interface StudentDefaults {
  id: string;
  full_name: string;
  birth_date: string | null;
  school: string | null;
  school_address: string | null;
  school_lat: number | null;
  school_lng: number | null;
  shift: string | null;
  turma: string | null;
  entry_time: string | null;
  exit_time: string | null;
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_address: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  pickup_street?: string | null;
  pickup_number?: string | null;
  pickup_neighborhood?: string | null;
  pickup_city?: string | null;
  dropoff_street?: string | null;
  dropoff_number?: string | null;
  dropoff_neighborhood?: string | null;
  dropoff_city?: string | null;
  responsible_name: string | null;
  responsible_phone: string | null;
  responsible_whatsapp: string | null;
  responsible_email: string | null;
}

export function EditStudentForm({ student }: { student: StudentDefaults }) {
  const action = updateStudent.bind(null, student.id);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="space-y-4">
      <Section tone="navy" icon={GraduationCap} title="Dados do aluno" className="space-y-4">
        <Field onDark label="Nome completo" name="full_name" defaultValue={student.full_name} required />
        <Field onDark label="Data de nascimento" name="birth_date" type="date" defaultValue={student.birth_date ?? ""} required />
      </Section>

      <Section tone="cream" icon={Users} title="Responsável" className="space-y-4">
        <Field label="Nome do responsável" name="responsible_name" defaultValue={student.responsible_name ?? ""} required />
        <Field label="Telefone do responsável" name="responsible_phone" type="tel" defaultValue={student.responsible_phone ?? ""} required />
        <Field label="WhatsApp do responsável" name="responsible_whatsapp" type="tel" defaultValue={student.responsible_whatsapp ?? ""} required />
        <Field label="E-mail do responsável" name="responsible_email" type="email" defaultValue={student.responsible_email ?? ""} required />
      </Section>

      <Section icon={School} title="Escola" className="space-y-4">
        <SchoolPicker required source={{ kind: "driver" }} initialValue={student.school ?? ""} />
        <AddressAutocomplete
          label="Endereço da escola"
          name="school_address"
          latName="school_lat"
          lngName="school_lng"
          initialValue={student.school_address ?? ""}
          initialLat={student.school_lat}
          initialLng={student.school_lng}
        />
        <Field label="Ano / Turma" name="turma" defaultValue={student.turma ?? ""} required />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-navy-800">Turno</span>
          <select
            name="shift"
            defaultValue={student.shift ?? "morning"}
            className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3"
          >
            <option value="morning">Manhã</option>
            <option value="afternoon">Tarde</option>
            <option value="integral">Integral</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Entra na escola" name="entry_time" type="time" defaultValue={student.entry_time ?? ""} required />
          <Field label="Sai da escola" name="exit_time" type="time" defaultValue={student.exit_time ?? ""} required />
        </div>
      </Section>

      <Section tone="cream" icon={MapPin} title="Embarque e desembarque" className="space-y-4">
        <AddressFields
          prefix="pickup"
          label="Endereço de embarque (casa)"
          initial={{
            street: student.pickup_street,
            number: student.pickup_number,
            neighborhood: student.pickup_neighborhood,
            city: student.pickup_city,
            legacy: student.pickup_address,
            lat: student.pickup_lat,
            lng: student.pickup_lng,
          }}
        />
        <AddressFields
          prefix="dropoff"
          label="Endereço de desembarque"
          initial={{
            street: student.dropoff_street,
            number: student.dropoff_number,
            neighborhood: student.dropoff_neighborhood,
            city: student.dropoff_city,
            legacy: student.dropoff_address,
            lat: student.dropoff_lat,
            lng: student.dropoff_lng,
          }}
        />
      </Section>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900 disabled:opacity-60"
      >
        {pending ? "Salvando…" : "Salvar alterações"}
      </button>
    </form>
  );
}

function Field({
  label,
  onDark = false,
  ...props
}: { label: string; onDark?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className={`mb-1 block text-sm font-medium ${onDark ? "text-white/80" : "text-navy-800"}`}>
        {label}
      </span>
      <input
        {...props}
        className={`w-full rounded-xl border bg-white px-3 py-3 text-navy-900 outline-none focus:ring-2 focus:ring-yellow-400/40 ${
          onDark ? "border-white/20 focus:border-yellow-400" : "border-navy-900/15 focus:border-navy-700"
        }`}
      />
    </label>
  );
}
