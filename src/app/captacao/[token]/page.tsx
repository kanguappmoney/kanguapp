import { School, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { CaptureForm } from "@/components/CaptureForm";

interface Preview {
  status: "active" | "revoked";
  shift: "morning" | "afternoon" | "integral";
  school: string;
  school_address: string | null;
  entry_time: string | null;
  exit_time: string | null;
  driver_name: string;
}

const SHIFT_LABEL: Record<Preview["shift"], string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  integral: "Integral",
};

export default async function CaptacaoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_capture_link_preview", {
    p_token: token,
  });
  const preview = data as Preview | null;
  const invalid = !preview || preview.status !== "active";

  const user = await getCurrentUser();
  const isDriver = user?.role === "driver";
  const needsAccount = !user; // sem sessão => o form cria a conta (guardian)

  const times =
    preview?.entry_time || preview?.exit_time
      ? [preview?.entry_time?.slice(0, 5), preview?.exit_time?.slice(0, 5)]
          .filter(Boolean)
          .join(" – ")
      : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col px-6 py-10">
      <div className="mb-6 text-center">
        <Logo variant="icon" className="mx-auto mb-3 h-16 w-16" />
        <h1 className="text-xl font-bold text-navy-900">Cadastro Kangu</h1>
      </div>

      {invalid ? (
        <div className="rounded-2xl bg-white p-5 text-center text-sm text-navy-700/70 shadow-sm">
          {!preview
            ? "Link não encontrado."
            : "Este link foi revogado pelo motorista. Peça um novo."}
        </div>
      ) : isDriver ? (
        <div className="rounded-2xl bg-white p-5 text-center text-sm text-navy-700/70 shadow-sm">
          Você está conectado como motorista. Abra este link como responsável (ou
          saia da conta) para cadastrar uma criança.
        </div>
      ) : (
        <>
          <div className="mb-5 space-y-2 rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm text-navy-700/70">
              <span className="font-semibold text-navy-900">
                {preview.driver_name}
              </span>{" "}
              está captando alunos do turno{" "}
              <span className="font-semibold text-navy-900">
                {SHIFT_LABEL[preview.shift]}
              </span>
              .
            </p>
            <div className="flex items-start gap-2 text-sm text-navy-800">
              <School className="mt-0.5 h-4 w-4 shrink-0 text-navy-700/60" />
              <span>
                {preview.school}
                {preview.school_address && (
                  <span className="block text-navy-700/60">
                    {preview.school_address}
                  </span>
                )}
              </span>
            </div>
            {times && (
              <div className="flex items-center gap-2 text-sm text-navy-800">
                <Clock className="h-4 w-4 shrink-0 text-navy-700/60" />
                <span>{times}</span>
              </div>
            )}
          </div>

          <CaptureForm token={token} needsAccount={needsAccount} />
        </>
      )}
    </main>
  );
}
