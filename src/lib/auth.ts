import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type UserRole = "driver" | "guardian";

export interface AppUser {
  id: string;
  email: string | null;
  role: UserRole;
  fullName: string;
}

// Lê o usuário logado + o papel (public.users). Retorna null se não autenticado.
//
// `cache()` do React: dentro de UMA mesma requisição (layout + página + cabeçalho chamam isto várias vezes) a
// leitura roda uma vez só — menos idas à API de autenticação e menos consultas ao banco por tela. O cache vale só
// para a requisição em curso, nunca entre usuários ou requisições.
export const getCurrentUser = cache(async function getCurrentUser(): Promise<AppUser | null> {
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
});

// Caminho da home de cada papel.
export function homePathForRole(role: UserRole): string {
  return role === "driver" ? "/motorista" : "/responsavel";
}
