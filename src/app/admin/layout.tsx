import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { AdminNav } from "@/components/admin/AdminNav";
import AcessoNegadoPage from "@/app/acesso-negado/page";

export const metadata: Metadata = {
  title: "Admin — Kangu",
  robots: { index: false, follow: false },
};

// Área restrita (somente leitura). O middleware já responde 403 a quem não é admin; esta é a
// SEGUNDA camada (se algo passar pelo middleware, o layout não renderiza nada) e a TERCEIRA
// está no banco: as funções admin_* recusam (42501) quem não está em `admin_users`.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) return <AcessoNegadoPage />;

  return (
    <div className="min-h-dvh bg-cloud">
      <header className="border-b border-navy-900/10 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Logo variant="icon" className="h-9 w-9" />
            <div>
              <h1 className="font-display text-lg text-navy-900">Admin Kangu</h1>
              <p className="text-xs text-navy-700/60">Área restrita</p>
            </div>
          </div>
          <AdminNav />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
