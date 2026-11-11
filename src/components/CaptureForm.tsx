"use client";

import { useActionState, useState } from "react";
import { submitCapture, type SubmitState } from "@/lib/actions/capture";
import { AddressFields } from "@/components/AddressFields";
import { SchoolPicker } from "@/components/SchoolPicker";
import { ConsentText } from "@/components/ConsentText";
import {
  CHILD_DATA_CHECKBOXES,
  CHILD_DATA_TEMPLATE,
  PHOTO_BUTTON_WITH,
  PHOTO_BUTTON_WITHOUT,
  PHOTO_TEMPLATE,
  fill,
} from "@/lib/consent-texts";

const initial: SubmitState = { error: null };

// Formulário do pai. `needsAccount` = o pai ainda não está logado, então o form
// também cria a conta (guardian) — atrás de um token válido, nunca cadastro solto.
export function CaptureForm({
  token,
  needsAccount,
  generic = false,
  providerName,
  assisted = false,
}: {
  token: string;
  needsAccount: boolean;
  providerName: string; // nome do motorista (vem do banco) — entra no texto da autorização
  assisted?: boolean; // link presencial: o responsável preenche junto ao motorista (método "presencial assistido")
  // Link genérico (vitrine): turno e escola NÃO vêm travados — o pai preenche.
  generic?: boolean;
}) {
  const action = submitCapture.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initial);

  const [dropoffSame, setDropoffSame] = useState(true);
  const [childName, setChildName] = useState("");

  if (state.needsEmailConfirm) {
    return (
      <div className="rounded-2xl bg-green-50 p-4 text-sm text-green-800">
        Conta criada! Confirme seu e-mail pelo link que enviamos e depois abra
        este link novamente para concluir o cadastro da criança.
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {assisted && <input type="hidden" name="assisted" value="1" />}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-navy-700/50">
          Dados da criança
        </h2>
        <Field
          label="Nome completo da criança"
          name="child_full_name"
          autoComplete="off"
          value={childName}
          onChange={(e) => setChildName(e.target.value)}
        />
        <Field
          label="Data de nascimento"
          name="child_birth_date"
          type="date"
          required={false}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-navy-700/50">
          {generic ? "Escola e turno" : "Escola"}
        </h2>
        <SchoolPicker
          required
          strict
          placeholder="Escolha a escola da criança"
          source={{ kind: "link", token }}
        />
        {generic && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-navy-800">Turno</span>
            <select
              name="shift"
              required
              defaultValue=""
              className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3 outline-none focus:border-navy-700 focus:ring-2 focus:ring-yellow-400/40"
            >
              <option value="" disabled>
                Selecione
              </option>
              <option value="morning">Manhã</option>
              <option value="afternoon">Tarde</option>
              <option value="integral">Integral</option>
            </select>
          </label>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-navy-700/50">
          Endereço de casa (embarque)
        </h2>
        <AddressFields prefix="pickup" label="Endereço" />
        <label className="flex items-center gap-2 text-sm text-navy-800">
          <input
            type="checkbox"
            name="dropoff_same"
            checked={dropoffSame}
            onChange={(e) => setDropoffSame(e.target.checked)}
            className="h-4 w-4 rounded border-navy-900/30"
          />
          <span>Desembarque no mesmo endereço</span>
        </label>
        {!dropoffSame && (
          <AddressFields prefix="dropoff" label="Endereço de desembarque" />
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-navy-700/50">
          Contato do responsável
        </h2>
        <Field label="Telefone" name="responsible_phone" type="tel" required={false} />
        <Field
          label="WhatsApp"
          name="responsible_whatsapp"
          type="tel"
          required={false}
        />
      </section>

      {needsAccount && (
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-navy-700/50">
            Sua conta de acesso
          </h2>
          <Field label="Seu nome completo" name="full_name" autoComplete="name" />
          <Field label="E-mail" name="email" type="email" autoComplete="email" />
          <Field
            label="Crie uma senha (mín. 8 caracteres)"
            name="password"
            type="password"
            autoComplete="new-password"
          />
          <label className="flex items-start gap-2 text-sm text-navy-800">
            <input
              type="checkbox"
              name="accept_terms"
              required
              className="mt-0.5 h-4 w-4 rounded border-navy-900/30"
            />
            <span>
              Li e aceito os{" "}
              <a href="/termos" className="font-semibold underline">
                Termos de Uso
              </a>{" "}
              e a{" "}
              <a href="/privacidade" className="font-semibold underline">
                Política de Privacidade
              </a>{" "}
              (uso da minha conta).
            </span>
          </label>
        </section>
      )}

      {/* Autorização específica da criança — texto literal do jurídico, com as duas declarações. */}
      <section className="space-y-4 rounded-2xl border border-yellow-400/40 bg-cream p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-navy-900/70">
          Autorização para o tratamento dos dados da criança
        </h2>
        <ConsentText
          className="text-navy-800"
          paragraphs={fill(CHILD_DATA_TEMPLATE, { provider: providerName, child: childName })}
        />
        {CHILD_DATA_CHECKBOXES.map((text, i) => (
          <label key={i} className="flex items-start gap-2 text-sm text-navy-900">
            <input
              type="checkbox"
              name={`consent_child_${i + 1}`}
              required
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-navy-900/30"
            />
            <span>{text}</span>
          </label>
        ))}
      </section>

      {/* Foto: opcional e separada; as duas saídas enviam o cadastro. */}
      <section className="space-y-4 rounded-2xl border border-navy-900/10 bg-white p-4 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-wide text-navy-900/70">Foto da criança (opcional)</h2>
        <ConsentText className="text-navy-800" paragraphs={fill(PHOTO_TEMPLATE, { child: childName })} />
      </section>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="space-y-2">
        <button
          type="submit"
          name="photo_choice"
          value="with"
          disabled={pending}
          className="w-full rounded-xl border border-navy-900/20 bg-white py-3 font-semibold text-navy-900 disabled:opacity-60"
        >
          {pending ? "Enviando…" : PHOTO_BUTTON_WITH}
        </button>
        <button
          type="submit"
          name="photo_choice"
          value="without"
          disabled={pending}
          className="w-full rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900 disabled:opacity-60"
        >
          {pending ? "Enviando…" : PHOTO_BUTTON_WITHOUT}
        </button>
      </div>
      <p className="text-center text-xs text-navy-700/50">
        O cadastro vai para aprovação do motorista antes de a criança entrar na rota.
      </p>
    </form>
  );
}

function Field({
  label,
  required = true,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-navy-800">{label}</span>
      <input
        {...props}
        required={required}
        className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3 outline-none focus:border-navy-700 focus:ring-2 focus:ring-yellow-400/40"
      />
    </label>
  );
}
