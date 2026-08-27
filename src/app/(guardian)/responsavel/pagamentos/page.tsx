import { AppHeader, SectionTitle, Placeholder } from "@/components/ui";

export default function PagamentosResponsavelPage() {
  return (
    <>
      <AppHeader title="Pagamentos" subtitle="Mensalidade por criança" />
      <div className="px-4 pb-6">
        <SectionTitle>Em aberto</SectionTitle>
        {/* Piloto: Pix-only. Cartão/boleto ficam como slot de UI, sem função. */}
        <Placeholder>Nenhuma fatura em aberto.</Placeholder>
      </div>
    </>
  );
}
