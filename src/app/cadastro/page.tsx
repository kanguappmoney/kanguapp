"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpDriver, type AuthState } from "@/lib/actions/auth";

const initial: AuthState = { error: null };

export default function CadastroPage() {
  const [state, action, pending] = useActionState(signUpDriver, initial);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-900 text-2xl">
          🦘
        </div>
        <h1 className="text-2xl font-bold text-navy-900">Criar conta</h1>
        <p className="text-sm text-navy-700/70">Para motoristas de van escolar.</p>
      </div>

      <form action={action} className="space-y-4">
        <Field label="Nome completo" name="full_name" autoComplete="name" />
        <Field label="E-mail" name="email" type="email" autoComplete="email" />
        <Field
          label="Senha (mín. 8 caracteres)"
          name="password"
          type="password"
          autoComplete="new-password"
        />

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
          {pending ? "Criando…" : "Criar conta"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-navy-700/70">
        Já tem conta?{" "}
        <Link href="/login" className="font-semibold text-navy-900 underline">
          Entrar
        </Link>
      </p>
    </main>
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
        required
        className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3 outline-none focus:border-navy-700 focus:ring-2 focus:ring-yellow-400/40"
      />
    </label>
  );
}
