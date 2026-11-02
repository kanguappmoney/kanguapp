import Link from "next/link";
import { Plus } from "lucide-react";
import { AppHeader, SectionTitle } from "@/components/ui";
import { DriverActions } from "@/components/DriverHeaderActions";
import { RouteRunList } from "@/components/RouteRunList";
import { getRoutesWithTodayExecs } from "@/lib/routes-today";

export default async function RotasPage() {
  const { routes, execByLeg } = await getRoutesWithTodayExecs();

  return (
    <>
      <AppHeader
        title="Rotas"
        subtitle="Suas rotas e o dia de hoje"
        actions={<DriverActions />}
      />
      <div className="px-4 pb-6">
        <div className="mt-4">
          <Link
            href="/motorista/rotas/nova"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900"
          >
            <Plus className="h-4 w-4" /> Nova rota
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
