"use client";

import { useState, useTransition, useEffect } from "react";
import { createInvite, revokeInvite } from "@/lib/actions/students";

interface Invite {
  id: string;
  token: string;
  expires_at: string;
}

export function InvitePanel({
  studentId,
  invite,
}: {
  studentId: string;
  invite: Invite | null;
}) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  const link = invite ? `${origin}/convite/${invite.token}` : "";

  function copy() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (!invite) {
    return (
      <button
        onClick={() => startTransition(() => createInvite(studentId))}
        disabled={pending}
        className="w-full rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900 disabled:opacity-60"
      >
        {pending ? "Gerando…" : "✉️ Convidar responsável"}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-navy-700/70">
        Envie este link ao responsável. Uso único — vale só para esta criança.
      </p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={link}
          className="min-w-0 flex-1 truncate rounded-xl border border-navy-900/15 bg-navy-900/[0.03] px-3 py-2 text-sm"
        />
        <button
          onClick={copy}
          className="shrink-0 rounded-xl bg-yellow-400 px-3 py-2 text-sm font-semibold text-navy-900"
        >
          {copied ? "Copiado!" : "Copiar"}
        </button>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => startTransition(() => createInvite(studentId))}
          disabled={pending}
          className="flex-1 rounded-xl border border-navy-900/15 py-2 text-sm font-medium text-navy-900"
        >
          Gerar novo link
        </button>
        <button
          onClick={() => startTransition(() => revokeInvite(invite.id, studentId))}
          disabled={pending}
          className="flex-1 rounded-xl border border-red-200 py-2 text-sm font-medium text-red-700"
        >
          Cancelar convite
        </button>
      </div>
    </div>
  );
}
