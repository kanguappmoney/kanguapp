"use client";

import { useActionState, useState } from "react";
import { reportAbsence, type AbsenceState } from "@/lib/actions/absences";

const initial: AbsenceState = { error: null };

interface Child {
  id: string;
  full_name: string;
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function AbsenceForm({ children }: { children: Child[] }) {
  const [state, action, pending] = useActionState(reportAbsence, initial);
  const [studentId, setStudentId] = useState(children[0]?.id ?? "");
  const [date, setDate] = useState(iso(new Date()));
  const [leg, setLeg] = useState<"outbound" | "inbound" | "both">("both");

  const hoje = iso(new Date());
  const amanha = iso(new Date(Date.now() + 86400000));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="service_date" value={date} />
      <input type="hidden" name="leg" value={leg} />

      {children.length > 1 && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-navy-800">
            Criança
          </span>
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3"
          >
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div>
        <span className="mb-1.5 block text-sm font-medium text-navy-800">Dia</span>
        <div className="mb-2 flex gap-2">
          <Quick label="Hoje" active={date === hoje} onClick={() => setDate(hoje)} />
          <Quick label="Amanhã" active={date === amanha} onClick={() => setDate(amanha)} />
        </div>
        <input
          type="date"
          value={date}
          min={hoje}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3 outline-none focus:border-navy-700 focus:ring-2 focus:ring-yellow-400/40"
        />
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-navy-800">
          Trajeto
        </span>
        <div className="flex overflow-hidden rounded-xl border border-navy-900/15 bg-white">
          {(
            [
              { v: "outbound", l: "Ida" },
              { v: "inbound", l: "Volta" },
              { v: "both", l: "Ambos" },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setLeg(o.v)}
              className={`flex-1 py-2.5 text-sm font-semibold ${
                leg === o.v ? "bg-navy-900 text-white" : "text-navy-700/70"
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !studentId}
        className="w-full rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900 disabled:opacity-60"
      >
        {pending ? "Informando…" : "Informar ausência"}
      </button>
    </form>
  );
}

function Quick({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl border py-2 text-sm font-semibold ${
        active
          ? "border-navy-900 bg-navy-900/[0.04] text-navy-900 ring-2 ring-yellow-400/40"
          : "border-navy-900/15 text-navy-700/70"
      }`}
    >
      {label}
    </button>
  );
}
