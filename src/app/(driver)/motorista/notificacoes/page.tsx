import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/ui";
import { AvisoList } from "@/components/AvisoList";
import { DriverActions } from "@/components/DriverHeaderActions";

// Sininho do motorista. Reaproveita o modelo dos avisos do pai (`notifications`,
// por user_id): RLS (notifications_select_self) entrega só as do próprio
// motorista. No piloto nada ainda grava notificação para o motorista — a tela
// mostra o estado vazio até existir um gerador.
export default async function NotificacoesPage() {
  const supabase = await createClient();

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, title, body, read_at, created_at")
    .order("created_at", { ascending: false });

  return (
    <>
      <AppHeader
        title="Notificações"
        subtitle="Novidades da operação"
        actions={<DriverActions />}
      />
      <div className="px-4 pb-6">
        <AvisoList
          initial={notifications ?? []}
          emptyText="Nenhuma notificação"
        />
      </div>
    </>
  );
}
