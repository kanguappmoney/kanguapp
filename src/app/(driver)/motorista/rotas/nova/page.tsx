import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { RouteBuilder } from "@/components/RouteBuilder";

export default async function NovaRotaPage() {
  const supabase = await createClient();
  // shift entra no select: o builder filtra os candidatos pelo turno da rota.
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
        <h1 className="text-lg font-bold text-navy-900">Nova rota</h1>
      </header>
      <div className="px-4 pb-8">
        <RouteBuilder students={students ?? []} />
      </div>
    </>
  );
}
