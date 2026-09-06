import Link from "next/link";
import { AppHeader, SectionTitle } from "@/components/ui";
import { RouteRunList } from "@/components/RouteRunList";
import { getRoutesWithTodayExecs } from "@/lib/routes-today";

export default async function RotasPage() {
  const { routes, execByLeg } = await getRoutesWithTodayExecs();

  return (
    <>
      <AppHeader title="Rotas" subtitle="Suas rotas e o dia de hoje" />
      <div className="px-4 pb-6">
        <div className="mt-4">
          <Link
            href="/motorista/rotas/nova"
            className="block w-full rounded-xl bg-yellow-400 py-3 text-center font-semibold text-navy-900"
          >
            ➕ Nova rota
          </Link>
        </div>

        <SectionTitle>Minhas rotas</SectionTitle>
        {/* Gerenciar: Editar ligado. A home consome o mesmo componente sem ele. */}
        <RouteRunList
          routes={routes}
          execByLeg={execByLeg}
          showEdit
          emptyText="Nenhuma rota ainda. Crie uma e escolha os alunos e a ordem das paradas."
        />
      </div>
    </>
  );
}
