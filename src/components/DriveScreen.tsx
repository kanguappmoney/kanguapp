"use client";

import { useEffect, useRef, useState, useTransition, type PointerEvent } from "react";
import { ArrowLeft, MapPin, MapPinOff, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import {
  setStopState,
  endRoute,
  type BoardingProximity,
} from "@/lib/actions/drive";
import { OccurrenceSheet } from "@/components/OccurrenceSheet";
import { NavMenu } from "@/components/NavMenu";
import { DragConfirm } from "@/components/DragConfirm";
import { DriveMapLoader } from "@/components/DriveMapLoader";
import { usePositionBroadcast } from "@/components/usePositionBroadcast";
import { useDriverPosition } from "@/components/useDriverPosition";
import {
  stopDistanceMeters,
  withinBoardingRange,
  type GeoPoint,
} from "@/lib/geo";

type StopState = "pending" | "boarded" | "absent";

export interface DriveStop {
  studentId: string;
  position: number;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  state: StopState;
}

// Modo Direção 2.0: mapa em tela cheia (mapbox-gl, GPS ao vivo — janela do G4) +
// bottom sheet por cima com a parada atual e o botão grande de "cheguei". O gate
// de 100m e as guardas G1/G2 são IDÊNTICOS ao anterior — só muda a apresentação.
// O Waze/Google (NavMenu) segue como fluxo paralelo, sem mudança.
export function DriveScreen({
  executionId,
  routeName,
  kind,
  active,
  inProgress,
  stops: initial,
  mapToken,
  mapLine,
  mapAnchor,
}: {
  executionId: string;
  routeName: string;
  kind: "pickup" | "dropoff";
  active: boolean;
  inProgress: boolean;
  stops: DriveStop[];
  mapToken: string;
  mapLine: [number, number][] | null;
  mapAnchor: GeoPoint | null;
}) {
  const [stops, setStops] = useState(initial);
  const [, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // R4: o arraste "abre" a escolha Embarcou/Ausente da parada atual. Reseta a
  // cada parada nova (quando o 1º pendente muda).
  const [revealed, setRevealed] = useState(false);

  usePositionBroadcast(executionId, active);
  // GPS ao vivo (in_progress + foreground). Alimenta o gate de 100m E o pino do
  // motorista no mapa. Não persiste coord — só a distância no metadata do embarque.
  const driverPos = useDriverPosition(inProgress);

  const heroVerb = kind === "pickup" ? "Cheguei no embarque" : "Cheguei no desembarque";
  const doneCount = stops.filter((s) => s.state !== "pending").length;
  const allHandled = doneCount === stops.length;
  const current = stops.find((s) => s.state === "pending") ?? null;
  const pct = Math.round((doneCount / (stops.length || 1)) * 100);

  // Gate de 100m da parada ATUAL (mesma lógica de sempre) — só decide o
  // visual/copy do arraste (perto = sólido; longe = "mesmo assim"). Nunca trava.
  const currentPoint =
    current && current.lat != null && current.lng != null
      ? { lat: current.lat, lng: current.lng }
      : null;
  const currentDist = stopDistanceMeters(driverPos, currentPoint);
  const currentInRange = withinBoardingRange(currentDist);

  // Nova parada vira "current" → fecha a escolha aberta na anterior.
  useEffect(() => {
    setRevealed(false);
  }, [current?.studentId]);

  // Bottom sheet recolhe/expande por distância (padrão; manual sempre disponível).
  // Longe da parada (mensurável E fora do 100m) → recolhe, dando tela ao mapa;
  // perto (≤100m) OU sem dado (sem GPS/coord) → expande. Nunca esconde a ação por
  // falta de dado — mesmo espírito do gate de 100m.
  const [collapsed, setCollapsed] = useState(false);
  const autoCollapsed = currentDist != null && !currentInRange;
  // Aplica o padrão só quando o alvo AUTOMÁTICO muda (cruza o threshold). Entre
  // transições, o arraste manual manda — o auto não briga com a mão.
  useEffect(() => {
    setCollapsed(autoCollapsed);
  }, [autoCollapsed]);

  // Arraste manual do sheet (pra cima expande, pra baixo recolhe; toque alterna).
  const dragStartY = useRef<number | null>(null);
  function onSheetDown(e: PointerEvent<HTMLDivElement>) {
    dragStartY.current = e.clientY;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onSheetUp(e: PointerEvent<HTMLDivElement>) {
    if (dragStartY.current == null) return;
    const dy = e.clientY - dragStartY.current;
    dragStartY.current = null;
    if (dy > 8) setCollapsed(true);
    else if (dy < -8) setCollapsed(false);
    else setCollapsed((v) => !v); // toque = alterna
  }

  const mapStops = stops.map((s) => ({
    studentId: s.studentId,
    position: s.position,
    lat: s.lat,
    lng: s.lng,
    done: s.state !== "pending",
  }));

  function set(studentId: string, state: StopState, proximity?: BoardingProximity) {
    setStops((prev) =>
      prev.map((s) => (s.studentId === studentId ? { ...s, state } : s)),
    );
    startTransition(() =>
      setStopState(executionId, studentId, state, kind, proximity),
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-navy-900">
      <div className="relative flex w-full max-w-md flex-col overflow-hidden">
        {/* Mapa em tela cheia atrás de tudo. Sem token → fundo neutro (a tela
            nunca depende do mapa). */}
        <div className="absolute inset-0">
          {mapToken ? (
            <DriveMapLoader
              token={mapToken}
              stops={mapStops}
              line={mapLine}
              anchor={mapAnchor}
              driverPos={driverPos}
            />
          ) : (
            <div className="h-full w-full bg-navy-900/10" />
          )}
        </div>

        {/* Barra de topo por cima do mapa: voltar + rota + progresso. */}
        <div className="relative z-10 bg-gradient-to-b from-navy-900 to-navy-900/0 px-4 pb-6 pt-5 text-white">
          <div className="flex items-center gap-3">
            <Link href="/motorista" aria-label="Voltar" className="text-white/80">
              <ArrowLeft className="h-6 w-6" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-white/60">Modo direção</p>
              <h1 className="truncate text-lg font-bold">{routeName}</h1>
            </div>
            <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">
              {doneCount} / {stops.length}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-yellow-400 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Bottom sheet por cima do mapa. Recolhe/expande por distância (auto) +
            arraste manual. Recolhido = só a faixa da próxima parada; o mapa cresce. */}
        <div
          className={`relative z-10 mt-auto flex flex-col rounded-t-3xl bg-white shadow-[0_-8px_24px_rgba(13,27,61,0.18)] ${
            collapsed ? "" : "max-h-[74dvh]"
          }`}
        >
          {/* Alça arrastável (sempre visível). Recolhido: mostra a próxima parada. */}
          <div
            onPointerDown={onSheetDown}
            onPointerUp={onSheetUp}
            className="shrink-0 cursor-grab touch-none px-4 pb-1 pt-2"
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-navy-900/15" />
            {collapsed && (
              <div className="mt-2 flex items-center gap-2 pb-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-navy-700/50">
                  Próxima
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-navy-900">
                  {current ? current.name : "Todas as paradas resolvidas"}
                </span>
                <ChevronUp className="h-4 w-4 shrink-0 text-navy-700/40" />
              </div>
            )}
          </div>

          {!collapsed && (
          <>
          <div className="flex-1 overflow-y-auto px-4 pb-2 pt-1">
            {/* Parada ATUAL (hero) — nome + gate de 100m no botão grande. */}
            {current ? (
              <div className="rounded-2xl border border-navy-900/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-navy-700/50">
                  Parada atual
                </p>
                <p className="mt-1 text-xl font-bold text-navy-900">
                  {current.name}
                </p>
                {current.address && (
                  <p className="mt-0.5 text-sm text-navy-700/60">{current.address}</p>
                )}

                {/* Dica do gate de 100m (quando longe/sem GPS/sem coord). */}
                {!currentInRange && (
                  <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-navy-900/[0.04] px-3 py-2 text-xs text-navy-700/70">
                    {currentPoint === null ? (
                      <MapPinOff className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                    )}
                    {currentPoint === null
                      ? "Endereço sem localização no mapa"
                      : driverPos === null
                        ? "Sem sinal de GPS agora"
                        : `Você está a ~${Math.round(currentDist!)} m do endereço`}
                  </div>
                )}

                <div className="mt-3">
                  {revealed ? (
                    // Arraste concluído → escolha da parada atual. "Embarcou" =
                    // MESMA ação de embarque de sempre (com o forced do gate);
                    // "Ausente" = MESMA ausência operacional (route_event).
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          set(current.studentId, "boarded", {
                            forced: !currentInRange,
                            distanceM: currentDist,
                          })
                        }
                        className="flex-1 rounded-xl bg-yellow-400 py-4 text-lg font-semibold text-navy-900"
                      >
                        {kind === "pickup" ? "Embarcou" : "Desembarcou"}
                      </button>
                      <button
                        onClick={() => set(current.studentId, "absent")}
                        className="rounded-xl border border-navy-900/15 px-5 text-sm font-medium text-navy-700/70"
                      >
                        Ausente
                      </button>
                    </div>
                  ) : (
                    <DragConfirm
                      label={
                        currentInRange
                          ? `${heroVerb} — deslize para confirmar`
                          : `${heroVerb} — deslize mesmo assim`
                      }
                      solid={currentInRange}
                      onConfirm={() => setRevealed(true)}
                    />
                  )}
                </div>

                <div className="mt-2">
                  <NavMenu
                    lat={current.lat}
                    lng={current.lng}
                    address={current.address}
                    label={current.name}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-center">
                <p className="font-semibold text-green-800">
                  Todas as paradas resolvidas
                </p>
                <p className="mt-1 text-sm text-green-700/80">
                  Encerre a rota quando confirmar que a van está vazia.
                </p>
              </div>
            )}

            {/* Todas as paradas (colapsável) — mesma lógica, versão compacta. */}
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 flex w-full items-center justify-between rounded-xl px-1 py-2 text-sm font-medium text-navy-700/70"
            >
              Ver todas as paradas ({stops.length})
              {showAll ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>

            {showAll && (
              <div className="space-y-2 pb-2">
                {stops.map((s) => (
                  <div
                    key={s.studentId}
                    className={`rounded-2xl border p-3 ${
                      s.state === "boarded"
                        ? "border-green-200 bg-green-50"
                        : s.state === "absent"
                          ? "border-amber-200 bg-amber-50"
                          : "border-navy-900/10 bg-white"
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-yellow-400">
                        {s.position}
                      </span>
                      <span className="flex-1 truncate text-sm font-medium text-navy-900">
                        {s.name}
                      </span>
                      {s.state === "boarded" && (
                        <span className="text-xs text-green-700">✓</span>
                      )}
                      {s.state === "absent" && (
                        <span className="text-xs font-medium text-amber-700">
                          Ausente
                        </span>
                      )}
                    </div>
                    {/* R4: embarque SÓ pelo arraste do hero. Na lista, pendente
                        é overview (sem toque-embarcar); concluída tem "Desfazer". */}
                    {s.state === "pending" ? (
                      <p className="text-xs text-navy-700/50">
                        {s.studentId === current?.studentId
                          ? "Parada atual — confirme no painel acima."
                          : "Aguardando"}
                      </p>
                    ) : (
                      <button
                        onClick={() => set(s.studentId, "pending")}
                        className="w-full rounded-xl border border-navy-900/10 py-2 text-sm font-medium text-navy-700/60"
                      >
                        Desfazer
                      </button>
                    )}
                    <div className="mt-2">
                      <NavMenu
                        lat={s.lat}
                        lng={s.lng}
                        address={s.address}
                        label={s.name}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Rodapé fixo do sheet: ocorrência + encerrar. */}
          <div className="shrink-0 space-y-2 border-t border-navy-900/10 p-4">
            <OccurrenceSheet executionId={executionId} />
            <button
              onClick={() => setConfirming(true)}
              className="w-full rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900"
            >
              Encerrar rota
            </button>
          </div>
          </>
          )}
        </div>

        {confirming && (
          <div className="absolute inset-0 z-20 flex items-end bg-black/40">
            <div className="w-full rounded-t-3xl bg-white p-5">
              <h2 className="text-lg font-bold text-navy-900">Encerrar rota</h2>
              <p className="mt-2 text-sm text-navy-700/70">
                Confirme com uma olhada na van: <b>nenhum aluno ficou a bordo</b>.
              </p>
              {!allHandled && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Atenção: {stops.length - doneCount}{" "}
                  {stops.length - doneCount === 1
                    ? "parada ainda não foi marcada"
                    : "paradas ainda não foram marcadas"}
                  .
                </p>
              )}
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => setConfirming(false)}
                  className="flex-1 rounded-xl border border-navy-900/15 py-3 font-semibold text-navy-900"
                >
                  Voltar
                </button>
                <form action={() => endRoute(executionId)} className="flex-1">
                  <button className="w-full rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900">
                    Confirmar e encerrar
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
