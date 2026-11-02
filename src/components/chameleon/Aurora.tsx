/**
 * AURORA CALDRA 2.0 — Motor de Fundo em Canvas 2D Nativo High-DPI (Single-Layer GPU Safe)
 *
 *  FLUIDO       → Seda Líquida Acetinada (Liquid Silk Mesh com 10 paradas senoidais).
 *  FLUID AURORA → Arquitetura Ultra-Silk Multi-Layer (Véus elípticos inclinados de 10 paradas).
 *  PADRÃO       → Fundo sólido do tema (transição suave de 650ms em opacidade).
 *
 * Estabilidade GPU Mobile & Nitidez 32-bit:
 *  - Renderizado em um único <canvas> na resolução física real do display (devicePixelRatio até 2x).
 *  - ZERO filtro de ruído, ZERO feTurbulence, ZERO textura de dithering e ZERO esticamento de baixa resolução.
 *  - ZERO `filter: blur()` em CSS, ZERO `hue-rotate()`, ZERO `mix-blend-mode` e ZERO camadas gigantes `vmax`.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/settings/SettingsProvider";
import { useFeatureAccess } from "@/lib/subscription/SubscriptionProvider";
import { useAIProcessing } from "@/lib/ai/aiProcessingContext";

const SINUSOIDAL_10_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0.0, 1.0],
  [0.15, 0.92],
  [0.3, 0.78],
  [0.45, 0.58],
  [0.6, 0.38],
  [0.75, 0.2],
  [0.88, 0.07],
  [0.95, 0.02],
  [1.0, 0.0],
];

function applySinusoidalStops(
  grad: CanvasGradient,
  r: number,
  g: number,
  b: number,
  baseAlpha: number,
) {
  for (let i = 0; i < SINUSOIDAL_10_STOPS.length; i++) {
    const [offset, mult] = SINUSOIDAL_10_STOPS[i]!;
    const a = Math.max(0, Math.min(1, baseAlpha * mult));
    grad.addColorStop(offset, `rgba(${r}, ${g}, ${b}, ${a.toFixed(5)})`);
  }
}

function drawEllipticalVeil(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotationRad: number,
  r: number,
  g: number,
  b: number,
  baseAlpha: number,
) {
  if (baseAlpha <= 0.001 || rx <= 1 || ry <= 1) return;
  ctx.save();
  ctx.translate(cx, cy);
  if (rotationRad !== 0) ctx.rotate(rotationRad);
  const scaleY = ry / rx;
  ctx.scale(1, scaleY);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  applySinusoidalStops(grad, r, g, b, baseAlpha);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

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
  const darkSurface = useDarkSurface();
  const amoledSurface = useAmoledSurface();
  const { isProcessing } = useAIProcessing();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /* Mantém qual estilo renderizar durante os 650ms de fade-out ao alternar para "padrao" */
  const [renderedStyle, setRenderedStyle] = useState<"fluido" | "suave">(
    auroraStyle === "fluido" ? "fluido" : "suave",
  );
  useEffect(() => {
    if (auroraStyle === "fluido" || auroraStyle === "suave") {
      setRenderedStyle(auroraStyle);
    }
  }, [auroraStyle]);

  const isAuroraVisible = active && auroraStyle !== "padrao";
  const [pausedAfterFade, setPausedAfterFade] = useState(!isAuroraVisible);

  useEffect(() => {
    if (isAuroraVisible) {
      setPausedAfterFade(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setPausedAfterFade(true);
    }, 660);
    return () => window.clearTimeout(timer);
  }, [isAuroraVisible]);

  const shaderStyle = renderedStyle === "fluido";
  const allowed =
    mode === "always" || isMestre || renderedStyle === "fluido" || renderedStyle === "suave";
  const animated = allowed && (isAuroraVisible || !pausedAfterFade) && pageVisible && !reduced;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let W = Math.max(1, window.innerWidth);
    let H = Math.max(1, window.innerHeight);

    const syncCanvasResolution = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, window.innerWidth);
      H = Math.max(1, window.innerHeight);
      const targetW = Math.round(W * dpr);
      const targetH = Math.round(H * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    };

    syncCanvasResolution();

    const isOficina =
      typeof document !== "undefined" &&
      (document.documentElement.classList.contains("oficina") ||
        document.documentElement.classList.contains("high-contrast"));
    const mult = (isOficina ? 0.65 : 1) * (amoledSurface ? 0.85 : 1);

    let rafId = 0;
    let lastDraw = 0;

    const renderFrame = (now: number) => {
      const t = now * 0.001;
      const maxDim = Math.max(W, H, 320);

      if (shaderStyle) {
        // ==================== ESTILO "FLUID" (Liquid Silk Mesh) ====================
        const baseGrad = ctx.createLinearGradient(0, 0, W * 0.6, H);
        if (amoledSurface) {
          baseGrad.addColorStop(0, "#05080F");
          baseGrad.addColorStop(0.52, "#09101C");
          baseGrad.addColorStop(1, "#05080F");
        } else if (darkSurface) {
          baseGrad.addColorStop(0, "#0D1420");
          baseGrad.addColorStop(0.52, "#111927");
          baseGrad.addColorStop(1, "#0D1420");
        } else {
          baseGrad.addColorStop(0, "#F2F6FC");
          baseGrad.addColorStop(0.52, "#E9F0FA");
          baseGrad.addColorStop(1, "#F2F6FC");
        }
        ctx.fillStyle = baseGrad;
        ctx.fillRect(0, 0, W, H);

        const x1 = W * (0.28 + 0.08 * Math.sin(t * 0.22));
        const y1 = H * (0.26 + 0.07 * Math.cos(t * 0.19));
        const x2 = W * (0.74 + 0.08 * Math.cos(t * 0.17 + 1.4));
        const y2 = H * (0.38 + 0.08 * Math.sin(t * 0.21 + 0.8));
        const x3 = W * (0.42 + 0.09 * Math.sin(t * 0.18 + 2.6));
        const y3 = H * (0.78 + 0.07 * Math.cos(t * 0.24 + 1.9));

        const rx = maxDim * 0.72;
        const ry = maxDim * 0.64;

        if (darkSurface) {
          drawEllipticalVeil(ctx, x1, y1, rx, ry, 0.2, 30, 58, 95, 0.75 * mult);
          drawEllipticalVeil(ctx, x2, y2, rx * 0.96, ry * 0.96, -0.3, 30, 38, 72, 0.7 * mult);
          drawEllipticalVeil(ctx, x3, y3, rx * 1.02, ry, 0.15, 22, 62, 82, 0.66 * mult);
        } else {
          drawEllipticalVeil(ctx, x1, y1, rx, ry, 0.2, 200, 220, 248, 0.82 * mult);
          drawEllipticalVeil(ctx, x2, y2, rx * 0.96, ry * 0.96, -0.3, 224, 220, 250, 0.78 * mult);
          drawEllipticalVeil(ctx, x3, y3, rx * 1.02, ry, 0.15, 255, 255, 255, 0.88 * mult);
        }
      } else {
        // ==================== ESTILO "FLUID AURORA" (Ultra-Silk Multi-Layer) ====================
        const baseGrad = ctx.createRadialGradient(
          W * 0.5,
          H * 0.15,
          0,
          W * 0.5,
          H * 0.5,
          maxDim * 1.1,
        );
        if (amoledSurface) {
          baseGrad.addColorStop(0, "#030509");
          baseGrad.addColorStop(1, "#000000");
        } else if (darkSurface) {
          baseGrad.addColorStop(0, "#0C1424");
          baseGrad.addColorStop(0.48, "#070B13");
          baseGrad.addColorStop(1, "#04060A");
        } else {
          baseGrad.addColorStop(0, "#FFFFFF");
          baseGrad.addColorStop(0.48, "#F4F6FA");
          baseGrad.addColorStop(1, "#E6EBF2");
        }
        ctx.fillStyle = baseGrad;
        ctx.fillRect(0, 0, W, H);

        const veilRx = maxDim * 0.66;
        const veilRy = maxDim * 0.48;

        // 1. Massa Delta — Ancoragem Azul/Esmeralda na base
        const dx = W * (0.35 + 0.14 * Math.sin(t * 0.19 + 0.5));
        const dy = H * (0.76 + 0.1 * Math.cos(t * 0.15 + 1.1));
        if (darkSurface) {
          drawEllipticalVeil(ctx, dx, dy, veilRx, veilRy, -0.18, 16, 185, 129, 0.34 * mult);
          drawEllipticalVeil(ctx, W - dx, H * 0.55, veilRx * 0.95, veilRy, 0.22, 14, 165, 233, 0.36 * mult);
        } else {
          drawEllipticalVeil(ctx, dx, dy, veilRx, veilRy, -0.18, 52, 211, 153, 0.28 * mult);
          drawEllipticalVeil(ctx, W - dx, H * 0.55, veilRx * 0.95, veilRy, 0.22, 56, 189, 248, 0.34 * mult);
        }

        // 2. Véu 1 — Âmbar Solar Suave (#F59E0B no Escuro / #FBBF24 no Claro)
        const ax = W * (0.28 + 0.14 * Math.cos(t * 0.23));
        const ay = H * (0.24 + 0.1 * Math.sin(t * 0.18));
        const aRot = -0.24 + 0.08 * Math.sin(t * 0.16);
        if (darkSurface) {
          drawEllipticalVeil(ctx, ax, ay, veilRx, veilRy * 0.92, aRot, 245, 158, 11, 0.36 * mult);
        } else {
          drawEllipticalVeil(ctx, ax, ay, veilRx, veilRy * 0.92, aRot, 251, 191, 36, 0.36 * mult);
        }

        // 3. Véu 2 — Coral / Carmesim Difuso (#E11D48 no Escuro / #F472B6 no Claro)
        const cx = W * (0.68 + 0.14 * Math.sin(t * 0.21 + 1.7));
        const cy = H * (0.3 + 0.11 * Math.cos(t * 0.17 + 0.9));
        const cRot = 0.2 + 0.09 * Math.cos(t * 0.15);
        if (darkSurface) {
          drawEllipticalVeil(ctx, cx, cy, veilRx * 0.96, veilRy * 0.9, cRot, 225, 29, 72, 0.31 * mult);
        } else {
          drawEllipticalVeil(ctx, cx, cy, veilRx * 0.96, veilRy * 0.9, cRot, 244, 114, 182, 0.32 * mult);
        }

        // 4. Véu 3 — Ciano Boreal (#0EA5E9 no Escuro / #38BDF8 no Claro)
        const bx = W * (0.72 + 0.13 * Math.cos(t * 0.2 + 2.4));
        const by = H * (0.52 + 0.12 * Math.sin(t * 0.22 + 1.2));
        const bRot = -0.28 + 0.08 * Math.sin(t * 0.19);
        if (darkSurface) {
          drawEllipticalVeil(ctx, bx, by, veilRx, veilRy * 0.94, bRot, 14, 165, 233, 0.36 * mult);
        } else {
          drawEllipticalVeil(ctx, bx, by, veilRx, veilRy * 0.94, bRot, 56, 189, 248, 0.38 * mult);
        }

        // 5. Véu 4 — Violeta / Índigo Atmosférico (#6366F1 no Escuro / #A78BFA no Claro)
        const vx = W * (0.38 + 0.15 * Math.sin(t * 0.17 + 3.1));
        const vy = H * (0.62 + 0.1 * Math.cos(t * 0.21 + 2.2));
        const vRot = 0.16 + 0.08 * Math.cos(t * 0.14);
        if (darkSurface) {
          drawEllipticalVeil(ctx, vx, vy, veilRx * 1.04, veilRy * 0.96, vRot, 99, 102, 241, 0.32 * mult);
        } else {
          drawEllipticalVeil(ctx, vx, vy, veilRx * 1.04, veilRy * 0.96, vRot, 167, 139, 250, 0.34 * mult);
        }

        // Realce superior suave em modo de processamento
        if (isProcessing) {
          drawEllipticalVeil(
            ctx,
            W * 0.5,
            H * 0.08,
            veilRx * 1.1,
            veilRy * 0.75,
            0,
            56,
            189,
            248,
            0.28 * mult,
          );
        }
      }
    };

    const handleResize = () => {
      syncCanvasResolution();
      renderFrame(performance.now());
    };

    window.addEventListener("resize", handleResize, { passive: true });

    // Desenha o primeiro frame imediatamente na resolução física real
    renderFrame(performance.now());

    if (!animated) {
      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }

    const loop = (now: number) => {
      if (now - lastDraw >= 32) {
        lastDraw = now;
        renderFrame(now);
      }
      rafId = window.requestAnimationFrame(loop);
    };

    rafId = window.requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [shaderStyle, animated, darkSurface, amoledSurface, isProcessing]);

  return (
    <div
      aria-hidden
      className={cn("aurora-root pointer-events-none fixed inset-0 z-0 overflow-hidden", className)}
      data-aurora-visible={isAuroraVisible ? "true" : "false"}
      data-animated={animated ? "on" : "off"}
      data-active={active ? "on" : "off"}
      data-style={shaderStyle ? "fluido" : "suave"}
      data-processing={isProcessing ? "active" : "idle"}
    >
      <canvas
        ref={canvasRef}
        className="aurora-canvas block size-full pointer-events-none"
        style={{ width: "100%", height: "100%", imageRendering: "auto" }}
      />
    </div>
  );
}
