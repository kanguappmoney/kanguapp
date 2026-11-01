import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getProfileGate } from "@/lib/profile-gate";
import { ProfileGateNotice } from "@/components/ProfileGateNotice";

// Portão de perfil completo no cadastro de aluno. A página é Client Component,
// então a checagem vive aqui (servidor): perfil incompleto → aviso no lugar do
// formulário. O saveNewStudent também recusa no servidor.
export default async function NovoAlunoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gate = await getProfileGate();
  if (gate.complete) return children;

  return (
    <>
      <header className="flex items-center gap-3 border-b border-navy-900/10 bg-white px-4 pb-5 pt-6 text-navy-900">
        <Link href="/motorista/alunos" className="text-navy-900/70">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-lg font-bold text-navy-900">Novo aluno</h1>
      </header>
      <div className="px-4 pb-8 pt-4">
        <ProfileGateNotice missing={gate.missing} action="cadastrar alunos" />
      </div>
    </>
  );
}
