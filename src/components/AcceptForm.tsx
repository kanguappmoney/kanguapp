"use client";

import { useActionState, useState } from "react";
import { acceptInvite, type AcceptState } from "@/lib/actions/invite";
import { ConsentText } from "@/components/ConsentText";
import { CHILD_DATA_CHECKBOXES, CHILD_DATA_TEMPLATE, fill } from "@/lib/consent-texts";

const initial: AcceptState = { error: null };

export function AcceptForm({ token, providerName, childName }: { token: string; providerName: string; childName: string }) {
  const action = acceptInvite.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initial);

  // Campos controlados: no React 19 um <form action> reseta inputs
  // não-controlados após submeter. Controlando, o valor persiste no erro.
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);

  if (state.needsEmailConfirm) {
    return (
      <div className="rounded-2xl bg-green-50 p-4 text-sm text-green-800">
        Conta criada! Confirme seu e-mail pelo link que enviamos e depois abra
        este convite novamente para concluir o vínculo.
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Field
        label="Seu nome completo"
        name="full_name"
        autoComplete="name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
      />
      <Field
        label="E-mail"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Field
        label="Crie uma senha (mín. 8 caracteres)"
        name="password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <label className="flex items-start gap-2 text-sm text-navy-800">
        <input
          type="checkbox"
          name="accept_terms"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
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

      {/* Autorização própria deste responsável para os dados da criança — texto literal do jurídico. */}
      <section className="space-y-3 rounded-2xl border border-yellow-400/40 bg-cream p-4">
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
        {pending ? "Vinculando…" : "Aceitar e acompanhar"}
      </button>
    </form>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-navy-800">
        {label}
      </span>
      <input
        {...props}
        required
        className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-3 outline-none focus:border-navy-700 focus:ring-2 focus:ring-yellow-400/40"
      />
    </label>
  );
}
