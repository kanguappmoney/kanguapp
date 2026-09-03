"use client";

import { useActionState, useState } from "react";
import { submitCapture, type SubmitState } from "@/lib/actions/capture";

const initial: SubmitState = { error: null };

// Formulário do pai. `needsAccount` = o pai ainda não está logado, então o form
// também cria a conta (guardian) — atrás de um token válido, nunca cadastro solto.
export function CaptureForm({
  token,
  needsAccount,
}: {
  token: string;
  needsAccount: boolean;
}) {
  const action = submitCapture.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initial);

  const [dropoffSame, setDropoffSame] = useState(true);

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
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-navy-700/50">
          Dados da criança
        </h2>
        <Field label="Nome completo da criança" name="child_full_name" autoComplete="off" />
        <Field
          label="Data de nascimento"
          name="child_birth_date"
          type="date"
          required={false}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-navy-700/50">
          Endereço de casa (embarque)
        </h2>
        <Field
          label="Endereço"
          name="pickup_address"
          placeholder="Rua, número, bairro"
          autoComplete="off"
        />
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
          <Field
            label="Endereço de desembarque"
            name="dropoff_address"
            placeholder="Rua, número, bairro"
            autoComplete="off"
          />
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
              Autorizo o tratamento dos dados da criança para o transporte escolar
              e aceito os{" "}
              <a href="/termos" className="font-semibold underline">
                Termos de Uso
              </a>{" "}
              e a{" "}
              <a href="/privacidade" className="font-semibold underline">
                Política de Privacidade
              </a>
              .
            </span>
          </label>
        </section>
      )}

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900 disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Enviar cadastro para aprovação"}
      </button>
      <p className="text-center text-xs text-navy-700/50">
        O motorista confere e aprova antes da criança entrar na rota.
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
