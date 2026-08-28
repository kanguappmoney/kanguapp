"use client";

import { useActionState } from "react";
import { updateDriverProfile, type DriverFormState } from "@/lib/actions/driver";

const initial: DriverFormState = { error: null };

export interface DriverDefaults {
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  plate: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  capacity: number | null;
}

export function EditDriverForm({ driver }: { driver: DriverDefaults }) {
  const [state, action, pending] = useActionState(updateDriverProfile, initial);

  return (
    <form action={action} className="space-y-4">
      <SectionHeading>Dados</SectionHeading>
      <Field label="Nome completo" name="full_name" defaultValue={driver.full_name} required />
      <Field label="Telefone" name="phone" type="tel" defaultValue={driver.phone ?? ""} placeholder="(00) 00000-0000" required />
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-navy-800">
          E-mail <span className="text-navy-700/40">(não editável)</span>
        </span>
        <input
          value={driver.email ?? ""}
          disabled
          className="w-full rounded-xl border border-navy-900/10 bg-navy-900/[0.03] px-3 py-3 text-navy-700/60"
        />
      </label>

      <SectionHeading>Endereço</SectionHeading>
      <Field label="Endereço residencial" name="address" defaultValue={driver.address ?? ""} placeholder="Rua, número, bairro, cidade" required />

      <SectionHeading>Veículo</SectionHeading>
      <Field label="Placa" name="plate" defaultValue={driver.plate ?? ""} placeholder="ABC-1D23" required />
      <Field label="Modelo" name="model" defaultValue={driver.model ?? ""} placeholder="Ex.: Mercedes-Benz Sprinter" required />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ano" name="year" type="number" defaultValue={driver.year ?? ""} placeholder="2022" required />
        <Field label="Cor" name="color" defaultValue={driver.color ?? ""} placeholder="Branca" required />
      </div>
      <Field label="Vagas" name="capacity" type="number" defaultValue={driver.capacity ?? ""} placeholder="Ex.: 15" required />

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

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="pt-2 text-base font-bold text-navy-900">{children}</h2>;
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
