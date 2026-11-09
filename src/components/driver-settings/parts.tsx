import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Peças compartilhadas das telas de Configurações (uma tela por categoria, cada uma com cabeçalho e Salvar).

export function SettingsHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="flex items-center gap-3 border-b border-navy-900/10 bg-white px-4 pb-5 pt-6 text-navy-900">
      <Link href="/motorista/perfil" aria-label="Voltar para Configurações" className="text-navy-900/70">
        <ArrowLeft className="h-6 w-6" />
      </Link>
      <div>
        <h1 className="text-lg font-bold text-navy-900">{title}</h1>
        {subtitle && <p className="text-xs text-navy-700/60">{subtitle}</p>}
      </div>
    </header>
  );
}

export function Field({
  label,
  onDark = false,
  ...props
}: { label: string; onDark?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className={`mb-1 block text-sm font-medium ${onDark ? "text-white/80" : "text-navy-800"}`}>{label}</span>
      <input
        {...props}
        className={`w-full rounded-xl border bg-white px-3 py-3 text-navy-900 outline-none focus:ring-2 focus:ring-yellow-400/40 ${
          onDark ? "border-white/20 focus:border-yellow-400" : "border-navy-900/15 focus:border-navy-700"
        }`}
      />
    </label>
  );
}

export function SaveBar({ error, pending }: { error: string | null; pending: boolean }) {
  return (
    <>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900 disabled:opacity-60"
      >
        {pending ? "Salvando…" : "Salvar"}
      </button>
    </>
  );
}
