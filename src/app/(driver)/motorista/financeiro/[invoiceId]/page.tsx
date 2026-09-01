import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, SectionTitle } from "@/components/ui";
import { InvoiceActions } from "@/components/InvoiceActions";
import { centsToBRL } from "@/lib/money";

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Em aberto", cls: "bg-navy-900/5 text-navy-700/70" },
  overdue: { label: "Vencida", cls: "bg-amber-100 text-amber-800" },
  suspended: { label: "Suspensa", cls: "bg-red-100 text-red-800" },
  paid: { label: "Paga", cls: "bg-green-100 text-green-800" },
  canceled: { label: "Cancelada", cls: "bg-navy-900/5 text-navy-700/50" },
};

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
  const st = STATUS[invoice.status] ?? STATUS.pending;
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
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>
              {st.label}
            </span>
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
          <Card className="space-y-2">
            {events.map((e, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-navy-900">
                  {EVENT_LABEL[e.type] ?? e.type}
                  {e.type === "final_warning_delivered" && (
                    <span className="ml-1 text-green-700">✓</span>
                  )}
                </span>
                <span className="text-xs text-navy-700/40">{dt(e.created_at)}</span>
              </div>
            ))}
          </Card>
        )}
      </div>
    </>
  );
}
