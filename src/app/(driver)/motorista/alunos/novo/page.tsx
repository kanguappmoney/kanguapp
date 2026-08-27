"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createStudent, type StudentFormState } from "@/lib/actions/students";

const initial: StudentFormState = { error: null };

export default function NovoAlunoPage() {
  const [state, action, pending] = useActionState(createStudent, initial);
  const [step, setStep] = useState(1);

  return (
    <>
      <header className="flex items-center gap-3 bg-navy-900 px-4 pb-5 pt-6 text-white">
        <Link href="/motorista/alunos" className="text-white/70">
          ←
        </Link>
        <div>
          <h1 className="text-lg font-bold">Adicionar aluno</h1>
          <p className="text-sm text-white/60">Passo {step} de 3</p>
        </div>
      </header>

      <div className="px-4 pb-8">
        <div className="mt-4 mb-5 flex gap-1.5">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`h-1.5 flex-1 rounded-full ${
                n <= step ? "bg-yellow-400" : "bg-navy-900/10"
              }`}
            />
          ))}
        </div>

        <form action={action} className="space-y-4">
          {/* Passo 1 — dados escolares */}
          <div className={step === 1 ? "space-y-4" : "hidden"}>
            <Field label="Nome completo do aluno" name="full_name" required />
            <Field label="Escola" name="school" />
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-navy-800">
                Turno
              </span>
              <select
                name="shift"
                defaultValue="morning"
                className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3"
              >
                <option value="morning">Manhã</option>
                <option value="afternoon">Tarde</option>
              </select>
            </label>
            <Field label="Turma (opcional)" name="turma" placeholder="Ex.: Turma Manhã" />
          </div>

          {/* Passo 2 — embarque */}
          <div className={step === 2 ? "space-y-4" : "hidden"}>
            <Field
              label="Endereço de embarque"
              name="pickup_address"
              placeholder="Rua, número, bairro"
            />
            <p className="text-xs text-navy-700/50">
              Só você e os responsáveis vinculados a este aluno veem o endereço.
            </p>
          </div>

          {/* Passo 3 — desembarque */}
          <div className={step === 3 ? "space-y-4" : "hidden"}>
            <Field
              label="Endereço de desembarque"
              name="dropoff_address"
              placeholder="Normalmente a escola"
            />
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
                className="flex-1 rounded-xl border border-navy-900/15 py-3 font-semibold text-navy-900"
              >
                Voltar
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="flex-1 rounded-xl bg-navy-900 py-3 font-semibold text-yellow-400"
              >
                Continuar
              </button>
            ) : (
              <button
                type="submit"
                disabled={pending}
                className="flex-1 rounded-xl bg-navy-900 py-3 font-semibold text-yellow-400 disabled:opacity-60"
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
