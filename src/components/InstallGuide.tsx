"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Compass,
  Download,
  EllipsisVertical,
  Monitor,
  Share,
  SquarePlus,
} from "lucide-react";
import { detectPlatform, isIosSafari, type Platform } from "@/lib/platform";

// Evento não tipado no lib.dom: Chrome/Edge no Android e desktop.
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallGuide() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [safari, setSafari] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(
    null,
  );

  useEffect(() => {
    // ?so=ios|android|desktop força a visão (conferir o passo a passo no desktop).
    const forced = new URLSearchParams(window.location.search).get("so");
    const detected = detectPlatform(
      navigator.userAgent,
      navigator.maxTouchPoints,
    );
    setPlatform(
      forced === "ios" || forced === "android" || forced === "desktop"
        ? forced
        : detected,
    );
    setSafari(isIosSafari(navigator.userAgent));
    setInstalled(isStandalone());

    const onPrompt = (e: Event) => {
      e.preventDefault(); // guarda o evento para disparar no nosso botão
      setPromptEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setPromptEvent(null); // o evento só vale uma vez
  }

  if (!platform) return <div className="h-40" aria-hidden />;

  if (installed) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <Check className="h-6 w-6 text-navy-900" aria-hidden />
          <p className="font-semibold">O Kangu já está instalado.</p>
        </div>
        <p className="mt-2 text-sm text-navy-700/70">
          Abra pelo ícone na tela inicial.
        </p>
      </Card>
    );
  }

  return (
    <div data-platform={platform} className="space-y-4">
      {platform === "android" && (
        <>
          {promptEvent && (
            <button
              type="button"
              onClick={install}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900"
            >
              <Download className="h-5 w-5" aria-hidden />
              Instalar o Kangu
            </button>
          )}
          <Card>
            <h2 className="font-semibold">
              {promptEvent ? "Ou instale manualmente" : "Como instalar no Android"}
            </h2>
            <Steps
              steps={[
                <>
                  Abra esta página no <b>Chrome</b>.
                </>,
                <>
                  Toque no menu{" "}
                  <EllipsisVertical className="inline h-4 w-4 align-text-bottom" aria-hidden />{" "}
                  (três pontinhos) no canto superior.
                </>,
                <>
                  Toque em <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>).
                </>,
                <>Confirme em <b>Instalar</b>. O ícone aparece na tela inicial.</>,
              ]}
            />
          </Card>
        </>
      )}

      {platform === "ios" && (
        <Card>
          <h2 className="font-semibold">Como instalar no iPhone</h2>
          {!safari && (
            <p className="mt-2 rounded-lg bg-yellow-400/30 px-3 py-2 text-sm">
              Você não está no Safari. Copie este endereço e abra no{" "}
              <b>Safari</b> — só ele instala apps na tela inicial do iPhone.
            </p>
          )}
          <Steps
            steps={[
              <>
                Abra esta página no{" "}
                <Compass className="inline h-4 w-4 align-text-bottom" aria-hidden />{" "}
                <b>Safari</b>.
              </>,
              <>
                Toque em <b>Compartilhar</b>{" "}
                <Share className="inline h-4 w-4 align-text-bottom" aria-hidden />{" "}
                (o quadrado com a seta para cima, na barra do Safari).
              </>,
              <>
                Role a lista e toque em <b>Adicionar à Tela de Início</b>{" "}
                <SquarePlus className="inline h-4 w-4 align-text-bottom" aria-hidden />.
              </>,
              <>
                Toque em <b>Adicionar</b>. O Kangu aparece na tela inicial.
              </>,
            ]}
          />
        </Card>
      )}

      {platform === "desktop" && (
        <Card>
          <div className="flex items-center gap-3">
            <Monitor className="h-6 w-6" aria-hidden />
            <h2 className="font-semibold">Abra no celular</h2>
          </div>
          <p className="mt-2 text-sm text-navy-700/70">
            O Kangu é feito para o celular. Abra{" "}
            <b className="break-all">{typeof window !== "undefined" ? window.location.host : ""}/baixar</b>{" "}
            no Android (Chrome) ou no iPhone (Safari) para instalar.
          </p>
          {promptEvent && (
            <button
              type="button"
              onClick={install}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 py-3 font-semibold text-navy-900"
            >
              <Download className="h-5 w-5" aria-hidden />
              Instalar neste computador
            </button>
          )}
        </Card>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">{children}</section>
  );
}

function Steps({ steps }: { steps: React.ReactNode[] }) {
  return (
    <ol className="mt-3 space-y-3">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3 text-sm leading-relaxed">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-xs font-semibold text-navy-900">
            {i + 1}
          </span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}
