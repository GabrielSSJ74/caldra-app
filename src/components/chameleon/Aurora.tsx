/**
 * AURORA CALDRA — fundo animado (mesh gradient fluido) em CSS puro.
 * Camadas: base escura + 4 massas de luz com blur extremo + microgranulação.
 * Animação exclusivamente em transform/opacity.
 *
 * `mode="auto"` → animado só no PRO, com o toggle ligado, sem
 * prefers-reduced-motion e com a aba visível. `mode="always"` (paywall)
 * anima em qualquer plano, respeitando apenas acessibilidade/visibilidade.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/settings/SettingsProvider";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";

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

  const wants = mode === "always" || (isMestre && aurora);
  const animated = wants && !reduced;

  return (
    <div
      aria-hidden
      className={cn("aurora-root pointer-events-none absolute inset-0 overflow-hidden", className)}
      data-animated={animated ? "on" : "off"}
      data-paused={animated && !visible ? "on" : "off"}
    >
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
  );
}
