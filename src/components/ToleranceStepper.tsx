"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { setDefaultTolerance } from "@/lib/actions/invoices";

export function ToleranceStepper({ initial }: { initial: number }) {
  const router = useRouter();
  const [days, setDays] = useState(Math.max(2, initial));
  const [pending, start] = useTransition();

  function change(next: number) {
    if (next < 2) return; // piso de 2 dias
    setDays(next);
    start(async () => {
      await setDefaultTolerance(next);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between rounded-2xl border border-navy-900/10 bg-white p-4">
      <div>
        <p className="font-semibold text-navy-900">Tolerância</p>
        <p className="text-sm text-navy-700/60">Folga após o vencimento</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => change(days - 1)}
          disabled={pending || days <= 2}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-navy-900/15 text-navy-900 disabled:opacity-30"
          aria-label="Diminuir"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-16 text-center font-semibold text-navy-900">
          {days} {days === 1 ? "dia" : "dias"}
        </span>
        <button
          onClick={() => change(days + 1)}
          disabled={pending}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-navy-900/15 text-navy-900 disabled:opacity-30"
          aria-label="Aumentar"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
