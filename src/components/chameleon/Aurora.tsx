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

const NOISE =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E";

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
  /* Só escondemos os blobs CSS quando o canvas do shader está REALMENTE
     montado e desenhando. Sem isto, uma falha silenciosa do WebGL deixa a
     tela sem nenhum fundo. */
  const [shaderLive, setShaderLive] = useState(false);

  const wantsShader = auroraStyle === "fluido" && glOk && shaderLive;
  /* PRO anima; FREE vê o frame congelado do mesmo estilo. */
  const allowed = mode === "always" || isMestre;
  const animated =
    allowed && active && pageVisible && !reduced && auroraStyle !== "estatico";

  /* Modo Oficina / alto contraste recuam a amplitude do fundo. */
  const amp =
    typeof document !== "undefined" &&
    (document.documentElement.classList.contains("oficina") ||
      document.documentElement.classList.contains("high-contrast"))
      ? 0.6
      : 1;

  /* Empresta o container ao canvas compartilhado só no estilo FLUIDO. */
  useEffect(() => {
    if (auroraStyle !== "fluido") {
      setShaderLive(false);
      return;
    }
    const engine = auroraEngine();
    const host = hostRef.current;
    if (!engine || !host) {
      setShaderLive(false);
      return;
    }
    if (!engine.supported()) {
      setGlOk(false);
      setShaderLive(false);
      return;
    }
    const release = engine.acquire(host, animated, amp);
    const off = engine.onStatus((ok) => {
      setGlOk(ok);
      if (!ok) setShaderLive(false);
    });
    /* Confirmação factual: o canvas foi mesmo anexado a este container. */
    setShaderLive(!!host.querySelector("canvas"));
    return () => {
      off();
      release();
      setShaderLive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auroraStyle]);

  useEffect(() => {
    if (auroraStyle !== "fluido") return;
    const engine = auroraEngine();
    const host = hostRef.current;
    if (!engine || !host) return;
    engine.update(host, animated, amp);
  }, [auroraStyle, animated, amp]);

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
      <div className="aurora-css absolute inset-0">
        <div className="aurora-base absolute inset-0" />
        <div className="aurora-blob aurora-blob-1" />
        <div className="aurora-blob aurora-blob-2" />
        <div className="aurora-blob aurora-blob-3" />
        <div className="aurora-blob aurora-blob-4" />
        <div
          className="aurora-grain absolute inset-0"
          style={{ backgroundImage: `url("${NOISE}")` }}
        />
      </div>
    </div>
  );
}
