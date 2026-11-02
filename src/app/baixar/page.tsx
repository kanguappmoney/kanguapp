import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { InstallGuide } from "@/components/InstallGuide";

export const metadata: Metadata = {
  title: "Instalar o Kangu",
  description: "Instale o Kangu na tela inicial do seu celular.",
};

// Página pública (sem login) de instalação do PWA.
export default function BaixarPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col px-6 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <Logo variant="icon" className="h-20 w-20" />
        <h1 className="mt-4 font-display text-2xl text-navy-900">
          Instalar o Kangu
        </h1>
        <p className="mt-1 text-sm text-navy-700/70">
          Tenha o Kangu na tela inicial do celular, como um app.
        </p>
      </div>
      <InstallGuide />
    </main>
  );
}
