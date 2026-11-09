"use client";

import { StatusPill } from "@/components/patterns";
import { useState, useTransition } from "react";
import { Check, X, MapPin, Phone, Cake, School } from "lucide-react";
import { approveSubmission, rejectSubmission } from "@/lib/actions/capture";

export interface Submission {
  id: string;
  child_full_name: string;
  child_birth_date: string | null;
  pickup_address: string | null;
  pickup_lat: number | null;
  dropoff_same: boolean;
  dropoff_address: string | null;
  responsible_phone: string | null;
  responsible_whatsapp: string | null;
  // Só nos pedidos vindos do link genérico (vitrine): o que o pai informou.
  child_school: string | null;
  child_shift: "morning" | "afternoon" | "integral" | null;
}

const SHIFT_LABEL = { morning: "Manhã", afternoon: "Tarde", integral: "Integral" } as const;

export function ApprovalList({ submissions }: { submissions: Submission[] }) {
  if (submissions.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-navy-900/15 p-6 text-center text-sm text-navy-700/60">
        Nenhum cadastro aguardando aprovação.
      </div>
    );
  }
  return (
    <div className="mt-4 space-y-3">
      {submissions.map((s) => (
        <ApprovalCard key={s.id} sub={s} />
      ))}
    </div>
  );
}

function ApprovalCard({ sub }: { sub: Submission }) {
  const [pending, startTransition] = useTransition();
  const [confirmReject, setConfirmReject] = useState(false);

  const phone = sub.responsible_whatsapp || sub.responsible_phone;

  return (
    <div className="space-y-3 rounded-2xl border border-navy-900/5 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-navy-900">{sub.child_full_name}</p>
        <StatusPill tone="pending">Pendente</StatusPill>
      </div>

      <div className="space-y-1.5 text-sm text-navy-700/80">
        {sub.child_school && (
          <Row icon={<School className="h-4 w-4 text-navy-700/50" />}>
            {sub.child_school}
            {sub.child_shift && ` · ${SHIFT_LABEL[sub.child_shift]}`}
            <span className="ml-1 text-xs text-navy-700/50">(informado pelo pai)</span>
          </Row>
        )}
        {sub.child_birth_date && (
          <Row icon={<Cake className="h-4 w-4 text-navy-700/50" />}>
            {formatDate(sub.child_birth_date)}
          </Row>
        )}
        {sub.pickup_address && (
          <Row icon={<MapPin className="h-4 w-4 text-navy-700/50" />}>
            {sub.pickup_address}
            {sub.pickup_lat != null && (
              <span className="ml-1 text-xs text-green-700">· localizado</span>
            )}
          </Row>
        )}
        {!sub.dropoff_same && sub.dropoff_address && (
          <Row icon={<MapPin className="h-4 w-4 text-navy-700/50" />}>
            Desembarque: {sub.dropoff_address}
          </Row>
        )}
        {phone && (
          <Row icon={<Phone className="h-4 w-4 text-navy-700/50" />}>{phone}</Row>
        )}
      </div>

      {confirmReject ? (
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm text-navy-700/70">Recusar este cadastro?</span>
          <button
            onClick={() => setConfirmReject(false)}
            className="rounded-xl border border-navy-900/15 px-3 py-2 text-sm font-medium text-navy-900"
          >
            Voltar
          </button>
          <button
            onClick={() => startTransition(() => rejectSubmission(sub.id))}
            disabled={pending}
            className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Recusar
          </button>
        </div>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={() => setConfirmReject(true)}
            disabled={pending}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-red-200 py-2 text-sm font-medium text-red-700 disabled:opacity-60"
          >
            <X className="h-4 w-4" />
            Recusar
          </button>
          <button
            onClick={() => startTransition(() => approveSubmission(sub.id))}
            disabled={pending}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-yellow-400 py-2 text-sm font-semibold text-navy-900 disabled:opacity-60"
          >
            <Check className="h-4 w-4" />
            {pending ? "…" : "Aprovar"}
          </button>
        </div>
      )}
    </div>
  );
}

function Row({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
