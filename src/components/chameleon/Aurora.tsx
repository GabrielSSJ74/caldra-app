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

          {/* Camada 1: Arco Distante em azul profundo, índigo e violeta */}
          <div className="fluid-aurora-curtain fluid-curtain-distant">
            <div className="fluid-curtain-core fluid-core-distant" />
          </div>

          {/* Camada 2: Grande Cortina Diagonal Esquerda (faixas em leque esmeralda e ciano) */}
          <div className="fluid-aurora-curtain fluid-curtain-left-sweep">
            <div className="fluid-curtain-core fluid-core-left" />
          </div>

          {/* Camada 3: Grande Cortina Sedosa Verde Esmeralda Central */}
          <div className="fluid-aurora-curtain fluid-curtain-emerald-main">
            <div className="fluid-curtain-core fluid-core-emerald" />
          </div>

          {/* Camada 4: Fita Serpentine Central — A cortina vertical mais luminosa da foto */}
          <div className="fluid-aurora-curtain fluid-curtain-center-ribbon">
            <div className="fluid-curtain-core fluid-core-cyan" />
          </div>

          {/* Camada 5: Cortina de Magenta, Fúcsia e Vinho da Direita (chamas ionizadas da referência) */}
          <div className="fluid-aurora-curtain fluid-curtain-magenta-flame">
            <div className="fluid-curtain-core fluid-core-magenta" />
          </div>

          {/* Camada 6: Dobra Frontal Ativa com coroa turquesa e verde vivo */}
          <div className="fluid-aurora-curtain fluid-curtain-cyan-crest">
            <div className="fluid-curtain-core fluid-core-crest" />
          </div>

          {/* Camada 7: Estrias e Raios Verticais Polares (Rayed Band / filamentos de luz) */}
          <div className="fluid-aurora-curtain fluid-curtain-rays" />

          {/* Camada 8: Franja Superior Ionizada em Violeta e Magenta Suave */}
          <div className="fluid-aurora-curtain fluid-curtain-violet-crown">
            <div className="fluid-curtain-core fluid-core-violet" />
          </div>

          {/* Camada 9: Véu Secundário em Deriva e Brilho Residual Suave */}
          <div className="fluid-aurora-curtain fluid-curtain-subtle-veil" />

          {/* Vinheta atmosférica preservando legibilidade e contraste absoluto de UI */}
          <div className="fluid-aurora-vignette absolute inset-0 pointer-events-none" />
        </div>
      )}
    </div>
  );
}
