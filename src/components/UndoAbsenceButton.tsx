"use client";

import { useState, useTransition } from "react";
import { undoAbsence } from "@/lib/actions/absences";

export function UndoAbsenceButton({ absenceId }: { absenceId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const res = await undoAbsence(absenceId);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="text-right">
      <button
        onClick={onClick}
        disabled={pending}
        className="text-sm font-medium text-red-700 underline disabled:opacity-50"
      >
        {pending ? "Desfazendo…" : "Desfazer"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
