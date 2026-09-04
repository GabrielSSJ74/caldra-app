/**
 * AURORA CALDRA 2.0 — fundo shader WebGL (domain warping sobre FBM).
 *
 * Um único contexto WebGL vive em `auroraEngine`; este componente apenas
 * empresta um container para o canvas compartilhado. Sem WebGL (ou com
 * contexto perdido), o componente degrada para a versão CSS anterior.
 *
 * `mode="auto"` → animado só no PRO, com o toggle ligado, sem
 * prefers-reduced-motion e com a aba visível. `mode="always"` (paywall)
 * anima em qualquer plano, respeitando apenas acessibilidade/visibilidade.
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
  className,
}: {
  mode?: "auto" | "always";
  className?: string;
}) {
  const { aurora } = useSettings();
  const { isMestre } = useFeatureAccess();
  const reduced = useReducedMotion();
  const visible = usePageVisible();
  const hostRef = useRef<HTMLDivElement>(null);
  const [shader, setShader] = useState(false);

  const wants = mode === "always" || (isMestre && aurora);
  const animated = wants && !reduced;

  /* Modo Oficina / alto contraste recuam a amplitude do shader. */
  const amp =
    typeof document !== "undefined" &&
    (document.documentElement.classList.contains("oficina") ||
      document.documentElement.classList.contains("high-contrast"))
      ? 0.6
      : 1;

  useEffect(() => {
    const engine = auroraEngine();
    const host = hostRef.current;
    if (!engine || !host || !engine.supported()) return;
    const release = engine.acquire(host, animated, amp);
    setShader(engine.supported());
    const off = engine.onStatus((ok) => setShader(ok));
    return () => {
      off();
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const engine = auroraEngine();
    const host = hostRef.current;
    if (!engine || !host) return;
    engine.update(host, animated && visible, amp);
  }, [animated, visible, amp]);

  return (
    <div
      aria-hidden
      className={cn("aurora-root pointer-events-none absolute inset-0 overflow-hidden", className)}
      data-animated={animated ? "on" : "off"}
      data-paused={animated && !visible ? "on" : "off"}
      data-shader={shader ? "on" : "off"}
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
