"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, CheckCircle2, XCircle, Ban, BadgeCheck, AlertTriangle } from "lucide-react";
import {
  sendFinalWarning,
  confirmWarningDelivered,
  reportWarningFailed,
  suspendInvoice,
  markInvoicePaid,
} from "@/lib/actions/invoices";

export function InvoiceActions({
  invoiceId,
  status,
  hasSent,
  hasDelivered,
  hasFailed,
}: {
  invoiceId: string;
  status: string;
  hasSent: boolean;
  hasDelivered: boolean;
  hasFailed: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ error: string | null }>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
      router.refresh();
    });
  }

  const btn =
    "flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold disabled:opacity-60";

  if (status === "paid")
    return (
      <div className="rounded-xl bg-green-50 px-3 py-3 text-center text-sm font-medium text-green-800">
        Fatura paga. Nada a fazer.
      </div>
    );
  if (status === "canceled")
    return (
      <div className="rounded-xl bg-navy-900/5 px-3 py-3 text-center text-sm text-navy-700/60">
        Fatura cancelada.
      </div>
    );

  return (
    <div className="space-y-3">
      {status === "suspended" ? (
        <>
          <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-3 text-sm text-red-800">
            <Ban className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Atendimento suspenso. Ao registrar o pagamento, a fatura reativa e
              a criança é destravada.
            </span>
          </div>
          <button
            onClick={() => run(() => markInvoicePaid(invoiceId))}
            disabled={pending}
            className={`${btn} bg-yellow-400 text-navy-900`}
          >
            <BadgeCheck className="h-4 w-4" /> Marcar como pago (reativa)
          </button>
        </>
      ) : (
        <>
          {/* Aviso definitivo (G3) */}
          <div className="rounded-2xl border border-navy-900/10 bg-white p-4">
            <p className="mb-1 font-semibold text-navy-900">Aviso definitivo</p>
            {!hasSent ? (
              <>
                <p className="mb-3 text-sm text-navy-700/60">
                  Envie o aviso definitivo ao responsável (por fora, WhatsApp) e
                  registre aqui. A suspensão só é liberada após a entrega
                  confirmada.
                </p>
                <button
                  onClick={() => run(() => sendFinalWarning(invoiceId))}
                  disabled={pending}
                  className={`${btn} border border-navy-900/15 text-navy-900`}
                >
                  <Send className="h-4 w-4" /> Registrar aviso enviado
                </button>
              </>
            ) : hasDelivered ? (
              <div className="flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2.5 text-sm text-green-800">
                <CheckCircle2 className="h-4 w-4" /> Aviso entregue — a suspensão
                está liberada.
              </div>
            ) : (
              <>
                <p className="mb-2 text-sm text-navy-700/60">
                  Aviso enviado. Confirme se o responsável recebeu.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => run(() => confirmWarningDelivered(invoiceId))}
                    disabled={pending}
                    className={`${btn} bg-navy-900 text-yellow-400`}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Confirmar entrega
                  </button>
                  <button
                    onClick={() => run(() => reportWarningFailed(invoiceId))}
                    disabled={pending}
                    className={`${btn} border border-navy-900/15 text-navy-900`}
                  >
                    <XCircle className="h-4 w-4" /> Não consegui avisar
                  </button>
                </div>
                {hasFailed && (
                  <div className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    Não conseguimos avisar — a suspensão não é aplicada até você
                    decidir. Nada acontece automaticamente.
                  </div>
                )}
              </>
            )}
          </div>

          <button
            onClick={() => run(() => suspendInvoice(invoiceId))}
            disabled={pending}
            className={`${btn} bg-red-600 text-white`}
          >
            <Ban className="h-4 w-4" /> Suspender atendimento
          </button>

          <button
            onClick={() => run(() => markInvoicePaid(invoiceId))}
            disabled={pending}
            className={`${btn} bg-yellow-400 text-navy-900`}
          >
            <BadgeCheck className="h-4 w-4" /> Marcar como pago (Pix)
          </button>
        </>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
