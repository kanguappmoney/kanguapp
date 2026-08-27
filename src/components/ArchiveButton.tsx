"use client";

import { useTransition } from "react";
import { archiveStudent } from "@/lib/actions/students";

export function ArchiveButton({ studentId }: { studentId: string }) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (confirm("Arquivar este aluno? Ele sai da lista ativa, mas o histórico é mantido."))
      startTransition(() => archiveStudent(studentId));
  }

  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="w-full rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-700 disabled:opacity-60"
    >
      {pending ? "Arquivando…" : "Arquivar aluno"}
    </button>
  );
}
