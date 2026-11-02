/**
 * AURORA CALDRA 2.0 — fundo do aplicativo em três estilos.
 *
 *  FLUIDO       → shader WebGL (domain warping sobre FBM), contexto ÚNICO
 *                 compartilhado por todo o app (`auroraEngine`).
 *  FLUID AURORA → Campo de Luz Cenográfica de 3 Âncoras ("Gradiente Térmico de Oficina"):
 *                 1. Base Sólida Aço Carbono (#0A0F18)
 *                 2. Luz de Foco / Calor da Forja (Âmbar #F59E0B 15% no Topo/Direita, 70vw, blur 150px)
 *                 3. Luz de Precisão CAD (Ciano/Azul-Aço #0EA5E9/#1E3A5F 12% no Centro/Esquerda, 80vw, blur 160px)
 *                 Com coreografia lenta de "Maré Térmica" (18s–24s ease-in-out alternate).
 *  PADRÃO       → nenhuma camada Aurora (fundo sólido do tema).
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/settings/SettingsProvider";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { auroraEngine } from "@/lib/aurora/auroraEngine";
import { useAIProcessing } from "@/lib/ai/aiProcessingContext";

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

  const { isProcessing } = useAIProcessing();

  /* PADRÃO: nenhuma camada — o fundo sólido do tema aparece. */
  if (auroraStyle === "padrao") return null;

  return (
    <div
      aria-hidden
      className={cn("aurora-root pointer-events-none absolute inset-0 overflow-hidden", className)}
      style={active ? undefined : { display: "none", contentVisibility: "hidden" }}
      data-animated={animated ? "on" : "off"}
      data-active={active ? "on" : "off"}
      data-style={wantsShader ? "fluido" : "suave"}
      data-processing={isProcessing ? "active" : "idle"}
    >
      <div ref={hostRef} className="aurora-gl absolute inset-0" />
      {!wantsShader && (
        <div
          className="aurora-css thermal-workshop-field pointer-events-none absolute inset-0 overflow-hidden"
          data-processing={isProcessing ? "active" : "idle"}
        >
          {/* 3. ÂNCORA BASE — Profundidade Estável / Aço Carbono (#0A0F18 preenchendo 100% da tela) */}
          <div className="thermal-anchor-base pointer-events-none absolute inset-0" />

          {/* 1. ÂNCORA TOPO/DIREITA — Luz de Foco / Calor da Forja (Âmbar Industrial #F59E0B, 70vw, top -10%, right -10%) */}
          <div className="thermal-anchor-forge pointer-events-none" />

          {/* 2. ÂNCORA CENTRO/ESQUERDA — Luz de Precisão CAD (Ciano Técnico / Azul-Aço #0EA5E9 / #1E3A5F, 80vw, top 35%, left -15%) */}
          <div className="thermal-anchor-cad pointer-events-none" />
        </div>
      )}
    </div>
  );
}
