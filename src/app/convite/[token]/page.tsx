import { createClient } from "@/lib/supabase/server";
import { AcceptForm } from "@/components/AcceptForm";
import { Logo } from "@/components/Logo";

interface Preview {
  status: "pending" | "accepted" | "revoked" | "expired";
  expired: boolean;
  student_name: string;
  driver_name: string;
}

export default async function ConvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_invite_preview", { p_token: token });
  const preview = data as Preview | null;

  const invalid =
    !preview ||
    preview.status !== "pending" ||
    preview.expired;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-6 text-center">
        <Logo variant="icon" className="mx-auto mb-3 h-16 w-16" />
        <h1 className="text-xl font-bold text-navy-900">Convite Kangu</h1>
      </div>

      {invalid ? (
        <div className="rounded-2xl bg-white p-5 text-center text-sm text-navy-700/70 shadow-sm">
          {!preview
            ? "Convite não encontrado."
            : preview.status === "accepted"
              ? "Este convite já foi utilizado."
              : preview.status === "revoked"
                ? "Este convite foi cancelado pelo motorista."
                : "Este convite expirou. Peça um novo ao motorista."}
        </div>
      ) : (
        <>
          <div className="mb-5 rounded-2xl bg-white p-4 text-center shadow-sm">
            <p className="text-sm text-navy-700/70">
              <span className="font-semibold text-navy-900">
                {preview.driver_name}
              </span>{" "}
              convidou você para acompanhar
            </p>
            <p className="mt-1 text-lg font-bold text-navy-900">
              {preview.student_name}
            </p>
          </div>
          <AcceptForm token={token} />
        </>
      )}
    </main>
  );
}
