import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { saoPauloToday } from "@/lib/day";
import {
  ExceptionManager,
  type ExceptionRow,
} from "@/components/ExceptionManager";

export default async function ExcecoesPage({
  params,
}: {
  params: Promise<{ routeId: string }>;
}) {
  const { routeId } = await params;
  const supabase = await createClient();

  // RLS (routes_all_owner) só devolve a rota do próprio motorista. Exceções valem
  // para qualquer rota com agenda — inclusive as legadas de uma perna (weekdays
  // veio no backfill da 029), então não restringimos por direction aqui.
  const { data: route } = await supabase
    .from("routes")
    .select("id, name, weekdays")
    .eq("id", routeId)
    .maybeSingle();
  if (!route) notFound();

  const today = saoPauloToday();

  // Só o calendário de hoje pra frente — exceção retroativa não teria efeito.
  const { data: exceptions } = await supabase
    .from("route_exceptions")
    .select("id, date, kind, reason")
    .eq("route_id", routeId)
    .gte("date", today)
    .order("date", { ascending: true });

  return (
    <>
      <header className="flex items-center gap-3 border-b border-navy-900/10 bg-white px-4 pb-5 pt-6 text-navy-900">
        <Link href="/motorista/rotas" className="text-navy-900/70">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-navy-900">Exceções</h1>
          <p className="text-sm text-navy-700/60">{route.name}</p>
        </div>
      </header>
      <div className="px-4 pb-8 pt-4">
        <p className="mb-4 text-sm text-navy-700/60">
          Feriados e reposições que fogem da agenda semanal. Não bloqueiam nada —
          só mudam quando a rota aparece como programada.
        </p>
        <ExceptionManager
          routeId={route.id}
          weekdays={(route.weekdays ?? []) as number[]}
          today={today}
          exceptions={(exceptions ?? []) as ExceptionRow[]}
        />
      </div>
    </>
  );
}
