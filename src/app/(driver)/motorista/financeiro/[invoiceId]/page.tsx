import Link from "next/link";
import { INVOICE_STATUS } from "@/lib/pay-status";
import { StatusPill, StepDot } from "@/components/patterns";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, SectionTitle } from "@/components/ui";
import { InvoiceActions } from "@/components/InvoiceActions";
import { centsToBRL } from "@/lib/money";


const EVENT_LABEL: Record<string, string> = {
  reminder_sent: "Lembrete enviado",
  final_warning_sent: "Aviso definitivo enviado",
  final_warning_delivered: "Entrega do aviso confirmada",
  final_warning_failed: "Falha ao entregar o aviso",
  marked_overdue: "Marcada como vencida",
  suspended: "Atendimento suspenso",
  paid: "Pagamento confirmado",
  reactivated: "Reativada",
  driver_override: "Decisão do motorista",
  canceled: "Cancelada",
};

function dt(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, status, amount_cents, due_date, tolerance_days, students(full_name)")
    .eq("id", invoiceId)
    .single();
  if (!invoice) notFound();

  const { data: events } = await supabase
    .from("invoice_events")
    .select("type, delivered_at, created_at")
    .eq("invoice_id", invoiceId)
    .order("created_at");

  const has = (t: string) => (events ?? []).some((e) => e.type === t);
  const st = INVOICE_STATUS[invoice.status] ?? INVOICE_STATUS.pending;
  // @ts-expect-error relação aninhada do supabase-js
  const name = invoice.students?.full_name ?? "Aluno";

  return (
    <>
      <header className="flex items-center gap-3 border-b border-navy-900/10 bg-white px-4 pb-5 pt-6 text-navy-900">
        <Link href="/motorista/financeiro" className="text-navy-900/70">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-lg font-bold text-navy-900">Detalhe da mensalidade</h1>
      </header>

      <div className="px-4 pb-8">
        <Card className="mt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-bold text-navy-900">{name}</p>
              <p className="text-sm text-navy-700/60">
                {centsToBRL(invoice.amount_cents)} • vence{" "}
                {invoice.due_date.slice(8, 10)}/{invoice.due_date.slice(5, 7)} •
                tolerância {invoice.tolerance_days}d
              </p>
            </div>
            <StatusPill tone={st.tone}>{st.label}</StatusPill>
          </div>
        </Card>

        <SectionTitle>Ações</SectionTitle>
        <InvoiceActions
          invoiceId={invoiceId}
          status={invoice.status}
          hasSent={has("final_warning_sent")}
          hasDelivered={has("final_warning_delivered")}
          hasFailed={has("final_warning_failed")}
        />

        <SectionTitle>Régua de cobrança</SectionTitle>
        {!events?.length ? (
          <Card className="text-sm text-navy-700/60">Nenhum evento ainda.</Card>
        ) : (
          <Card>
            <ol>
              {events.map((e, i) => {
                const last = i === events.length - 1;
                return (
                  <li key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <StepDot size="sm" state={last ? "current" : "done"}>
                        {last ? i + 1 : "✓"}
                      </StepDot>
                      {!last && <span className="w-0.5 flex-1 bg-navy-900" />}
                    </div>
                    <div className={`flex flex-1 items-start justify-between gap-2 text-sm ${last ? "" : "pb-3"}`}>
                      <span className="pt-0.5 text-navy-900">
                        {EVENT_LABEL[e.type] ?? e.type}
                        {e.type === "final_warning_delivered" && <span className="ml-1 text-green-700">✓</span>}
                      </span>
                      <span className="pt-1 text-xs text-navy-700/40">{dt(e.created_at)}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        )}
      </div>
    </>
  );
}
