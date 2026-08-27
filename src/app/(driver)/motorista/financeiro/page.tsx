import { AppHeader, Card, SectionTitle, Placeholder } from "@/components/ui";

export default function FinanceiroPage() {
  return (
    <>
      <AppHeader title="Financeiro" subtitle="Gestão inteligente" />
      <div className="px-4 pb-6">
        <SectionTitle>A receber</SectionTitle>
        {/* Mockup 4B: "A receber" (não "Próximo repasse" — sem intermediação de fundos). */}
        <Card>
          <p className="text-3xl font-bold text-navy-900">R$ 0,00</p>
          <p className="text-sm text-navy-700/60">Nenhuma fatura em aberto.</p>
        </Card>

        <SectionTitle>Régua de cobrança</SectionTitle>
        <Placeholder>
          Lembretes automáticos • Suspensão sempre passa por confirmação (G3).
          Tolerância mínima: 2 dias.
        </Placeholder>
      </div>
    </>
  );
}
