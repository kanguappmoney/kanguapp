"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type AuthState } from "@/lib/actions/auth";

const initial: AuthState = { error: null };

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, initial);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-900 text-2xl">
          🦘
        </div>
        <h1 className="text-2xl font-bold text-navy-900">Kangu</h1>
        <p className="text-sm text-navy-700/70">Transporte escolar, sem susto.</p>
      </div>

      <form action={action} className="space-y-4">
        <Field label="E-mail" name="email" type="email" autoComplete="email" />
        <Field
          label="Senha"
          name="password"
          type="password"
          autoComplete="current-password"
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
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-navy-700/70">
        É motorista e ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-semibold text-navy-900 underline">
          Cadastre-se
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-navy-700/50">
        Responsáveis entram pelo link de convite do motorista.
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
