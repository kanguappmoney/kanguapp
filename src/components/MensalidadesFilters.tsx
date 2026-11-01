"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Filtros da aba Mensalidades: escola, turno e rota — combináveis, cada um
// opcional, "Todos" por padrão. Só reescreve a URL; a lista filtra no servidor.
export function MensalidadesFilters({
  schools,
  routes,
}: {
  schools: string[];
  routes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const select = "w-full rounded-xl border border-navy-900/15 bg-white px-3 py-2.5 text-sm";

  return (
    <div className="grid grid-cols-3 gap-2">
      <label className="block min-w-0 text-xs">
        <span className="mb-1 block text-navy-700/60">Escola</span>
        <select
          aria-label="Filtrar por escola"
          value={params.get("escola") ?? ""}
          onChange={(e) => set("escola", e.target.value)}
          className={select}
        >
          <option value="">Todas</option>
          {schools.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="block min-w-0 text-xs">
        <span className="mb-1 block text-navy-700/60">Turno</span>
        <select
          aria-label="Filtrar por turno"
          value={params.get("turno") ?? ""}
          onChange={(e) => set("turno", e.target.value)}
          className={select}
        >
          <option value="">Todos</option>
          <option value="morning">Manhã</option>
          <option value="afternoon">Tarde</option>
          <option value="integral">Integral</option>
        </select>
      </label>
      <label className="block min-w-0 text-xs">
        <span className="mb-1 block text-navy-700/60">Rota</span>
        <select
          aria-label="Filtrar por rota"
          value={params.get("rota") ?? ""}
          onChange={(e) => set("rota", e.target.value)}
          className={select}
        >
          <option value="">Todas</option>
          {routes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
