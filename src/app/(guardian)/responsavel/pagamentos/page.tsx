import { createClient } from "@/lib/supabase/server";
import { AppHeader, Card, SectionTitle, Placeholder } from "@/components/ui";
import { centsToBRL } from "@/lib/money";

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Em aberto", cls: "bg-navy-900/5 text-navy-700/70" },
  overdue: { label: "Vencida", cls: "bg-amber-100 text-amber-800" },
  suspended: { label: "Suspensa", cls: "bg-red-100 text-red-800" },
  paid: { label: "Paga", cls: "bg-green-100 text-green-800" },
  canceled: { label: "Cancelada", cls: "bg-navy-900/5 text-navy-700/50" },
};

export default async function PagamentosResponsavelPage() {
  const supabase = await createClient();

  // RLS (invoices_select_guardian) → só faturas dos filhos vinculados.
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, status, amount_cents, due_date, billing_period, students(full_name)")
    .order("billing_period", { ascending: false });

  return (
    <>
      <AppHeader title="Pagamentos" subtitle="Mensalidade por criança" />
      <div className="px-4 pb-6">
        <SectionTitle>Faturas</SectionTitle>
        {!invoices?.length ? (
          <Placeholder>Nenhuma fatura por aqui ainda.</Placeholder>
        ) : (
          <div className="space-y-2">
            {invoices.map((i) => {
              const st = STATUS[i.status] ?? STATUS.pending;
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
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}
                  >
                    {st.label}
                  </span>
                </Card>
              );
            })}
          </div>
        )}

        <p className="mt-4 rounded-xl bg-yellow-400/15 px-3 py-2.5 text-sm text-navy-800">
          No piloto, o pagamento é por <b>Pix direto ao motorista</b>. Ele
          confirma o recebimento e a fatura fica “Paga”.
        </p>
      </div>
    </>
  );
}
