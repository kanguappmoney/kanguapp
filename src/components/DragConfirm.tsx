"use client";

import { useRef, useState } from "react";
import { Logo } from "@/components/Logo";

// "Deslize para confirmar" (estilo apps de entrega) para a parada atual do Modo
// Direção 2.0 (R4). Só troca o GESTO — a lógica de embarque/ausência é a mesma.
// O gate de 100m NÃO bloqueia: `solid` só muda o VISUAL da trilha (perto = sólido;
// longe/sem GPS/sem coord = tracejado). O texto é sempre o mesmo ("Embarcar <nome>");
// o arraste funciona a qualquer distância.
// O thumb é a marca (canguru no amarelo #FFD000, mesmo asset do Logo) nos dois
// estados — a diferença sólido × "mesmo assim" fica na trilha.
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

  return (
    <div
      ref={trackRef}
      className={`relative h-14 select-none overflow-hidden rounded-2xl border ${trackCls}`}
    >
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-16 text-center text-sm font-semibold leading-tight text-navy-800">
        <span className="line-clamp-2">{label}</span>
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
        className={`absolute left-1 top-1 flex h-12 w-14 touch-none items-center justify-center rounded-xl bg-yellow-400 shadow-sm`}
      >
        <Logo
          variant="icon"
          alt=""
          className="pointer-events-none h-11 w-11 select-none"
        />
      </div>
    </div>
  );
}
