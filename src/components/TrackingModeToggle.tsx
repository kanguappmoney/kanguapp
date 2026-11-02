"use client";

import { useState, useTransition } from "react";
import { Map as MapIcon, MapPin, type LucideIcon } from "lucide-react";
import { setParentTrackingMode } from "@/lib/actions/driver";

type Mode = "map" | "timeline";

const OPTIONS: { value: Mode; title: string; desc: string; icon: LucideIcon }[] = [
  {
    value: "map",
    title: "Mapa ao vivo",
    desc: "O pai vê a van no mapa durante a rota ativa.",
    icon: MapIcon,
  },
  {
    value: "timeline",
    title: "Linha do tempo",
    desc: "Só o progresso por paradas, sem GPS. Mais privado e leve.",
    icon: MapPin,
  },
];

export function TrackingModeToggle({ initial }: { initial: Mode }) {
  const [mode, setMode] = useState<Mode>(initial);
  const [pending, startTransition] = useTransition();

  function choose(value: Mode) {
    if (value === mode) return;
    setMode(value);
    startTransition(() => setParentTrackingMode(value));
  }

  return (
    <div className="space-y-2">
      {OPTIONS.map((opt) => {
        const active = mode === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => choose(opt.value)}
            disabled={pending}
            className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${
              active
                ? "border-navy-900 bg-navy-900/[0.03] ring-2 ring-yellow-400/40"
                : "border-navy-900/10 bg-white"
            }`}
          >
            <opt.icon className="mt-0.5 h-5 w-5 shrink-0 text-navy-900" />
            <span className="flex-1">
              <span className="block font-semibold text-navy-900">
                {opt.title}
              </span>
              <span className="block text-sm text-navy-700/60">{opt.desc}</span>
            </span>
            {active && <span className="text-yellow-500">✓</span>}
          </button>
        );
      })}
    </div>
  );
}
