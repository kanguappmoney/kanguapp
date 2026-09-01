import Link from "next/link";
import { ArrowLeft, ShieldCheck, Lock } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SectionTitle } from "@/components/ui";
import { ToleranceStepper } from "@/components/ToleranceStepper";

export default async function ReguaPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("driver_profiles")
    .select("default_tolerance_days")
    .eq("user_id", user!.id)
    .single();

  return (
    <>
      <header className="flex items-center gap-3 border-b border-navy-900/10 bg-white px-4 pb-5 pt-6 text-navy-900">
        <Link href="/motorista/financeiro" className="text-navy-900/70">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-lg font-bold text-navy-900">Régua de cobrança</h1>
      </header>

      <div className="px-4 pb-8">
        <SectionTitle>Tolerância</SectionTitle>
        <ToleranceStepper initial={profile?.default_tolerance_days ?? 2} />
        <p className="mt-2 px-1 text-xs text-navy-700/50">
          Mínimo de 2 dias. É a folga entre o vencimento e o momento em que a
          suspensão pode ser considerada.
        </p>

        <SectionTitle>Suspensão</SectionTitle>
        <div className="flex items-start gap-3 rounded-2xl border border-navy-900/10 bg-navy-900/[0.03] p-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <p className="flex items-center gap-1 font-semibold text-navy-900">
              Suspender só após aviso entregue
              <Lock className="h-3.5 w-3.5 text-navy-700/50" />
            </p>
            <p className="text-sm text-navy-700/60">
              <b>Obrigatório (G3).</b> O sistema nunca suspende sozinho: exige o
              aviso definitivo com entrega confirmada. Se a entrega falha, escala
              para você decidir. Não é configurável.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
