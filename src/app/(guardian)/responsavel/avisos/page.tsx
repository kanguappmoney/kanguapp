import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/ui";
import { AvisoList } from "@/components/AvisoList";

export default async function AvisosPage() {
  const supabase = await createClient();

  // RLS (notifications_select_self) → só os próprios avisos, mais recentes antes.
  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, title, body, read_at, created_at")
    .order("created_at", { ascending: false });

  return (
    <>
      <AppHeader title="Avisos" subtitle="Novidades da rota" />
      <div className="px-4 pb-6">
        <AvisoList initial={notifications ?? []} />
      </div>
    </>
  );
}
