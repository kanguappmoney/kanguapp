import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/ui";
import { ApprovalList, type Submission } from "@/components/ApprovalList";

export default async function AprovacoesPage() {
  const supabase = await createClient();

  // RLS: só a fila dos links deste motorista. Mais antigos primeiro.
  const { data: subs } = await supabase
    .from("capture_submissions")
    .select(
      "id, child_full_name, child_birth_date, pickup_address, pickup_lat, dropoff_same, dropoff_address, responsible_phone, responsible_whatsapp",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  return (
    <>
      <AppHeader
        title="Cadastros a aprovar"
        subtitle="Confira antes de entrar na operação"
      />
      <div className="px-4 pb-6">
        <Link
          href="/motorista/alunos"
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-navy-700/60"
        >
          <ChevronLeft className="h-4 w-4" />
          Alunos
        </Link>

        <p className="mb-2 mt-3 text-sm text-navy-700/70">
          Cada cadastro veio de um pai pelo link de captação. A criança só entra na
          rota depois que você aprovar.
        </p>

        <ApprovalList submissions={(subs ?? []) as Submission[]} />
      </div>
    </>
  );
}
