"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { brlToCents } from "@/lib/money";

export type ExpenseState = { error: string | null; ok?: boolean };

const CATEGORIES = ["combustivel", "manutencao", "outros"] as const;
type Category = (typeof CATEGORIES)[number];

// R11 — lança uma despesa do motorista. RLS (driver_expenses_all_owner) garante
// driver_id = auth.uid(); categoria só as 3 fixas.
export async function addExpense(
  _prev: ExpenseState,
  formData: FormData,
): Promise<ExpenseState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const category = String(formData.get("category") ?? "");
  const amount_cents = brlToCents(String(formData.get("amount") ?? ""));
  const expense_date = String(formData.get("expense_date") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!CATEGORIES.includes(category as Category))
    return { error: "Escolha a categoria." };
  if (!amount_cents) return { error: "Valor inválido." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expense_date))
    return { error: "Data inválida." };

  const { error } = await supabase.from("driver_expenses").insert({
    driver_id: user.id,
    category: category as Category,
    amount_cents,
    expense_date,
    note,
  });
  if (error) return { error: error.message };

  revalidatePath("/motorista/financeiro");
  return { error: null, ok: true };
}

export async function deleteExpense(id: string) {
  const supabase = await createClient();
  await supabase.from("driver_expenses").delete().eq("id", id);
  revalidatePath("/motorista/financeiro");
}
