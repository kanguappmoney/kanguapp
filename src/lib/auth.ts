import { createClient } from "@/lib/supabase/server";

export type UserRole = "driver" | "guardian";

export interface AppUser {
  id: string;
  email: string | null;
  role: UserRole;
  fullName: string;
}

// Lê o usuário logado + o papel (public.users). Retorna null se não autenticado.
export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    id: user.id,
    email: user.email ?? null,
    role: profile.role as UserRole,
    fullName: profile.full_name,
  };
}

// Caminho da home de cada papel.
export function homePathForRole(role: UserRole): string {
  return role === "driver" ? "/motorista" : "/responsavel";
}
