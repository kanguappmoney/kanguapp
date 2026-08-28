import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EditDriverForm } from "@/components/EditDriverForm";

export default async function EditarPerfilPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("driver_profiles")
    .select("address")
    .eq("user_id", user!.id)
    .single();
  const { data: userRow } = await supabase
    .from("users")
    .select("phone")
    .eq("id", user!.id)
    .single();
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("plate, model, year, color, capacity")
    .eq("driver_id", user!.id)
    .limit(1)
    .maybeSingle();

  return (
    <>
      <header className="flex items-center gap-3 border-b border-navy-900/10 bg-white px-4 pb-5 pt-6 text-navy-900">
        <Link href="/motorista/perfil" className="text-navy-900/70">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-lg font-bold text-navy-900">Editar perfil</h1>
      </header>
      <div className="px-4 pb-8">
        <EditDriverForm
          driver={{
            full_name: user?.fullName ?? "",
            email: user?.email ?? null,
            phone: userRow?.phone ?? null,
            address: profile?.address ?? null,
            plate: vehicle?.plate ?? null,
            model: vehicle?.model ?? null,
            year: vehicle?.year ?? null,
            color: vehicle?.color ?? null,
            capacity: vehicle?.capacity ?? null,
          }}
        />
      </div>
    </>
  );
}
