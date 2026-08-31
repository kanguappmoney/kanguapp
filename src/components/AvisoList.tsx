"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { markAllNotificationsRead } from "@/lib/actions/notifications";

interface Notif {
  id: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

function when(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function AvisoList({ initial }: { initial: Notif[] }) {
  // Congela o estado lido/não-lido desta visita: o "novo" continua destacado
  // mesmo depois que markAllNotificationsRead marca tudo como lido no servidor.
  const [items] = useState(initial);

  useEffect(() => {
    markAllNotificationsRead();
  }, []);

  if (!items.length) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-navy-900/10 bg-white p-4 text-center text-sm text-navy-700/60">
        Nenhum aviso por aqui ainda.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {items.map((n) => {
        const unread = !n.read_at;
        return (
          <div
            key={n.id}
            className={`flex gap-3 rounded-2xl border bg-white p-4 shadow-sm ${
              unread ? "border-yellow-400/60 ring-2 ring-yellow-400/40" : "border-navy-900/5"
            }`}
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                unread ? "bg-yellow-400/20 text-navy-900" : "bg-navy-900/5 text-navy-700/50"
              }`}
            >
              <Bell className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-navy-900">{n.title}</p>
                {unread && (
                  <span className="rounded-full bg-yellow-400 px-1.5 py-0.5 text-[10px] font-bold uppercase text-navy-900">
                    Novo
                  </span>
                )}
              </div>
              <p className="text-sm text-navy-700/70">{n.body}</p>
              <p className="mt-0.5 text-xs text-navy-700/40">{when(n.created_at)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
