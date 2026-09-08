"use client";

import { useRef, useState } from "react";
import { ChevronsRight } from "lucide-react";

// "Deslize para confirmar" (estilo apps de entrega) para a parada atual do Modo
// Direção 2.0 (R4). Só troca o GESTO — a lógica de embarque/ausência é a mesma.
// O gate de 100m NÃO bloqueia: `solid` só muda o visual/copy (perto = sólido;
// longe/sem GPS/sem coord = tracejado "mesmo assim"). O arraste funciona sempre.
export function DragConfirm({
  label,
  solid,
  onConfirm,
}: {
  label: string;
  solid: boolean;
  onConfirm: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const dragging = useRef(false);
  const startX = useRef(0);

  const THUMB = 56;
  const PAD = 4;
  const maxX = () =>
    Math.max(0, (trackRef.current?.clientWidth ?? 0) - THUMB - PAD * 2);

  function down(e: React.PointerEvent) {
    dragging.current = true;
    startX.current = e.clientX - x;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!dragging.current) return;
    setX(Math.min(maxX(), Math.max(0, e.clientX - startX.current)));
  }
  function up() {
    if (!dragging.current) return;
    dragging.current = false;
    if (x >= maxX() * 0.85) {
      setX(maxX());
      onConfirm();
      setTimeout(() => setX(0), 200); // volta pro início após confirmar
    } else {
      setX(0); // não chegou ao fim: volta (spring)
    }
  }

  const trackCls = solid
    ? "border-yellow-400 bg-yellow-400/20"
    : "border-2 border-dashed border-yellow-400 bg-white";
  const thumbCls = solid
    ? "bg-yellow-400 text-navy-900"
    : "border-2 border-yellow-400 bg-white text-navy-900";

  return (
    <div
      ref={trackRef}
      className={`relative h-14 select-none overflow-hidden rounded-2xl border ${trackCls}`}
    >
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-14 text-center text-sm font-semibold text-navy-800">
        {label}
      </span>
      <div
        role="button"
        aria-label={label}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        style={{
          transform: `translateX(${x}px)`,
          transition: dragging.current ? "none" : "transform .2s ease",
        }}
        className={`absolute left-1 top-1 flex h-12 w-14 touch-none items-center justify-center rounded-xl ${thumbCls}`}
      >
        <ChevronsRight className="h-6 w-6" />
      </div>
    </div>
  );
}
