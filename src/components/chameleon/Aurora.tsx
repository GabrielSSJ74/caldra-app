/**
 * AURORA CALDRA 2.0 — Motor de Fundo em Canvas 2D Nativo High-DPI (Single-Layer GPU Safe)
 *
 *  FLUIDO       → Seda Líquida Acetinada (Liquid Silk Mesh com 10 paradas senoidais).
 *  FLUID AURORA → Refinamento Óptico em 3 Planos de Profundidade:
 *                 - Curva Gaussiana de 5 Paradas (0% [100%], 22% [75%], 48% [42%], 74% [14%], 100% [0%])
 *                 - Fusão Óptica Limpa (`screen` no tema Escuro/AMOLED para interseções luminosas puras)
 *                 - Hierarquia Espacial em 3 Planos (Protagonista no Topo, Ritmo Central, Ancoragem na Base)
 *                 - Coreografia Autônoma Assíncrona em 4 Estágios (0% -> 33% -> 66% -> 100%) com ciclos primos
 *                   descompassados (18s, 23s, 29s, 34s, 37s, 41s) e respiração escalar (0.92 a 1.12) a 60 FPS.
 *  PADRÃO       → Fundo sólido do tema (transição suave de 650ms em opacidade).
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

/**
 * Curva Gaussiana de 5 Paradas (5-Stop Exponential Falloff) para o FLUID AURORA:
 *  - 0%   (0.00): 100% da opacidade de núcleo calibrada da massa
 *  - 22%  (0.22): 75% da opacidade inicial (núcleo macio, sem ponto duro estourado)
 *  - 48%  (0.48): 42% da opacidade inicial (zona de transição média)
 *  - 74%  (0.74): 14% da opacidade inicial (cauda longa de difusão atmosférica)
 *  - 100% (1.00): 0% de opacidade (transparent)
 */
const GAUSSIAN_5_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0.0, 1.0],
  [0.22, 0.75],
  [0.48, 0.42],
  [0.74, 0.14],
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

function applyGaussian5Stops(
  grad: CanvasGradient,
  r: number,
  g: number,
  b: number,
  baseAlpha: number,
) {
  for (let i = 0; i < GAUSSIAN_5_STOPS.length; i++) {
    const [offset, mult] = GAUSSIAN_5_STOPS[i]!;
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
  useGaussian5Stop = false,
) {
  if (baseAlpha <= 0.001 || rx <= 1 || ry <= 1) return;
  ctx.save();
  ctx.translate(cx, cy);
  if (rotationRad !== 0) ctx.rotate(rotationRad);
  const scaleY = ry / rx;
  ctx.scale(1, scaleY);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  if (useGaussian5Stop) {
    applyGaussian5Stops(grad, r, g, b, baseAlpha);
  } else {
    applySinusoidalStops(grad, r, g, b, baseAlpha);
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Estágio de keyframe para a Coreografia Autônoma em 4 Estágios (0% -> 33% -> 66% -> 100%).
 *  - dx, dy: deslocamento em fração da largura/altura da tela
 *  - scale: respiração escalar da massa (0.92 a 1.12)
 *  - rot: rotação orgânica em radianos
 *  - alphaMod: modulação sutil de respiração luminosa
 */
interface FourStageKeyframe {
  readonly dx: number;
  readonly dy: number;
  readonly scale: number;
  readonly rot: number;
  readonly alphaMod: number;
}

type FourStageTrack = readonly [
  FourStageKeyframe, // 0% (e 100% para loop contínuo perfeito)
  FourStageKeyframe, // 33%
  FourStageKeyframe, // 66%
];

/**
 * Interpola suavemente os 4 estágios (0% -> 33% -> 66% -> 100%) usando a curva
 * senoidal pura equivalente a `cubic-bezier(0.37, 0, 0.63, 1)`.
 */
function sampleFourStageTrack(
  tSec: number,
  durationSec: number,
  delaySec: number,
  track: FourStageTrack,
): FourStageKeyframe {
  const elapsed = tSec - delaySec;
  const phase = ((elapsed % durationSec) + durationSec) % durationSec;
  const progress = phase / durationSec; // [0, 1)

  const segmentFloat = progress * 3;
  const segIndex = Math.min(2, Math.floor(segmentFloat));
  const localT = segmentFloat - segIndex;
  // Easing cubic-bezier(0.37, 0, 0.63, 1) (senoide contínua sem aceleração mecânica)
  const u = 0.5 * (1 - Math.cos(Math.PI * localT));

  const k0 = track[segIndex]!;
  const k1 = track[(segIndex + 1) % 3]!;

  return {
    dx: k0.dx + (k1.dx - k0.dx) * u,
    dy: k0.dy + (k1.dy - k0.dy) * u,
    scale: k0.scale + (k1.scale - k0.scale) * u,
    rot: k0.rot + (k1.rot - k0.rot) * u,
    alphaMod: k0.alphaMod + (k1.alphaMod - k0.alphaMod) * u,
  };
}

/**
 * Trilhas autônomas em 4 estágios (0% -> 33% -> 66% -> 100%) com respiração escalar (0.92 a 1.12):
 * Cada massa possui sua própria trajetória orbital independente.
 */
// Plano 1 (Protagonista Superior — Âmbar Solar): ciclo primo 34s, delay -19s
const TRACK_PLANO1_AMBER: FourStageTrack = [
  { dx: 0.0, dy: 0.0, scale: 1.0, rot: -0.22, alphaMod: 1.0 },
  { dx: 0.11, dy: 0.05, scale: 1.12, rot: -0.14, alphaMod: 1.05 },
  { dx: -0.07, dy: 0.03, scale: 0.94, rot: -0.28, alphaMod: 0.95 },
];

// Plano 1 Complementar (Foco Superior-Direito — Coral/Carmesim): ciclo primo 23s, delay -11s
const TRACK_PLANO1_CORAL: FourStageTrack = [
  { dx: 0.0, dy: 0.0, scale: 0.98, rot: 0.18, alphaMod: 0.98 },
  { dx: -0.1, dy: 0.06, scale: 1.1, rot: 0.26, alphaMod: 1.04 },
  { dx: 0.08, dy: -0.04, scale: 0.92, rot: 0.11, alphaMod: 0.94 },
];

// Plano 2 (Ritmo e Transição Central-Direita — Ciano Boreal): ciclo primo 29s, delay -17s
const TRACK_PLANO2_CYAN: FourStageTrack = [
  { dx: 0.0, dy: 0.0, scale: 0.96, rot: -0.26, alphaMod: 0.98 },
  { dx: -0.11, dy: -0.06, scale: 1.09, rot: -0.17, alphaMod: 1.04 },
  { dx: 0.07, dy: 0.07, scale: 0.93, rot: -0.33, alphaMod: 0.94 },
];

// Plano 2 (Ritmo e Transição Central-Esquerda — Violeta/Índigo): ciclo primo 18s, delay -5s
const TRACK_PLANO2_VIOLET: FourStageTrack = [
  { dx: 0.0, dy: 0.0, scale: 0.95, rot: 0.15, alphaMod: 0.97 },
  { dx: 0.12, dy: -0.05, scale: 1.11, rot: 0.24, alphaMod: 1.05 },
  { dx: -0.09, dy: 0.06, scale: 0.92, rot: 0.08, alphaMod: 0.93 },
];

// Plano 3 (Ancoragem Profunda Base Esquerda — Esmeralda): ciclo primo 41s, delay -31s
const TRACK_PLANO3_EMERALD: FourStageTrack = [
  { dx: 0.0, dy: 0.0, scale: 1.0, rot: -0.16, alphaMod: 1.0 },
  { dx: 0.09, dy: -0.03, scale: 1.1, rot: -0.09, alphaMod: 1.05 },
  { dx: -0.08, dy: 0.03, scale: 0.94, rot: -0.22, alphaMod: 0.95 },
];

// Plano 3 (Ancoragem Profunda Base Direita / Dock — Azul Horizonte): ciclo primo 37s, delay -23s
const TRACK_PLANO3_HORIZON_BLUE: FourStageTrack = [
  { dx: 0.0, dy: 0.0, scale: 0.99, rot: 0.2, alphaMod: 0.99 },
  { dx: -0.09, dy: 0.04, scale: 1.11, rot: 0.12, alphaMod: 1.04 },
  { dx: 0.08, dy: -0.03, scale: 0.93, rot: 0.27, alphaMod: 0.95 },
];

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

    const renderFrame = (now: number) => {
      const t = now * 0.001;
      const maxDim = Math.max(W, H, 320);

      ctx.globalCompositeOperation = "source-over";

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
          drawEllipticalVeil(ctx, x1, y1, rx, ry, 0.2, 30, 58, 95, 0.75 * mult, false);
          drawEllipticalVeil(ctx, x2, y2, rx * 0.96, ry * 0.96, -0.3, 30, 38, 72, 0.7 * mult, false);
          drawEllipticalVeil(ctx, x3, y3, rx * 1.02, ry, 0.15, 22, 62, 82, 0.66 * mult, false);
        } else {
          drawEllipticalVeil(ctx, x1, y1, rx, ry, 0.2, 200, 220, 248, 0.82 * mult, false);
          drawEllipticalVeil(ctx, x2, y2, rx * 0.96, ry * 0.96, -0.3, 224, 220, 250, 0.78 * mult, false);
          drawEllipticalVeil(ctx, x3, y3, rx * 1.02, ry, 0.15, 255, 255, 255, 0.88 * mult, false);
        }
      } else {
        // ==================== ESTILO "FLUID AURORA" (Refinamento Óptico em 3 Planos) ====================
        // Base profunda com difusão atmosférica suave
        const baseGrad = ctx.createRadialGradient(
          W * 0.5,
          H * 0.15,
          0,
          W * 0.5,
          H * 0.5,
          maxDim * 1.15,
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

        // Fusão óptica limpa (`screen` no tema Escuro/AMOLED): quando duas massas autônomas
        // se cruzam, suas bordas gaussianas somam luz pura sem gerar faixas acinzentadas/marrons.
        ctx.globalCompositeOperation = darkSurface ? "screen" : "source-over";

        // -------------------------------------------------------------------------
        // PLANO 3 — MASSAS DE ANCORAGEM PROFUNDA (Base / Continue Trabalhando e Dock)
        // Difusão horizontal mais larga e suave (blur 110px equiv.), ancorando o horizonte inferior.
        // -------------------------------------------------------------------------
        const p3Emerald = sampleFourStageTrack(t, 41, -31, TRACK_PLANO3_EMERALD);
        const p3Blue = sampleFourStageTrack(t, 37, -23, TRACK_PLANO3_HORIZON_BLUE);

        const p3Rx = maxDim * 0.88;
        const p3Ry = maxDim * 0.54;

        const emeraldX = W * (0.34 + p3Emerald.dx);
        const emeraldY = H * (0.82 + p3Emerald.dy);
        const horizonBlueX = W * (0.68 + p3Blue.dx);
        const horizonBlueY = H * (0.76 + p3Blue.dy);

        if (darkSurface) {
          // Massa Esmeralda (#10B981 -> rgb(16, 185, 129))
          drawEllipticalVeil(
            ctx,
            emeraldX,
            emeraldY,
            p3Rx * p3Emerald.scale,
            p3Ry * p3Emerald.scale,
            p3Emerald.rot,
            16,
            185,
            129,
            0.32 * p3Emerald.alphaMod * mult,
            true,
          );
          // Massa Azul Horizonte (#0EA5E9 -> rgb(14, 165, 233))
          drawEllipticalVeil(
            ctx,
            horizonBlueX,
            horizonBlueY,
            p3Rx * 0.94 * p3Blue.scale,
            p3Ry * 0.96 * p3Blue.scale,
            p3Blue.rot,
            14,
            165,
            233,
            0.34 * p3Blue.alphaMod * mult,
            true,
          );
        } else {
          // Massa Esmeralda Claro (#34D399 -> rgb(52, 211, 153))
          drawEllipticalVeil(
            ctx,
            emeraldX,
            emeraldY,
            p3Rx * p3Emerald.scale,
            p3Ry * p3Emerald.scale,
            p3Emerald.rot,
            52,
            211,
            153,
            0.28 * p3Emerald.alphaMod * mult,
            true,
          );
          // Massa Azul Horizonte Claro (#38BDF8 -> rgb(56, 189, 248))
          drawEllipticalVeil(
            ctx,
            horizonBlueX,
            horizonBlueY,
            p3Rx * 0.94 * p3Blue.scale,
            p3Ry * 0.96 * p3Blue.scale,
            p3Blue.rot,
            56,
            189,
            248,
            0.34 * p3Blue.alphaMod * mult,
            true,
          );
        }

        // -------------------------------------------------------------------------
        // PLANO 2 — MASSAS DE RITMO E TRANSIÇÃO (Zona Central / Especialização)
        // Diâmetro médio (blur 75px–85px equiv.) e movimento orbital suave nas laterais/diagonais,
        // conduzindo o olhar sem criar manchas excessivas sob os textos centrais.
        // -------------------------------------------------------------------------
        const p2Cyan = sampleFourStageTrack(t, 29, -17, TRACK_PLANO2_CYAN);
        const p2Violet = sampleFourStageTrack(t, 18, -5, TRACK_PLANO2_VIOLET);

        const p2Rx = maxDim * 0.68;
        const p2Ry = maxDim * 0.48;

        const cyanX = W * (0.8 + p2Cyan.dx);
        const cyanY = H * (0.48 + p2Cyan.dy);
        const violetX = W * (0.22 + p2Violet.dx);
        const violetY = H * (0.56 + p2Violet.dy);

        if (darkSurface) {
          // Massa Ciano Boreal (#0EA5E9 -> rgb(14, 165, 233))
          drawEllipticalVeil(
            ctx,
            cyanX,
            cyanY,
            p2Rx * p2Cyan.scale,
            p2Ry * p2Cyan.scale,
            p2Cyan.rot,
            14,
            165,
            233,
            0.34 * p2Cyan.alphaMod * mult,
            true,
          );
          // Massa Violeta / Índigo Atmosférico (#6366F1 -> rgb(99, 102, 241))
          drawEllipticalVeil(
            ctx,
            violetX,
            violetY,
            p2Rx * 1.04 * p2Violet.scale,
            p2Ry * 0.98 * p2Violet.scale,
            p2Violet.rot,
            99,
            102,
            241,
            0.31 * p2Violet.alphaMod * mult,
            true,
          );
        } else {
          // Massa Ciano Boreal Claro (#38BDF8 -> rgb(56, 189, 248))
          drawEllipticalVeil(
            ctx,
            cyanX,
            cyanY,
            p2Rx * p2Cyan.scale,
            p2Ry * p2Cyan.scale,
            p2Cyan.rot,
            56,
            189,
            248,
            0.38 * p2Cyan.alphaMod * mult,
            true,
          );
          // Massa Violeta / Índigo Claro (#A78BFA -> rgb(167, 139, 250))
          drawEllipticalVeil(
            ctx,
            violetX,
            violetY,
            p2Rx * 1.04 * p2Violet.scale,
            p2Ry * 0.98 * p2Violet.scale,
            p2Violet.rot,
            167,
            139,
            250,
            0.34 * p2Violet.alphaMod * mult,
            true,
          );
        }

        // -------------------------------------------------------------------------
        // PLANO 1 — MASSA PROTAGONISTA (Foco Superior / Boas-vindas)
        // Raio de difusão amplo e envolvente (blur 105px–110px equiv.) e respiração calma (34s / 23s),
        // iluminando o topo e convidando o olhar para os primeiros cartões de ação.
        // -------------------------------------------------------------------------
        const p1Amber = sampleFourStageTrack(t, 34, -19, TRACK_PLANO1_AMBER);
        const p1Coral = sampleFourStageTrack(t, 23, -11, TRACK_PLANO1_CORAL);

        const p1Rx = maxDim * 0.82;
        const p1Ry = maxDim * 0.58;

        const amberX = W * (0.26 + p1Amber.dx);
        const amberY = H * (0.18 + p1Amber.dy);
        const coralX = W * (0.68 + p1Coral.dx);
        const coralY = H * (0.24 + p1Coral.dy);

        if (darkSurface) {
          // Massa Protagonista Âmbar Solar (#F59E0B -> rgb(245, 158, 11))
          drawEllipticalVeil(
            ctx,
            amberX,
            amberY,
            p1Rx * p1Amber.scale,
            p1Ry * p1Amber.scale,
            p1Amber.rot,
            245,
            158,
            11,
            0.36 * p1Amber.alphaMod * mult,
            true,
          );
          // Massa Complementar Superior Coral / Carmesim (#E11D48 -> rgb(225, 29, 72))
          drawEllipticalVeil(
            ctx,
            coralX,
            coralY,
            p1Rx * 0.88 * p1Coral.scale,
            p1Ry * 0.86 * p1Coral.scale,
            p1Coral.rot,
            225,
            29,
            72,
            0.3 * p1Coral.alphaMod * mult,
            true,
          );
        } else {
          // Massa Protagonista Âmbar Solar Claro (#FBBF24 -> rgb(251, 191, 36))
          drawEllipticalVeil(
            ctx,
            amberX,
            amberY,
            p1Rx * p1Amber.scale,
            p1Ry * p1Amber.scale,
            p1Amber.rot,
            251,
            191,
            36,
            0.36 * p1Amber.alphaMod * mult,
            true,
          );
          // Massa Complementar Superior Coral / Rosa Quartzo (#F472B6 -> rgb(244, 114, 182))
          drawEllipticalVeil(
            ctx,
            coralX,
            coralY,
            p1Rx * 0.88 * p1Coral.scale,
            p1Ry * 0.86 * p1Coral.scale,
            p1Coral.rot,
            244,
            114,
            182,
            0.32 * p1Coral.alphaMod * mult,
            true,
          );
        }

        // Realce superior suave em modo de processamento
        if (isProcessing) {
          drawEllipticalVeil(
            ctx,
            W * 0.5,
            H * 0.08,
            p1Rx * 1.05,
            p1Ry * 0.72,
            0,
            56,
            189,
            248,
            0.28 * mult,
            true,
          );
        }

        ctx.globalCompositeOperation = "source-over";
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
      renderFrame(now);
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
