import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";
import { ShieldCheck, ChevronRight } from "lucide-react";
import { AppHeader, Card, SectionTitle, Placeholder } from "@/components/ui";
import { IconBadge } from "@/components/patterns";

export default async function PerfilResponsavelPage() {
  const user = await getCurrentUser();

  return (
    <>
      <AppHeader title="Perfil" showSignOut />
      <div className="px-4 pb-6">
        <SectionTitle>Você</SectionTitle>
        <Card tone="cream">
          <p className="font-semibold text-navy-900">{user?.fullName}</p>
          <p className="text-sm text-navy-700/60">{user?.email}</p>
        </Card>

        <SectionTitle>Privacidade</SectionTitle>
        <Link
          href="/responsavel/autorizacoes"
          className="flex items-center gap-3 rounded-2xl border border-navy-900/5 bg-white p-4 shadow-sm"
        >
          <IconBadge icon={ShieldCheck} />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-navy-900">Autorizações</span>
            <span className="block text-sm text-navy-700/60">Dados e foto das crianças: ver, retirar ou autorizar</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-navy-700/40" />
        </Link>

        <SectionTitle>Família</SectionTitle>
        <Placeholder>Crianças, locais salvos e pessoas autorizadas.</Placeholder>
      </div>
    </>
  );
}
