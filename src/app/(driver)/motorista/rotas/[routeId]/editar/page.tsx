import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { RouteBuilder, type RouteToEdit } from "@/components/RouteBuilder";

export default async function EditarRotaPage({
  params,
}: {
  params: Promise<{ routeId: string }>;
}) {
  const { routeId } = await params;
  const supabase = await createClient();

  // RLS só devolve a rota do próprio motorista (routes_all_owner). Rota de outro
  // dono ou inexistente → notFound.
  const { data: route } = await supabase
    .from("routes")
    .select(
      "id, name, direction, shift, weekdays, route_stops(student_id, position, kind)",
    )
    .eq("id", routeId)
    .maybeSingle();

  if (!route) notFound();
  // Escopo desta fatia: só as rotas 'both'. Legado de uma perna não edita aqui.
  if (route.direction !== "both") redirect("/motorista/rotas");

  // Separa as duas listas, cada uma ordenada por sua própria numeração.
  const stops = (route.route_stops ?? []) as {
    student_id: string;
    position: number;
    kind: "pickup" | "dropoff";
  }[];
  const ordered = (kind: "pickup" | "dropoff") =>
    stops
      .filter((s) => s.kind === kind)
      .sort((a, b) => a.position - b.position)
      .map((s) => s.student_id);

  const toEdit: RouteToEdit = {
    id: route.id,
    name: route.name,
    shift: route.shift,
    pickup: ordered("pickup"),
    dropoff: ordered("dropoff"),
    weekdays: (route.weekdays ?? []) as number[],
  };

  const { data: students } = await supabase
    .from("students")
    .select("id, full_name, school, shift")
    .eq("status", "active")
    .order("full_name");

  return (
    <>
      <header className="flex items-center gap-3 border-b border-navy-900/10 bg-white px-4 pb-5 pt-6 text-navy-900">
        <Link href="/motorista/rotas" className="text-navy-900/70">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-lg font-bold text-navy-900">Editar rota</h1>
      </header>
      <div className="px-4 pb-8">
        <RouteBuilder students={students ?? []} route={toEdit} />
      </div>
    </>
  );
}
