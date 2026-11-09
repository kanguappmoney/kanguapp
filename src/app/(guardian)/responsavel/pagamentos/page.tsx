import { createClient } from "@/lib/supabase/server";
import { AppHeader, Card, SectionTitle, Placeholder } from "@/components/ui";
import { centsToBRL } from "@/lib/money";
import { INVOICE_STATUS } from "@/lib/pay-status";
import { StatusPill } from "@/components/patterns";


export default async function PagamentosResponsavelPage() {
  const supabase = await createClient();

  // RLS (invoices_select_guardian) → só faturas dos filhos vinculados.
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, status, amount_cents, due_date, billing_period, students(full_name)")
    .order("billing_period", { ascending: false });

  // Destaque primário da tela: quanto há a pagar (só soma o que já veio da consulta).
  const open = (invoices ?? []).filter((i) =>
    ["pending", "overdue", "suspended"].includes(i.status),
  );
  const openTotal = open.reduce((n, i) => n + i.amount_cents, 0);
  const nextDue = open.map((i) => i.due_date).sort()[0];

  return (
    <>
      <AppHeader title="Pagamentos" subtitle="Mensalidade por criança" />
      <div className="px-4 pb-6">
        {open.length > 0 && (
          <Card tone="navy" className="mt-4 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-yellow-400">
              A pagar
            </p>
            <p className="mt-1 font-display text-3xl font-semibold">
              {centsToBRL(openTotal)}
            </p>
            <p className="mt-1 text-sm text-white/70">
              {open.length} {open.length === 1 ? "fatura em aberto" : "faturas em aberto"} • próximo
              vencimento {nextDue.slice(8, 10)}/{nextDue.slice(5, 7)}
            </p>
          </Card>
        )}
        <SectionTitle>Faturas</SectionTitle>
        {!invoices?.length ? (
          <Placeholder>Nenhuma fatura por aqui ainda.</Placeholder>
        ) : (
          <div className="space-y-2">
            {invoices.map((i) => {
              const st = INVOICE_STATUS[i.status] ?? INVOICE_STATUS.pending;
              return (
                <Card key={i.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-navy-900">
                      {/* @ts-expect-error relação aninhada do supabase-js */}
                      {i.students?.full_name ?? "Criança"}
                    </p>
                    <p className="text-sm text-navy-700/60">
                      {centsToBRL(i.amount_cents)} • vence{" "}
                      {i.due_date.slice(8, 10)}/{i.due_date.slice(5, 7)}
                    </p>
                  </div>
                  <StatusPill tone={st.tone}>{st.label}</StatusPill>
                </Card>
              );
            })}
          </div>
        )}

        <p className="mt-4 rounded-xl bg-cream px-3 py-2.5 text-sm text-navy-800">
          No piloto, o pagamento é por <b>Pix direto ao motorista</b>. Ele
          confirma o recebimento e a fatura fica “Paga”.
        </p>
      </div>
    </>
  );
}
