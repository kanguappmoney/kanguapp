"use client";

import { useState, useTransition, useEffect } from "react";
import { Copy, Check, RefreshCw, Ban, Plus, Sun, Sunset, Clock } from "lucide-react";
import {
  createCaptureLink,
  revokeCaptureLink,
  regenerateCaptureLink,
} from "@/lib/actions/capture";

export interface CaptureLink {
  id: string;
  shift: "morning" | "afternoon" | "integral";
  school: string;
  school_address: string | null;
  entry_time: string | null;
  exit_time: string | null;
  token: string;
}

const SHIFT_LABEL: Record<CaptureLink["shift"], string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  integral: "Integral",
};

export function CaptureLinkManager({ links }: { links: CaptureLink[] }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <div className="space-y-6">
      <NewLinkForm />
      <div>
        <h2 className="mb-2 mt-2 text-xs font-semibold uppercase tracking-wide text-navy-700/50">
          Links ativos
        </h2>
        {links.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-navy-900/15 p-4 text-center text-sm text-navy-700/60">
            Nenhum link ativo. Crie um por turno e compartilhe com os pais daquele
            turno.
          </div>
        ) : (
          <div className="space-y-3">
            {links.map((l) => (
              <LinkCard key={l.id} link={l} origin={origin} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NewLinkForm() {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) => startTransition(() => createCaptureLink(fd))}
      className="space-y-3 rounded-2xl border border-navy-900/5 bg-white p-4 shadow-sm"
    >
      <p className="font-semibold text-navy-900">Novo link de captação</p>

      <label className="block text-sm">
        <span className="mb-1 block text-navy-700/70">Turno</span>
        <select
          name="shift"
          required
          defaultValue="morning"
          className="w-full rounded-xl border border-navy-900/15 bg-white px-3 py-2"
        >
          <option value="morning">Manhã</option>
          <option value="afternoon">Tarde</option>
          <option value="integral">Integral</option>
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-navy-700/70">Escola</span>
        <input
          name="school"
          required
          placeholder="Ex.: EMEF Jardim Zaíra"
          className="w-full rounded-xl border border-navy-900/15 px-3 py-2"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-navy-700/70">
          Endereço da escola <span className="text-navy-700/40">(opcional)</span>
        </span>
        <input
          name="school_address"
          placeholder="Rua, número, bairro"
          className="w-full rounded-xl border border-navy-900/15 px-3 py-2"
        />
      </label>

      <div className="flex gap-3">
        <label className="block flex-1 text-sm">
          <span className="mb-1 block text-navy-700/70">Entrada</span>
          <input
            name="entry_time"
            type="time"
            className="w-full rounded-xl border border-navy-900/15 px-3 py-2"
          />
        </label>
        <label className="block flex-1 text-sm">
          <span className="mb-1 block text-navy-700/70">Saída</span>
          <input
            name="exit_time"
            type="time"
            className="w-full rounded-xl border border-navy-900/15 px-3 py-2"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900 disabled:opacity-60"
      >
        <Plus className="h-4 w-4" />
        {pending ? "Criando…" : "Criar link"}
      </button>
    </form>
  );
}

function ShiftIcon({ shift }: { shift: CaptureLink["shift"] }) {
  const cls = "h-4 w-4 text-navy-700/60";
  if (shift === "morning") return <Sun className={cls} />;
  if (shift === "afternoon") return <Sunset className={cls} />;
  return <Clock className={cls} />;
}

function LinkCard({ link, origin }: { link: CaptureLink; origin: string }) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const url = origin ? `${origin}/captacao/${link.token}` : "";

  function copy() {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const times =
    link.entry_time || link.exit_time
      ? [link.entry_time?.slice(0, 5), link.exit_time?.slice(0, 5)]
          .filter(Boolean)
          .join(" – ")
      : null;

  return (
    <div className="space-y-3 rounded-2xl border border-navy-900/5 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <ShiftIcon shift={link.shift} />
        <p className="font-semibold text-navy-900">
          {SHIFT_LABEL[link.shift]} · {link.school}
        </p>
      </div>
      {times && <p className="-mt-1 text-sm text-navy-700/60">{times}</p>}

      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          className="min-w-0 flex-1 truncate rounded-xl border border-navy-900/15 bg-navy-900/[0.03] px-3 py-2 text-sm"
        />
        <button
          onClick={copy}
          className="flex shrink-0 items-center gap-1 rounded-xl bg-yellow-400 px-3 py-2 text-sm font-semibold text-navy-900"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => startTransition(() => regenerateCaptureLink(link.id))}
          disabled={pending}
          className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-navy-900/15 py-2 text-sm font-medium text-navy-900 disabled:opacity-60"
        >
          <RefreshCw className="h-4 w-4" />
          Regenerar
        </button>
        <button
          onClick={() => startTransition(() => revokeCaptureLink(link.id))}
          disabled={pending}
          className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-red-200 py-2 text-sm font-medium text-red-700 disabled:opacity-60"
        >
          <Ban className="h-4 w-4" />
          Revogar
        </button>
      </div>
    </div>
  );
}
