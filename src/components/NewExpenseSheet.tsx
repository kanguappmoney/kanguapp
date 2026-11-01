"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { ExpenseForm } from "@/components/ExpensesPanel";

// "+ Nova despesa" da Visão Geral: abre o MESMO formulário da aba Despesas
// (ExpenseForm) num bottom sheet, sem trocar de aba. Fecha ao salvar, no X,
// no fundo escurecido ou no Esc.
export function NewExpenseSheet({ defaultDate }: { defaultDate: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900"
      >
        <Plus className="h-4 w-4" /> Nova despesa
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-navy-900/40"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Nova despesa"
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[#f5f7fa] p-4 pb-6"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="mx-auto h-1 w-10 rounded-full bg-navy-900/15" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="absolute right-6 rounded-full p-1 text-navy-700/60"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <ExpenseForm defaultDate={defaultDate} onSaved={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
