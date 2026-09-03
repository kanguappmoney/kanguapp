import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/ui";
import {
  CaptureLinkManager,
  type CaptureLink,
} from "@/components/CaptureLinkManager";

export default async function CaptacaoPage() {
  const supabase = await createClient();

  // RLS: só os links do próprio motorista. Ativos primeiro, mais novos no topo.
  const { data: links } = await supabase
    .from("capture_links")
    .select("id, shift, school, school_address, entry_time, exit_time, token")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  return (
    <>
      <AppHeader
        title="Links de captação"
        subtitle="Cada pai cadastra o próprio filho"
      />
      <div className="px-4 pb-6">
        <Link
          href="/motorista/alunos"
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-navy-700/60"
        >
          <ChevronLeft className="h-4 w-4" />
          Alunos
        </Link>

        <p className="mb-4 mt-3 text-sm text-navy-700/70">
          Gere um link por turno e escola e compartilhe com os pais daquele grupo.
          O pai preenche os dados do próprio filho; a criança só entra na operação
          depois que você aprovar.
        </p>

        <CaptureLinkManager links={(links ?? []) as CaptureLink[]} />
      </div>
    </>
  );
}
