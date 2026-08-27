import { getCurrentUser } from "@/lib/auth";
import { AppHeader, Card, SectionTitle, Placeholder } from "@/components/ui";

export default async function PerfilResponsavelPage() {
  const user = await getCurrentUser();

  return (
    <>
      <AppHeader title="Perfil" showSignOut />
      <div className="px-4 pb-6">
        <SectionTitle>Você</SectionTitle>
        <Card>
          <p className="font-semibold text-navy-900">{user?.fullName}</p>
          <p className="text-sm text-navy-700/60">{user?.email}</p>
        </Card>

        <SectionTitle>Família</SectionTitle>
        <Placeholder>Crianças, locais salvos e pessoas autorizadas.</Placeholder>
      </div>
    </>
  );
}
