"use client";

import { useActionState, useState, useTransition } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { ConsentText } from "@/components/ConsentText";
import { StatusPill } from "@/components/patterns";
import { requestErasureAction } from "@/lib/actions/erasure";
import {
  acceptPhotoAction,
  reauthorizeChildAction,
  revokeConsentAction,
  type ConsentState,
} from "@/lib/actions/consents";
import {
  CHILD_DATA_CHECKBOXES,
  CHILD_DATA_TEMPLATE,
  PHOTO_BUTTON_WITH,
  PHOTO_BUTTON_WITHOUT,
  PHOTO_TEMPLATE,
  fill,
} from "@/lib/consent-texts";

const initial: ConsentState = { error: null };

// Autorizações de UMA criança, na visão do responsável: retirar (com aviso de confirmação), reautorizar quando
// suspensa e autorizar/retirar a foto. Os textos são os literais do jurídico.
export function ChildAuthorization({
  studentId,
  childName,
  providerName,
  suspended,
  childConsentId,
  photoConsentId,
}: {
  studentId: string;
  childName: string;
  providerName: string;
  suspended: boolean;
  childConsentId: string | null;
  photoConsentId: string | null;
}) {
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeScope, setNoticeScope] = useState<"child" | "photo">("child");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"child" | "photo" | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [erase, setErase] = useState<"closed" | "open" | "sent">("closed");
  const [eraseNote, setEraseNote] = useState("");
  const [reState, reAction, rePending] = useActionState(reauthorizeChildAction.bind(null, studentId), initial);

  function revoke(id: string) {
    setError(null);
    start(async () => {
      const r = await revokeConsentAction(id);
      if (r.error) setError(r.error);
      else {
        setNotice(r.notice ?? null);
        setNoticeScope(confirm === "photo" ? "photo" : "child");
      }
      setConfirm(null);
    });
  }

  function sendErasure() {
    setError(null);
    start(async () => {
      const r = await requestErasureAction(studentId, eraseNote);
      if (r.error) setError(r.error);
      else setErase("sent");
    });
  }

  function acceptPhoto() {
    setError(null);
    start(async () => {
      const r = await acceptPhotoAction(studentId);
      if (r.error) setError(r.error);
      setShowPhoto(false);
    });
  }

  return (
    <section className={`rounded-2xl p-4 ${suspended ? "border border-yellow-400/40 bg-cream" : "border border-navy-900/5 bg-white shadow-sm"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {suspended ? <ShieldAlert className="h-5 w-5 text-amber-700" /> : <ShieldCheck className="h-5 w-5 text-green-700" />}
          <h2 className="font-bold text-navy-900">{childName}</h2>
        </div>
        <StatusPill tone={suspended ? "overdue" : "done"}>{suspended ? "Suspensa" : "Autorizada"}</StatusPill>
      </div>

      {/* O aviso de retirada vale enquanto a criança está suspensa; depois de reautorizar ele some. */}
      {notice && (suspended || noticeScope === "photo") && (
        <p className="mt-3 rounded-xl bg-cream px-3 py-2 text-sm text-navy-800">{notice}</p>
      )}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {suspended ? (
        <form action={reAction} className="mt-4 space-y-3">
          <p className="text-sm text-navy-800">
            A autorização foi retirada: o motorista não acessa os dados de {childName} e a criança está fora das rotas.
            Para continuar usando o aplicativo, autorize novamente.
          </p>
          <ConsentText className="text-navy-800" paragraphs={fill(CHILD_DATA_TEMPLATE, { provider: providerName, child: childName })} />
          {CHILD_DATA_CHECKBOXES.map((t, i) => (
            <label key={i} className="flex items-start gap-2 text-sm text-navy-900">
              <input type="checkbox" name={`consent_child_${i + 1}`} required className="mt-0.5 h-4 w-4 shrink-0 rounded" />
              <span>{t}</span>
            </label>
          ))}
          {reState.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{reState.error}</p>}
          <button disabled={rePending} className="w-full rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900 disabled:opacity-60">
            {rePending ? "Salvando…" : "Autorizar novamente"}
          </button>
        </form>
      ) : (
        <div className="mt-4 space-y-3">
          {/* Foto */}
          <div className="rounded-xl bg-navy-900/[0.03] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy-700/60">Foto</p>
            {photoConsentId ? (
              confirm === "photo" ? (
                <ConfirmBox
                  text="Retirar a autorização da foto? A foto é apagada e o serviço continua sem ela."
                  onYes={() => revoke(photoConsentId)}
                  onNo={() => setConfirm(null)}
                  pending={pending}
                />
              ) : (
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span className="text-sm text-navy-800">Autorizada</span>
                  <button onClick={() => setConfirm("photo")} className="text-sm font-medium text-red-700 underline">
                    Retirar autorização
                  </button>
                </div>
              )
            ) : showPhoto ? (
              <div className="mt-2 space-y-3">
                <ConsentText className="text-navy-800" paragraphs={fill(PHOTO_TEMPLATE, { child: childName })} />
                <button
                  disabled={pending}
                  onClick={acceptPhoto}
                  className="w-full rounded-xl border border-navy-900/20 bg-white py-2.5 font-semibold text-navy-900 disabled:opacity-60"
                >
                  {PHOTO_BUTTON_WITH}
                </button>
                <button onClick={() => setShowPhoto(false)} className="w-full rounded-xl bg-yellow-400 py-2.5 font-semibold text-navy-900">
                  {PHOTO_BUTTON_WITHOUT}
                </button>
              </div>
            ) : (
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="text-sm text-navy-800">Sem foto</span>
                <button onClick={() => setShowPhoto(true)} className="text-sm font-medium text-navy-900 underline">
                  Autorizar foto
                </button>
              </div>
            )}
          </div>

          {/* Dados da criança */}
          {childConsentId &&
            (confirm === "child" ? (
              <ConfirmBox
                text={`Retirar a autorização dos dados de ${childName}? Ela fica suspensa para todos os responsáveis: o motorista deixa de acessar os dados e a criança sai das rotas, até alguém autorizar novamente.`}
                onYes={() => revoke(childConsentId)}
                onNo={() => setConfirm(null)}
                pending={pending}
              />
            ) : (
              <button
                onClick={() => setConfirm("child")}
                className="w-full rounded-xl border border-red-200 bg-white py-3 text-sm font-semibold text-red-700"
              >
                Retirar autorização dos dados da criança
              </button>
            ))}
        </div>
      )}

      {/* Direito de exclusão: o pedido vai para o admin, que decide; procedente = apaga na hora. */}
      <div className="mt-4 border-t border-navy-900/10 pt-3">
        {erase === "sent" ? (
          <p className="rounded-xl bg-cream px-3 py-2 text-sm text-navy-800">
            Pedido enviado. Vamos analisar e avisar o resultado. Se for procedente, os dados de {childName} são apagados.
          </p>
        ) : erase === "open" ? (
          <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/60 p-3">
            <p className="text-sm text-red-900">
              Pedir a exclusão dos dados de {childName}? Se o pedido for procedente, os dados da criança são apagados e
              ela deixa de aparecer para todos os responsáveis e para o motorista. Isso não pode ser desfeito.
            </p>
            <textarea
              value={eraseNote}
              onChange={(e) => setEraseNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Motivo (opcional)"
              className="w-full rounded-lg border border-navy-900/15 bg-white px-3 py-2 text-sm text-navy-900"
            />
            <div className="flex gap-2">
              <button onClick={() => setErase("closed")} className="flex-1 rounded-xl border border-navy-900/15 bg-white py-2.5 text-sm font-semibold text-navy-900">
                Cancelar
              </button>
              <button disabled={pending} onClick={sendErasure} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                {pending ? "Enviando…" : "Pedir exclusão"}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setErase("open")} className="text-sm font-medium text-red-700 underline">
            Pedir exclusão dos dados da criança
          </button>
        )}
      </div>
    </section>
  );
}

function ConfirmBox({ text, onYes, onNo, pending }: { text: string; onYes: () => void; onNo: () => void; pending: boolean }) {
  return (
    <div className="mt-2 space-y-3 rounded-xl border border-red-200 bg-red-50/60 p-3">
      <p className="text-sm text-red-900">{text}</p>
      <div className="flex gap-2">
        <button onClick={onNo} className="flex-1 rounded-xl border border-navy-900/15 bg-white py-2.5 text-sm font-semibold text-navy-900">
          Cancelar
        </button>
        <button disabled={pending} onClick={onYes} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? "Retirando…" : "Retirar"}
        </button>
      </div>
    </div>
  );
}
