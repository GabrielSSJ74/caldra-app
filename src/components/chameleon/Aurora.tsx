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
        <div className="aurora-css fluid-aurora-container absolute inset-0">
          {/* Céu noturno profundo (#05070C → #0A0F18) */}
          <div className="fluid-aurora-sky absolute inset-0" />

          {/* Céu estrelado astronômico ultra discreto (pontos estelares finos como na foto de referência) */}
          <div className="fluid-aurora-stars absolute inset-0 pointer-events-none" />

          {/* Resplendor atmosférico ionoférico (brilho difuso e dispersão ambiental) */}
          <div className="fluid-aurora-glow absolute inset-0" />

          {/* 1. Verde Zênite Amplo (Oxigênio atômico superior dominante) */}
          <div className="fluid-aurora-mass fluid-mass-high-emerald">
            <div className="fluid-mass-flow fluid-flow-high-emerald" />
            <div className="fluid-mass-filament fluid-filament-high-emerald" />
            <div className="fluid-mass-core fluid-core-high-emerald" />
          </div>

          {/* 2. Vermelho Carmesim Raro (Evento excepcional da alta ionosfera em ciclo longo) */}
          <div className="fluid-aurora-mass fluid-mass-high-crimson">
            <div className="fluid-mass-flow fluid-flow-high-crimson" />
            <div className="fluid-mass-core fluid-core-high-crimson" />
          </div>

          {/* 3. Grande Massa Verde Esmeralda Central (Identidade dominante da aurora) */}
          <div className="fluid-aurora-mass fluid-mass-mid-emerald">
            <div className="fluid-mass-flow fluid-flow-mid-emerald" />
            <div className="fluid-mass-filament fluid-filament-mid-emerald" />
            <div className="fluid-mass-core fluid-core-mid-emerald" />
          </div>

          {/* 4. Pluma Ciano & Turquesa Intermediária (Luz ativa e transição) */}
          <div className="fluid-aurora-mass fluid-mass-mid-cyan">
            <div className="fluid-mass-flow fluid-flow-mid-cyan" />
            <div className="fluid-mass-filament fluid-filament-mid-cyan" />
            <div className="fluid-mass-core fluid-core-mid-cyan" />
          </div>

          {/* 5. Vórtice Azul Safira Discreto (Profundidade e contraste frio) */}
          <div className="fluid-aurora-mass fluid-mass-mid-blue">
            <div className="fluid-mass-flow fluid-flow-mid-blue" />
            <div className="fluid-mass-core fluid-core-mid-blue" />
          </div>

          {/* 6. Pluma Rosa e Magenta na Base (Segunda camada de importância) */}
          <div className="fluid-aurora-mass fluid-mass-low-magenta">
            <div className="fluid-mass-flow fluid-flow-low-magenta" />
            <div className="fluid-mass-filament fluid-filament-low-magenta" />
            <div className="fluid-mass-core fluid-core-low-magenta" />
          </div>

          {/* 7. Massa Violeta e Púrpura Inferior (Transição discreta) */}
          <div className="fluid-aurora-mass fluid-mass-low-violet">
            <div className="fluid-mass-flow fluid-flow-low-violet" />
            <div className="fluid-mass-core fluid-core-low-violet" />
          </div>

          {/* 8. Zona de Confluência Âmbar/Dourada (Mistura orgânica onde verde e rosa se tocam) */}
          <div className="fluid-aurora-mass fluid-mass-low-amber">
            <div className="fluid-mass-flow fluid-flow-low-amber" />
            <div className="fluid-mass-core fluid-core-low-amber" />
          </div>

          {/* 9. Massa Inferior de Base Verde/Ciano (Presença luminosa no rodapé de ponta a ponta) */}
          <div className="fluid-aurora-mass fluid-mass-bottom-emerald">
            <div className="fluid-mass-flow fluid-flow-bottom-emerald" />
            <div className="fluid-mass-filament fluid-filament-bottom-emerald" />
            <div className="fluid-mass-core fluid-core-bottom-emerald" />
          </div>

          {/* Vinheta atmosférica preservando legibilidade e contraste absoluto de UI */}
          <div className="fluid-aurora-vignette absolute inset-0 pointer-events-none" />
        </div>
      )}
    </div>
  );
}
