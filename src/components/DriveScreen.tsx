"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, MapPin, MapPinOff, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import {
  setStopState,
  endRoute,
  type BoardingProximity,
} from "@/lib/actions/drive";
import { OccurrenceSheet } from "@/components/OccurrenceSheet";
import { NavMenu } from "@/components/NavMenu";
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

  usePositionBroadcast(executionId, active);
  // GPS ao vivo (in_progress + foreground). Alimenta o gate de 100m E o pino do
  // motorista no mapa. Não persiste coord — só a distância no metadata do embarque.
  const driverPos = useDriverPosition(inProgress);

  const heroVerb = kind === "pickup" ? "Cheguei no embarque" : "Cheguei no desembarque";
  const listVerb = kind === "pickup" ? "Embarcar" : "Desembarcar";
  const doneCount = stops.filter((s) => s.state !== "pending").length;
  const allHandled = doneCount === stops.length;
  const current = stops.find((s) => s.state === "pending") ?? null;
  const pct = Math.round((doneCount / (stops.length || 1)) * 100);

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

        {/* Bottom sheet por cima do mapa. */}
        <div className="relative z-10 mt-auto flex max-h-[74dvh] flex-col rounded-t-3xl bg-white shadow-[0_-8px_24px_rgba(13,27,61,0.18)]">
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-navy-900/15" />

          <div className="flex-1 overflow-y-auto px-4 pb-2 pt-3">
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
                <div className="mt-3">
                  <StopActions
                    stop={current}
                    driverPos={driverPos}
                    boardVerb={heroVerb}
                    big
                    onSet={set}
                  />
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
                    <StopActions
                      stop={s}
                      driverPos={driverPos}
                      boardVerb={listVerb}
                      onSet={set}
                    />
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

// Controle de embarque de uma parada, com o gate de 100m (G1/G2) — LÓGICA
// INALTERADA do Modo Direção 1.0. A ≤100m libera o botão sólido; longe, sem GPS
// ou sem coordenada, vira "…mesmo assim" (registrado como forçado), sempre
// disponível. `big` só engrossa o botão da parada atual (hero). Nada trava.
function StopActions({
  stop,
  driverPos,
  boardVerb,
  big,
  onSet,
}: {
  stop: DriveStop;
  driverPos: GeoPoint | null;
  boardVerb: string;
  big?: boolean;
  onSet: (id: string, state: StopState, proximity?: BoardingProximity) => void;
}) {
  if (stop.state !== "pending") {
    return (
      <button
        onClick={() => onSet(stop.studentId, "pending")}
        className="w-full rounded-xl border border-navy-900/10 py-2 text-sm font-medium text-navy-700/60"
      >
        Desfazer
      </button>
    );
  }

  const stopPoint =
    stop.lat != null && stop.lng != null
      ? { lat: stop.lat, lng: stop.lng }
      : null;
  const distance = stopDistanceMeters(driverPos, stopPoint);
  const inRange = withinBoardingRange(distance);

  const hint =
    stopPoint === null
      ? "Endereço sem localização no mapa"
      : driverPos === null
        ? "Sem sinal de GPS agora"
        : `Você está a ~${Math.round(distance!)} m do endereço`;

  const bigCls = big ? "py-4 text-lg" : "py-2.5";

  return (
    <div className="space-y-2">
      {inRange ? (
        <div className="flex gap-2">
          <button
            onClick={() =>
              onSet(stop.studentId, "boarded", { forced: false, distanceM: distance })
            }
            className={`flex-1 rounded-xl bg-yellow-400 font-semibold text-navy-900 ${bigCls}`}
          >
            {boardVerb}
          </button>
          <button
            onClick={() => onSet(stop.studentId, "absent")}
            className="rounded-xl border border-navy-900/15 px-4 text-sm font-medium text-navy-700/70"
          >
            Ausente
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1.5 rounded-lg bg-navy-900/[0.04] px-3 py-2 text-xs text-navy-700/70">
            {stopPoint === null ? (
              <MapPinOff className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <MapPin className="h-3.5 w-3.5 shrink-0" />
            )}
            {hint}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() =>
                onSet(stop.studentId, "boarded", { forced: true, distanceM: distance })
              }
              className={`flex-1 rounded-xl border-2 border-yellow-400 font-semibold text-navy-900 ${bigCls}`}
            >
              {boardVerb} mesmo assim
            </button>
            <button
              onClick={() => onSet(stop.studentId, "absent")}
              className="rounded-xl border border-navy-900/15 px-4 text-sm font-medium text-navy-700/70"
            >
              Ausente
            </button>
          </div>
        </>
      )}
    </div>
  );
}
