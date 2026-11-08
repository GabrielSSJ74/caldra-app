import React, { useEffect, useRef, useState } from "react";
import { useSettings } from "@/lib/settings/SettingsProvider";
import { useAIProcessing } from "@/lib/ai/aiProcessingContext";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { cn } from "@/lib/utils";
import {
  auroraEngine,
  VERT,
  FRAG,
  PALETTE_DARK,
  PALETTE_LIGHT,
  PALETTE_AMOLED,
  resolveAuroraEnginePalette,
} from "@/lib/aurora/auroraEngine";

export {
  VERT as VERTEX_SHADER_SOURCE,
  FRAG as FRAGMENT_SHADER_SOURCE,
  PALETTE_DARK,
  PALETTE_LIGHT,
  PALETTE_AMOLED,
  resolveAuroraEnginePalette,
};

export const AURORA_LIQUID_TARGET_FPS = 60;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
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

/**
 * Renderizador 1:1 do estilo FLUIDO copiado diretamente do repositório Gabrielz69/Caldra-Code,
 * mantendo COSMOS RADIAL e PADRÃO 100% isolados em <AuroraBackground />.
 */
export const AuroraLiquidShader = React.memo(function AuroraLiquidShader({
  active = true,
  mode = "auto",
  className,
}: {
  active?: boolean;
  mode?: "auto" | "always";
  className?: string;
}) {
  const { auroraStyle, accent, useAccentInOrbs } = useSettings();
  const { isMestre } = useFeatureAccess();
  const { isProcessing, isContinuous } = useAIProcessing();
  const reduced = useReducedMotion();
  const pageVisible = usePageVisible();
  const darkSurface = useDarkSurface();
  const amoledSurface = useAmoledSurface();

  const hostRef = useRef<HTMLDivElement>(null);
  const [glOk, setGlOk] = useState(true);

  const shaderStyle =
    auroraStyle === "fluido" || (auroraStyle as string) === "fluid";
  const wantsShader = shaderStyle && glOk;
  const allowed = mode === "always" || isMestre || shaderStyle;
  const isVisible = active && allowed && shaderStyle;
  const animated = allowed && active && pageVisible && !reduced;
  const aiActive = isProcessing || isContinuous;

  /* Modo Oficina / alto contraste recuam a amplitude do fundo (exatamente como em Caldra-Code). */
  const baseAmp =
    typeof document !== "undefined" &&
    (document.documentElement.classList.contains("oficina") ||
      document.documentElement.classList.contains("high-contrast"))
      ? 0.6
      : 1;
  const amp = aiActive ? Math.min(1.25, baseAmp * 1.15) : baseAmp;

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
    const release = engine.acquire(
      host,
      animated,
      amp,
      darkSurface,
      amoledSurface,
      useAccentInOrbs,
      accent,
    );
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
    engine.update(
      host,
      animated,
      amp,
      darkSurface,
      amoledSurface,
      useAccentInOrbs,
      accent,
    );
  }, [shaderStyle, animated, amp, darkSurface, amoledSurface, useAccentInOrbs, accent]);

  if (!shaderStyle) return null;

  return (
    <div
      aria-hidden
      data-testid="aurora-liquid-shader-root"
      data-visible={isVisible ? "true" : "false"}
      data-animated={animated ? "on" : "off"}
      data-active={active ? "on" : "off"}
      data-style={wantsShader ? "fluido" : "suave"}
      data-orbs-accent={useAccentInOrbs ? "true" : "false"}
      data-processing={aiActive ? "active" : "idle"}
      data-fps-mode="60fps"
      data-grid="none"
      className={cn(
        "aurora-root pointer-events-none fixed inset-0 z-0 overflow-hidden",
        className,
      )}
    >
      <div ref={hostRef} className="aurora-gl absolute inset-0" />
    </div>
  );
});
