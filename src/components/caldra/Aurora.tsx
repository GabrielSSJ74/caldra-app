/**
 * AURORA CALDRA 2.0 — fundo do aplicativo em três estilos.
 *
 *  FLUIDO   → shader WebGL (domain warping sobre FBM), contexto ÚNICO
 *             compartilhado por todo o app (`auroraEngine`).
 *  SUAVE    → blobs CSS (transform/opacity), pausados em background.
 *  ESTÁTICO → um frame congelado do estilo escolhido.
 *
 * `mode="auto"` → animado só no PRO, sem prefers-reduced-motion e com a
 * aba visível. `mode="always"` (paywall) anima em qualquer plano.
 * `active={false}` (rota sem Aurora) pausa sem desmontar — a animação
 * continua contínua ao navegar.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/settings/SettingsProvider";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { auroraEngine } from "@/lib/aurora/auroraEngine";

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

function usePageVisible() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const sync = () => setVisible(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return visible;
}

/** Detecta se a superfície atual é escura (dark / amoled) ou clara. */
function useDarkSurface() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setDark(el.classList.contains("dark"));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

function useAmoledSurface() {
  const [amoled, setAmoled] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setAmoled(el.classList.contains("amoled"));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return amoled;
}

export function AuroraBackground({
  mode = "auto",
  active = true,
  className,
}: {
  mode?: "auto" | "always";
  active?: boolean;
  className?: string;
}) {
  const { auroraStyle } = useSettings();
  const { isMestre } = useFeatureAccess();
  const reduced = useReducedMotion();
  const pageVisible = usePageVisible();
  const hostRef = useRef<HTMLDivElement>(null);
  const [glOk, setGlOk] = useState(true);
  const darkSurface = useDarkSurface();
  const amoledSurface = useAmoledSurface();

  /* FLUIDO ativa o shader tanto no tema escuro quanto no tema claro com paleta adaptada. */
  const shaderStyle = auroraStyle === "fluido";
  const wantsShader = shaderStyle && glOk;
  /* FLUIDO e FLUID AURORA animam continuamente para entregar a experiência viva */
  const allowed = mode === "always" || isMestre || auroraStyle === "fluido" || auroraStyle === "suave";
  const animated = allowed && active && pageVisible && !reduced;

  /* Modo Oficina / alto contraste recuam a amplitude do fundo. */
  const amp =
    typeof document !== "undefined" &&
    (document.documentElement.classList.contains("oficina") ||
      document.documentElement.classList.contains("high-contrast"))
      ? 0.6
      : 1;

  /* Empresta o container ao canvas compartilhado no estilo FLUIDO. */
  useEffect(() => {
    if (!shaderStyle) return;
    const engine = auroraEngine();
    const host = hostRef.current;
    if (!engine || !host) return;
    if (!engine.supported()) {
      setGlOk(false);
      return;
    }
    const release = engine.acquire(host, animated, amp, darkSurface, amoledSurface);
    const off = engine.onStatus((ok) => {
      setGlOk(ok);
    });
    return () => {
      off();
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shaderStyle]);

  useEffect(() => {
    if (!shaderStyle) return;
    const engine = auroraEngine();
    const host = hostRef.current;
    if (!engine || !host) return;
    engine.update(host, animated, amp, darkSurface, amoledSurface);
  }, [shaderStyle, animated, amp, darkSurface, amoledSurface]);

  /* PADRÃO: nenhuma camada — o fundo sólido do tema aparece. */
  if (auroraStyle === "padrao") return null;

  return (
    <div
      aria-hidden
      className={cn("aurora-root pointer-events-none absolute inset-0 overflow-hidden", className)}
      data-animated={animated ? "on" : "off"}
      data-active={active ? "on" : "off"}
      data-style={wantsShader ? "fluido" : "suave"}
    >
      <div ref={hostRef} className="aurora-gl absolute inset-0" />
      {!wantsShader && (
        <div className="aurora-css deep-space-container absolute inset-0">
          {/* Fundo base escuro e fosco (#04060A → #070B13 → #0C1424) */}
          <div className="deep-space-base absolute inset-0" />

          {/* Iluminação ambiente permanente (anti-flicker garantido) */}
          <div className="deep-space-ambient absolute inset-0" />

          {/* 1. CAMADA DISTANTE — ampla, profunda e serena (azul cobalto / índigo) */}
          <div className="deep-space-field field-distant">
            <div className="field-inner field-inner-distant" />
          </div>

          {/* 2. CAMADA INTERMEDIÁRIA — índigo para violeta com pulso cromático */}
          <div className="deep-space-field field-mid">
            <div className="field-inner field-inner-mid" />
            <div className="field-core field-core-mid" />
          </div>

          {/* 3. CAMADA PRINCIPAL — ponto focal dinâmico com núcleo de luz viva */}
          <div className="deep-space-field field-main">
            <div className="field-inner field-inner-main" />
            <div className="field-core field-core-main" />
          </div>

          {/* 4. CAMADA DE TRANSIÇÃO — violeta para magenta discreto e acetinado */}
          <div className="deep-space-field field-trans">
            <div className="field-inner field-inner-trans" />
            <div className="field-core field-core-trans" />
          </div>

          {/* 5. CAMADA DE DETALHE — halo celestial ágil e concentrado */}
          <div className="deep-space-field field-detail">
            <div className="field-inner field-inner-detail" />
            <div className="field-core field-core-detail" />
          </div>

          {/* Vinheta suave cinematográfica preservando contraste e legibilidade impecável */}
          <div className="deep-space-vignette absolute inset-0 pointer-events-none" />
        </div>
      )}
    </div>
  );
}
