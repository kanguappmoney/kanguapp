"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createStudent, type StudentFormState } from "@/lib/actions/students";
import { StepIndicator } from "@/components/StepIndicator";

const initial: StudentFormState = { error: null };
const STEPS = ["Dados", "Endereços", "Contato"];

export default function NovoAlunoPage() {
  const [state, action, pending] = useActionState(createStudent, initial);
  const [step, setStep] = useState(1);
  const [shift, setShift] = useState<"morning" | "afternoon">("morning");

  return (
    <>
      {/* Header estilo mockup: logo + título + subtítulo + avatar do motorista */}
      <header className="bg-navy-900 px-4 pb-5 pt-5 text-white">
        <div className="flex items-center gap-3">
          <Link href="/motorista/alunos" className="text-xl text-white/70">
            ←
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-400 text-xl">
            🦘
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold leading-tight">Adicionar aluno</h1>
            <p className="text-xs text-white/60">Cadastre um novo passageiro</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-sm">
            🧑‍✈️
          </div>
        </div>
      </header>

      <div className="px-4 pb-8">
        <div className="mt-5 mb-6">
          <StepIndicator current={step} steps={STEPS} />
        </div>

        <form action={action} className="space-y-4">
          <input type="hidden" name="shift" value={shift} />

          {/* Passo 1 — dados do aluno */}
          <div className={step === 1 ? "space-y-4" : "hidden"}>
            <div className="flex items-start gap-4">
              <PhotoCircle />
              <div className="flex-1">
                <Field label="Nome completo" name="full_name" placeholder="Digite o nome do aluno" required />
              </div>
            </div>
            <Field label="Escola" name="school" placeholder="Digite o nome da escola" />
            <div>
              <span className="mb-1.5 block text-sm font-medium text-navy-800">
                Turno
              </span>
              <Segmented
                value={shift}
                onChange={setShift}
                options={[
                  { value: "morning", label: "Manhã" },
                  { value: "afternoon", label: "Tarde" },
                ]}
              />
            </div>
            <Field label="Ano / Turma" name="turma" placeholder="Ex.: 6º ano A" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Entra na escola" name="entry_time" type="time" />
              <Field label="Sai da escola" name="exit_time" type="time" />
            </div>
          </div>

          {/* Passo 2 — endereços */}
          <div className={step === 2 ? "space-y-4" : "hidden"}>
            <SectionHeading>Endereços</SectionHeading>
            <Field
              label="Endereço de embarque"
              name="pickup_address"
              placeholder="Rua, número, bairro"
            />
            <Field
              label="Endereço de desembarque"
              name="dropoff_address"
              placeholder="Normalmente a escola"
            />
            <p className="text-xs text-navy-700/50">
              Só você e os responsáveis vinculados a este aluno veem os endereços.
            </p>
          </div>

          {/* Passo 3 — responsável */}
          <div className={step === 3 ? "space-y-4" : "hidden"}>
            <SectionHeading>Contato do responsável</SectionHeading>
            <Field
              label="Nome do responsável"
              name="responsible_name"
              placeholder="Digite o nome do responsável"
            />
            <Field
              label="Telefone / WhatsApp"
              name="responsible_phone"
              type="tel"
              placeholder="(00) 00000-0000"
            />
            <div className="rounded-xl bg-yellow-400/15 px-3 py-2.5 text-sm text-navy-800">
              ℹ️ O responsável receberá um convite após o cadastro.
            </div>
          </div>

          {state.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="flex-1 rounded-xl border border-navy-900/15 py-3.5 font-semibold text-navy-900"
              >
                Voltar
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="flex-1 rounded-xl bg-yellow-400 py-3.5 font-bold uppercase tracking-wide text-navy-900"
              >
                Continuar
              </button>
            ) : (
              <button
                type="submit"
                disabled={pending}
                className="flex-1 rounded-xl bg-yellow-400 py-3.5 font-bold uppercase tracking-wide text-navy-900 disabled:opacity-60"
              >
                {pending ? "Salvando…" : "Salvar aluno"}
              </button>
            )}
          </div>
        </form>
      </div>
    </>
  );
}

function PhotoCircle() {
  // Slot de foto circular (visual do mockup "ADICIONAR FOTO"). Sem upload ainda —
  // a foto real (bucket privado + RLS) é o passo dedicado seguinte.
  return (
    <div className="flex w-20 shrink-0 flex-col items-center">
      <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-navy-900/5 text-navy-700/50">
        <span className="text-xl">📷</span>
      </div>
      <span className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wide text-navy-700/50">
        Adicionar foto
      </span>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex overflow-hidden rounded-xl border border-navy-900/15 bg-white">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex-1 py-2.5 text-sm font-semibold ${
              active ? "bg-navy-900 text-white" : "text-navy-700/70"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-base font-bold text-navy-900">{children}</h2>
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
