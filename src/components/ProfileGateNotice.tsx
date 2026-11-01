import Link from "next/link";
import { AlertTriangle } from "lucide-react";

// Aviso do portão de perfil completo (lib/profile-gate): aparece no lugar das
// ações bloqueadas e leva direto para completar o veículo em Configurações.
export function ProfileGateNotice({
  missing,
  action,
}: {
  missing: string[];
  action: string; // o que está bloqueado, ex.: "cadastrar alunos"
}) {
  return (
    <div className="rounded-2xl border border-yellow-400/60 bg-yellow-400/10 p-4">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-navy-900" />
        <div className="min-w-0">
          <p className="font-semibold text-navy-900">Complete seu perfil</p>
          <p className="mt-1 text-sm text-navy-700/80">
            Para {action}, preencha os dados do veículo em Configurações
            {missing.length ? ` (falta: ${missing.join(", ")})` : ""}.
          </p>
          <Link
            href="/motorista/perfil/editar"
            className="mt-3 inline-flex rounded-xl bg-yellow-400 px-4 py-2 text-sm font-semibold text-navy-900"
          >
            Ir para Configurações
          </Link>
        </div>
      </div>
    </div>
  );
}
