"use client";

import { INVOICE_STATUS } from "@/lib/pay-status";
import { StatusPill } from "@/components/patterns";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, ChevronRight, Receipt, RefreshCw, SlidersHorizontal, Wallet } from "lucide-react";
import { Section } from "@/components/ui";
import { centsToBRL } from "@/lib/money";
import {
  setStudentFee,
  generateMonthlyInvoices,
  markOverdueInvoices,
} from "@/lib/actions/invoices";

interface Student {
  id: string;
  full_name: string;
  monthly_fee_cents: number | null;
}
interface Invoice {
  id: string;
  student_id: string;
  status: string;
  amount_cents: number;
  due_date: string;
  name: string;
}


export function FinanceiroPanel({
  students,
  invoices,
}: {
  students: Student[];
  invoices: Invoice[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const aReceber = invoices
    .filter((i) => i.status === "pending" || i.status === "overdue" || i.status === "suspended")
    .reduce((s, i) => s + i.amount_cents, 0);

  function run(fn: () => Promise<{ error: string | null }>) {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setMsg(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* A receber — azul-marinho: o número que importa */}
      <div className="rounded-2xl bg-navy-900 p-5 text-white">
        <p className="text-sm text-white/60">A receber neste mês</p>
        <p className="mt-1 text-3xl font-bold">{centsToBRL(aReceber)}</p>
        <p className="mt-1 text-xs text-white/50">
          Faturas em aberto, vencidas e suspensas. No piloto, o pai paga por Pix
          direto a você.
        </p>
      </div>

      {msg && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>
      )}

      {/* Ações do mês — creme: o que fazer agora */}
      <Section tone="cream" icon={CalendarCheck} title="Ações do mês" className="space-y-2">
        <button
          onClick={() => run(generateMonthlyInvoices)}
          disabled={pending}
          className="w-full rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900 disabled:opacity-60"
        >
          {pending ? "Processando…" : "Gerar faturas do mês"}
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => run(markOverdueInvoices)}
            disabled={pending}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-navy-900/15 bg-white py-2.5 text-sm font-semibold text-navy-900 disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4" /> Atualizar vencidas
          </button>
          <Link
            href="/motorista/financeiro/regua"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-navy-900/15 bg-white py-2.5 text-sm font-semibold text-navy-900"
          >
            <SlidersHorizontal className="h-4 w-4" /> Régua
          </Link>
        </div>
      </Section>

      {/* Faturas do mês */}
      <Section icon={Receipt} title="Faturas do mês">
        {!invoices.length ? (
          <p className="text-sm text-navy-700/60">Nenhuma fatura gerada neste mês.</p>
        ) : (
          <div className="space-y-2">
            {invoices.map((i) => {
              const st = INVOICE_STATUS[i.status] ?? INVOICE_STATUS.pending;
              return (
                <Link
                  key={i.id}
                  href={`/motorista/financeiro/${i.id}`}
                  className="flex items-center justify-between rounded-xl border border-navy-900/10 bg-white p-3"
                >
                  <div>
                    <p className="font-semibold text-navy-900">{i.name}</p>
                    <p className="text-sm text-navy-700/60">
                      {centsToBRL(i.amount_cents)} • vence {i.due_date.slice(8, 10)}/{i.due_date.slice(5, 7)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill tone={st.tone}>{st.label}</StatusPill>
                    <ChevronRight className="h-5 w-5 text-navy-700/30" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Section>

      {/* Mensalidade por aluno */}
      <Section icon={Wallet} title="Mensalidade por aluno">
        {!students.length ? (
          <p className="text-sm text-navy-700/60">Cadastre alunos para definir mensalidades.</p>
        ) : (
          <div className="space-y-2">
            {students.map((s) => (
              <FeeRow key={s.id} student={s} disabled={pending} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function FeeRow({ student, disabled }: { student: Student; disabled: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(
    student.monthly_fee_cents != null
      ? (student.monthly_fee_cents / 100).toFixed(2).replace(".", ",")
      : "",
  );
  const [saving, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await setStudentFee(student.id, value);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-navy-900/10 bg-white p-3">
      <span className="flex-1 text-sm font-medium text-navy-900">
        {student.full_name}
      </span>
      <div className="flex items-center gap-1 rounded-lg border border-navy-900/15 px-2">
        <span className="text-sm text-navy-700/50">R$</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0,00"
          inputMode="decimal"
          className="w-20 py-2 text-sm outline-none"
        />
      </div>
      <button
        onClick={save}
        disabled={disabled || saving}
        className="rounded-lg bg-navy-900 px-3 py-2 text-sm font-semibold text-yellow-400 disabled:opacity-50"
      >
        {saving ? "…" : "Salvar"}
      </button>
    </div>
  );
}
