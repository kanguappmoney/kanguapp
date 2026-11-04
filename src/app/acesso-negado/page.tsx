import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export const metadata: Metadata = {
  title: "Acesso negado — Kangu",
  robots: { index: false },
};

// Destino do 403 de /admin (rewrite do middleware) e do layout de /admin.
export default function AcessoNegadoPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
      <ShieldAlert className="h-10 w-10 text-navy-900" aria-hidden />
      <h1 className="mt-4 font-display text-xl text-navy-900">Acesso negado</h1>
      <p className="mt-2 text-sm text-navy-700/70">
        Esta área é restrita à administração do Kangu.
      </p>
      <Link href="/" className="mt-6 text-sm font-semibold text-navy-900 underline">
        Voltar ao início
      </Link>
    </main>
  );
}
