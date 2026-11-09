import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { ChildAuthorization } from "@/components/ChildAuthorization";

// Autorizações do responsável: por criança, ver o estado, retirar (com confirmação), reautorizar e autorizar a foto.
export default async function AutorizacoesPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: links } = await supabase.from("guardian_student").select("student_id");
  const ids = (links ?? []).map((l) => l.student_id);
  const { data: kids } = ids.length
    ? await supabase.from("students").select("id, full_name, driver_id, consent_status").in("id", ids).order("full_name")
    : { data: [] as { id: string; full_name: string; driver_id: string; consent_status: string }[] };

  const { data: consents } = await supabase
    .from("consents")
    .select("id, kind, student_id")
    .eq("subject_user_id", user?.id ?? "")
    .is("revoked_at", null)
    .in("kind", ["child_data", "child_photo"]);

  const driverIds = [...new Set((kids ?? []).map((k) => k.driver_id))];
  const { data: drivers } = driverIds.length
    ? await supabase.from("users").select("id, full_name").in("id", driverIds)
    : { data: [] as { id: string; full_name: string }[] };
  const driverName = new Map((drivers ?? []).map((d) => [d.id, d.full_name]));

  return (
    <>
      <header className="flex items-center gap-3 border-b border-navy-900/10 bg-white px-4 pb-5 pt-6 text-navy-900">
        <Link href="/responsavel/perfil" aria-label="Voltar" className="text-navy-900/70">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-navy-900">Autorizações</h1>
          <p className="text-xs text-navy-700/60">Dados e foto de cada criança</p>
        </div>
      </header>
      <div className="space-y-4 px-4 pb-8 pt-4">
        {!kids?.length ? (
          <p className="rounded-2xl border border-dashed border-navy-900/20 p-4 text-sm text-navy-700/70">
            Nenhuma criança vinculada ainda.
          </p>
        ) : (
          kids.map((k) => (
            <ChildAuthorization
              key={k.id}
              studentId={k.id}
              childName={k.full_name}
              providerName={driverName.get(k.driver_id) ?? ""}
              suspended={k.consent_status === "suspended"}
              childConsentId={consents?.find((c) => c.student_id === k.id && c.kind === "child_data")?.id ?? null}
              photoConsentId={consents?.find((c) => c.student_id === k.id && c.kind === "child_photo")?.id ?? null}
            />
          ))
        )}
      </div>
    </>
  );
}
