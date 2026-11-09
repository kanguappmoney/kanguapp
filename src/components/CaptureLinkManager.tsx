"use client";

import { useState, useTransition, useEffect } from "react";
import { Copy, Check, RefreshCw, Ban, Plus, Sun, Sunset, Clock } from "lucide-react";
import {
  createCaptureLink,
  revokeCaptureLink,
  regenerateCaptureLink,
} from "@/lib/actions/capture";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { SchoolPicker } from "@/components/SchoolPicker";
import { ProfileGateNotice } from "@/components/ProfileGateNotice";

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

// `gateMissing` (portão de perfil completo): não-nulo = perfil incompleto →
// aviso no lugar do formulário e sem "Regenerar" (o servidor também recusa).
export function CaptureLinkManager({
  links,
  gateMissing = null,
}: {
  links: CaptureLink[];
  gateMissing?: string[] | null;
}) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <div className="space-y-6">
      {gateMissing ? (
        <ProfileGateNotice missing={gateMissing} action="gerar links de captação" />
      ) : (
        <NewLinkForm />
      )}
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
              <LinkCard
                key={l.id}
                link={l}
                origin={origin}
                canRegenerate={!gateMissing}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NewLinkForm() {
  const [pending, startTransition] = useTransition();
  // O endereço da escola guarda estado interno (sugestões/coordenada): trocar a key o zera após criar o link.
  const [addrKey, setAddrKey] = useState(0);

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          await createCaptureLink(fd);
          setAddrKey((k) => k + 1);
        })
      }
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

      <SchoolPicker required key={`s${addrKey}`} source={{ kind: "driver" }} />

      <AddressAutocomplete
        key={addrKey}
        label="Endereço da escola (opcional)"
        name="school_address"
        latName="school_lat"
        lngName="school_lng"
        placeholder="Rua, número, bairro"
        required={false}
      />

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

function LinkCard({
  link,
  origin,
  canRegenerate,
}: {
  link: CaptureLink;
  origin: string;
  canRegenerate: boolean;
}) {
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
        {canRegenerate && (
          <button
            onClick={() => startTransition(() => regenerateCaptureLink(link.id))}
            disabled={pending}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-navy-900/15 py-2 text-sm font-medium text-navy-900 disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4" />
            Regenerar
          </button>
        )}
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
