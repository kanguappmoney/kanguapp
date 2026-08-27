import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { RouteBuilder } from "@/components/RouteBuilder";

export default async function NovaRotaPage() {
  const supabase = await createClient();
  const { data: students } = await supabase
    .from("students")
    .select("id, full_name, school")
    .eq("status", "active")
    .order("full_name");

  return (
    <>
      <header className="flex items-center gap-3 bg-navy-900 px-4 pb-5 pt-6 text-white">
        <Link href="/motorista/rotas" className="text-white/70">
          ←
        </Link>
        <h1 className="text-lg font-bold">Nova rota</h1>
      </header>
      <div className="px-4 pb-8">
        <RouteBuilder students={students ?? []} />
      </div>
    </>
  );
}
