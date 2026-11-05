"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type AuthState } from "@/lib/actions/auth";
import { Logo } from "@/components/Logo";

const initial: AuthState = { error: null };

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, initial);

  return (
    <main className="flex min-h-dvh flex-col bg-yellow-400">
      {/* Hero: amarelo sólido com a marca. O símbolo é amarelo, então vai num selo branco para não sumir. */}
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="rounded-3xl bg-white px-6 py-5 shadow-sm">
          <Logo variant="vertical" className="w-44" />
        </div>
      </div>

      {/* Card branco com o formulário */}
      <div className="rounded-t-[2rem] bg-white px-6 pb-10 pt-8">
        <div className="mx-auto max-w-sm">
          <form action={action} className="space-y-4">
            <Field
              label="E-mail"
              name="email"
              type="email"
              autoComplete="email"
            />
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
            <Link
              href="/cadastro"
              className="font-semibold text-navy-900 underline"
            >
              Cadastre-se
            </Link>
          </p>
          <p className="mt-2 text-center text-xs text-navy-700/50">
            Responsáveis entram pelo link de convite do motorista.
          </p>
          <p className="mt-4 text-center text-sm text-navy-700/70">
            Procura um motorista para o seu filho?{" "}
            <Link
              href="/buscar"
              className="font-semibold text-navy-900 underline"
            >
              Buscar motoristas
            </Link>
          </p>
        </div>
      </div>
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
