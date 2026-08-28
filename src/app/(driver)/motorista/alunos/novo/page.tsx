"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createStudent, type StudentFormState } from "@/lib/actions/students";
import { StepIndicator } from "@/components/StepIndicator";
import { Logo } from "@/components/Logo";

const initial: StudentFormState = { error: null };
const STEPS = ["Dados", "Escola", "Rota"];

export default function NovoAlunoPage() {
  const [state, action, pending] = useActionState(createStudent, initial);
  const [step, setStep] = useState(1);
  const [shift, setShift] = useState<"morning" | "afternoon" | "integral">("morning");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [sameAddress, setSameAddress] = useState(true);

  return (
    <>
      <header className="bg-navy-900 px-4 pb-5 pt-5 text-white">
        <div className="flex items-center gap-3">
          <Link href="/motorista/alunos" className="text-xl text-white/70">
            ←
          </Link>
          <Logo variant="icon" className="h-10 w-10" />
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

          {/* ================= Passo 1 — Dados ================= */}
          <div className={step === 1 ? "space-y-4" : "hidden"}>
            <div className="flex justify-center">
              <PhotoCircle />
            </div>
            <Field label="Nome completo" name="full_name" req placeholder="Digite o nome do aluno" />
            <Field label="Data de nascimento" name="birth_date" req type="date" />
            <Field label="Nome do responsável" name="responsible_name" req placeholder="Digite o nome do responsável" />
            <Field label="Telefone do responsável" name="responsible_phone" req type="tel" placeholder="(00) 00000-0000" />
            <Field label="WhatsApp do responsável" name="responsible_whatsapp" type="tel" placeholder="(00) 00000-0000" />
            <Field label="E-mail do responsável" name="responsible_email" type="email" placeholder="Digite o e-mail do responsável" />
          </div>

          {/* ================= Passo 2 — Escola ================= */}
          <div className={step === 2 ? "space-y-4" : "hidden"}>
            <SectionHeading>Dados escolares</SectionHeading>
            <Field label="Escola" name="school" req placeholder="Digite o nome da escola" />
            <Field label="Ano / Turma" name="turma" placeholder="Ex.: 6º ano A" />
            <div>
              <span className="mb-1.5 block text-sm font-medium text-navy-800">Turno</span>
              <Segmented
                value={shift}
                onChange={setShift}
                options={[
                  { value: "morning", label: "Manhã" },
                  { value: "afternoon", label: "Tarde" },
                  { value: "integral", label: "Integral" },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Entra na escola" name="entry_time" type="time" />
              <Field label="Sai da escola" name="exit_time" type="time" />
            </div>
          </div>

          {/* ================= Passo 3 — Rota ================= */}
          <div className={step === 3 ? "space-y-4" : "hidden"}>
            <SectionHeading>Endereços</SectionHeading>

            <div className="rounded-2xl border border-navy-900/10 bg-white p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-700">
                  📍
                </span>
                <span className="font-semibold text-navy-900">Embarque</span>
              </div>
              <input
                name="pickup_address"
                value={pickup}
                onChange={(e) => setPickup(e.target.value)}
                placeholder="Endereço de embarque"
                className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3 outline-none focus:border-navy-700 focus:ring-2 focus:ring-yellow-400/40"
              />
            </div>

            <div className="rounded-2xl border border-navy-900/10 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600">
                    🏠
                  </span>
                  <div>
                    <p className="font-semibold text-navy-900">Desembarque</p>
                    <p className="text-xs text-navy-700/50">Mesmo endereço</p>
                  </div>
                </div>
                <Toggle checked={sameAddress} onChange={setSameAddress} />
              </div>
              {sameAddress ? (
                <input type="hidden" name="dropoff_address" value={pickup} />
              ) : (
                <input
                  name="dropoff_address"
                  value={dropoff}
                  onChange={(e) => setDropoff(e.target.value)}
                  placeholder="Endereço de desembarque"
                  className="mt-3 w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3 outline-none focus:border-navy-700 focus:ring-2 focus:ring-yellow-400/40"
                />
              )}
            </div>

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
  // Slot de foto circular (visual do print "ADICIONAR FOTO"). Sem upload ainda —
  // a foto real (bucket privado + RLS) é o passo dedicado seguinte.
  return (
    <div className="flex flex-col items-center">
      <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full border-2 border-dashed border-navy-900/20 bg-navy-900/5 text-navy-700/50">
        <span className="text-2xl">📷</span>
      </div>
      <span className="mt-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-navy-700/50">
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

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors ${
        checked ? "bg-yellow-400" : "bg-navy-900/15"
      }`}
      aria-pressed={checked}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-bold text-navy-900">{children}</h2>;
}

function Field({
  label,
  req,
  ...props
}: { label: string; req?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-navy-800">
        {label} {req && <span className="text-yellow-500">*</span>}
      </span>
      <input
        {...props}
        className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3 outline-none focus:border-navy-700 focus:ring-2 focus:ring-yellow-400/40"
      />
    </label>
  );
}
