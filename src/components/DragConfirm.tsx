"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
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
  onDark = false,
}: {
  label: string;
  solid: boolean;
  onConfirm: () => void;
  onDark?: boolean; // dentro de um card azul-marinho: trilha translúcida e texto branco
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const dragging = useRef(false);
  const startX = useRef(0);

  const THUMB = 56;
  const PAD = 2; // folga do thumb até a borda interna (a borda de 2px completa os 4px visíveis nos quatro lados)
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

  // Borda sempre de 2px (sólida perto, tracejada longe) → folga idêntica do thumb nos quatro lados.
  const trackCls = onDark
    ? solid
      ? "border-2 border-yellow-400 bg-white/10"
      : "border-2 border-dashed border-yellow-400 bg-white/5"
    : solid
      ? "border-2 border-yellow-400 bg-yellow-400/20"
      : "border-2 border-dashed border-yellow-400 bg-white";

  // Preenchimento que acompanha o arraste: gradiente amarelo → verde mapeado na trilha inteira,
  // então só fica verde de fato perto dos 100%.
  const trackW = trackRef.current?.clientWidth ?? 0;
  const max = maxX();
  const progress = max > 0 ? Math.min(1, x / max) : 0;
  const fillW = x + THUMB + PAD * 2;
  const complete = progress >= 0.85; // mesmo limiar que confirma ao soltar

  return (
    <div
      ref={trackRef}
      className={`relative h-14 select-none overflow-hidden rounded-2xl border ${trackCls}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 top-0 rounded-xl"
        style={{
          width: fillW,
          opacity: progress > 0 ? 1 : 0,
          backgroundImage: "linear-gradient(90deg, #ffd000 0%, #22c55e 100%)",
          backgroundSize: `${trackW}px 100%`,
          backgroundRepeat: "no-repeat",
          transition: dragging.current ? "none" : "width .2s ease, opacity .2s ease",
        }}
      />
      <span className={`pointer-events-none absolute inset-0 flex items-center justify-center px-16 text-center text-sm font-semibold leading-tight ${onDark && progress < 0.08 ? "text-white" : "text-navy-900"}`}>
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
        className={`absolute bottom-0 left-0.5 top-0 my-auto flex h-12 w-14 touch-none items-center justify-center rounded-xl shadow-sm transition-colors ${complete ? "bg-green-500" : "bg-yellow-400"}`}
      >
        {complete ? (
          <Check className="pointer-events-none h-7 w-7 text-white" strokeWidth={3} />
        ) : (
          <Logo
            variant="icon"
            alt=""
            className="pointer-events-none h-11 w-11 select-none"
          />
        )}
      </div>
    </div>
  );
}
