import { AppHeader, SectionTitle, Placeholder } from "@/components/ui";

export default function RotasResponsavelPage() {
  return (
    <>
      <AppHeader title="Rotas" subtitle="Hoje • Próximas • Histórico" />
      <div className="px-4 pb-6">
        <SectionTitle>Hoje</SectionTitle>
        {/* G4: fora da janela, estado inativo. */}
        <Placeholder>Sem rota ativa no momento.</Placeholder>
      </div>
    </>
  );
}
