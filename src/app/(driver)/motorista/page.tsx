import { getCurrentUser } from "@/lib/auth";
import { AppHeader, Card, SectionTitle, Placeholder } from "@/components/ui";

export default async function DriverHome() {
  const user = await getCurrentUser();

  return (
    <>
      <AppHeader
        title={`Olá, ${user?.fullName.split(" ")[0] ?? "motorista"}`}
        subtitle="Sua operação de hoje"
        showSignOut
      />

      <div className="px-4 pb-6">
        <SectionTitle>Rota de hoje</SectionTitle>
        {/* Home motorista — mockup 4B. Sem selo "Rota Otimizada" (fase 2). */}
        <Card>
          <p className="text-sm text-navy-700/70">
            Nenhuma rota configurada ainda. Cadastre alunos e monte a primeira
            rota para começar.
          </p>
          <button className="mt-3 w-full rounded-xl bg-navy-900 py-3 font-semibold text-yellow-400">
            Iniciar rota
          </button>
        </Card>

        <SectionTitle>Atalhos</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Placeholder>➕ Adicionar aluno</Placeholder>
          <Placeholder>✉️ Convidar responsável</Placeholder>
        </div>

        <SectionTitle>Avisos</SectionTitle>
        <Placeholder>Sem pendências financeiras a revisar.</Placeholder>
      </div>
    </>
  );
}
