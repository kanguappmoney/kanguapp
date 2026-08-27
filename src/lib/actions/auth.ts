"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { homePathForRole } from "@/lib/auth";

export type AuthState = { error: string | null };

// Login por e-mail/senha (sem biometria — decisão do progresso.md, seção 4B).
export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "E-mail ou senha inválidos." };

  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user!.id)
    .single();

  revalidatePath("/", "layout");
  redirect(homePathForRole((data?.role as "driver" | "guardian") ?? "guardian"));
}

// Cadastro do MOTORISTA (cliente pagante, faz self-onboarding).
// Responsáveis NÃO se cadastram aqui — entram por convite (fase de convite).
// O papel vai no metadata; o trigger handle_new_user cria o perfil.
export async function signUpDriver(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "");

  if (password.length < 8)
    return { error: "A senha precisa de ao menos 8 caracteres." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role: "driver", full_name: fullName } },
  });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/motorista");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
