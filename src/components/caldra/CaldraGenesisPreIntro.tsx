import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface CaldraGenesisPreIntroProps {
  onComplete: () => void;
  forceOriginalColors?: boolean;
  className?: string;
}

/**
 * Avalia com exatidão matemática a curva cubic-bezier(0.22, 1, 0.36, 1) para t ∈ [0, 1].
 */
function cubicBezier022_1_036_1(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  const x1 = 0.22;
  const x2 = 0.36;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  let u = t;
  for (let i = 0; i < 6; i++) {
    const x = ((ax * u + bx) * u + cx) * u - t;
    if (Math.abs(x) < 1e-6) break;
    const dx = (3 * ax * u + 2 * bx) * u + cx;
    if (Math.abs(dx) < 1e-6) break;
    u -= x / dx;
  }
  u = Math.max(0, Math.min(1, u));
  const inv = 1 - u;
  return 1 - inv * inv * inv;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function easeInOutCubic(t: number): number {
  const c = clamp01(t);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

// ============================================================================
// GEOMETRIA DE VIEWBOX 1000x1000 (VETORIZAÇÃO EXATA DA LOGO OFICIAL)
// ============================================================================

// 1. Haste 1 (Sup-Esq — Branco Prateado)
const PATH_HASTE_1 = "M 462,152 L 645,152 L 278,508 L 264,494 L 264,353 Z";

// 2. Haste 2 (Inf-Esq — Branco / Chanfro Azul Royal)
const PATH_HASTE_2_BODY =
  "M 231,381 L 231,498 L 345,613 L 398,613 L 510,725 L 268,725 L 140,598 L 140,470 Z";
const PATH_HASTE_2_CHAMFER = "M 268,725 L 510,725 L 452,777 L 320,777 Z";

// 3. Haste 3 (Sup-Dir — Azul Ciano / Chanfro Azul Royal)
const PATH_HASTE_3_CHAMFER = "M 558,263 L 702,263 L 754,315 L 502,315 Z";
const PATH_HASTE_3_BODY =
  "M 502,315 L 754,315 L 876,438 L 876,588 L 788,675 L 788,542 L 695,448 L 622,448 Z";

// 4. Haste 4 (Inf-Dir — Azul Ciano)
const PATH_HASTE_4 = "M 742,520 L 756,534 L 756,692 L 585,862 L 388,862 Z";

// 5. Estrela Central (Contorno Côncavo Preciso — Centro em 497, 514)
const PATH_STAR_CONTOUR =
  "M 497,345 C 512,462 532,482 666,514 C 532,546 512,566 497,683 C 482,566 462,546 328,514 C 462,482 482,462 497,345 Z";

// Camadas de sombreamento tonal suave da estrela (stroke="none", sem cruz divisória)
const PATH_STAR_TOP_RIGHT_SHADE =
  "M 497,345 C 512,462 532,482 666,514 L 497,514 Z";
const PATH_STAR_BOTTOM_RIGHT_SHADE =
  "M 497,514 L 666,514 C 532,546 512,566 497,683 Z";
const PATH_STAR_LEFT_GLOW =
  "M 497,345 L 497,683 C 482,566 462,546 328,514 C 462,482 482,462 497,345 Z";

// Vértices de quina das 4 garras e da estrela central para arestas 3D (25px) e OSNAP
const EXTRUSION_VERTICES: ReadonlyArray<{
  readonly x: number;
  readonly y: number;
  readonly snapAt: number; // instante (s) em que o SNAP de interseção pisca
  readonly primary?: boolean;
}> = [
  // Haste 1
  { x: 462, y: 152, snapAt: 0.18, primary: true },
  { x: 645, y: 152, snapAt: 0.36, primary: true },
  { x: 278, y: 508, snapAt: 0.72, primary: true },
  { x: 264, y: 494, snapAt: 0.84 },
  { x: 264, y: 353, snapAt: 1.05, primary: true },
  // Haste 2
  { x: 231, y: 381, snapAt: 0.22, primary: true },
  { x: 231, y: 498, snapAt: 0.42 },
  { x: 345, y: 613, snapAt: 0.58 },
  { x: 398, y: 613, snapAt: 0.70 },
  { x: 510, y: 725, snapAt: 0.88, primary: true },
  { x: 268, y: 725, snapAt: 1.08, primary: true },
  { x: 140, y: 598, snapAt: 1.22, primary: true },
  { x: 140, y: 470, snapAt: 1.38 },
  { x: 452, y: 777, snapAt: 1.15 },
  { x: 320, y: 777, snapAt: 1.32 },
  // Haste 3
  { x: 558, y: 263, snapAt: 0.25 },
  { x: 702, y: 263, snapAt: 0.45, primary: true },
  { x: 754, y: 315, snapAt: 0.62, primary: true },
  { x: 502, y: 315, snapAt: 0.78 },
  { x: 876, y: 438, snapAt: 0.86, primary: true },
  { x: 876, y: 588, snapAt: 1.04, primary: true },
  { x: 788, y: 675, snapAt: 1.18, primary: true },
  { x: 788, y: 542, snapAt: 1.28 },
  { x: 695, y: 448, snapAt: 1.36 },
  { x: 622, y: 448, snapAt: 1.44 },
  // Haste 4
  { x: 742, y: 520, snapAt: 0.30, primary: true },
  { x: 756, y: 534, snapAt: 0.48 },
  { x: 756, y: 692, snapAt: 0.76, primary: true },
  { x: 585, y: 862, snapAt: 1.06, primary: true },
  { x: 388, y: 862, snapAt: 1.34, primary: true },
  // Estrela Central (4 pontas alongadas)
  { x: 497, y: 345, snapAt: 0.55, primary: true },
  { x: 666, y: 514, snapAt: 0.85, primary: true },
  { x: 497, y: 683, snapAt: 1.15, primary: true },
  { x: 328, y: 514, snapAt: 1.42, primary: true },
];

// Segmentos de parede lateral externa para dar volume translúcido realista às 4 garras e estrela
const EXTRUSION_WALL_SEGMENTS: ReadonlyArray<
  readonly [number, number, number, number]
> = [
  // Haste 1
  [462, 152, 645, 152],
  [645, 152, 278, 508],
  [264, 494, 264, 353],
  [264, 353, 462, 152],
  // Haste 2
  [140, 470, 231, 381],
  [140, 598, 140, 470],
  [268, 725, 140, 598],
  [268, 725, 510, 725],
  [452, 777, 320, 777],
  // Haste 3
  [558, 263, 702, 263],
  [754, 315, 876, 438],
  [876, 438, 876, 588],
  [876, 588, 788, 675],
  // Haste 4
  [756, 534, 756, 692],
  [756, 692, 585, 862],
  [585, 862, 388, 862],
  [388, 862, 742, 520],
];

// Linhas de construção isométricas de 30°, 90° e 150° pré-calculadas (evita 27x Math.cos/sin a 60Hz)
const ISOMETRIC_ANGLES_DEG = [30, 90, 150] as const;
const ISOMETRIC_OFFSETS = [-640, -480, -320, -160, 0, 160, 320, 480, 640] as const;

const STATIC_ISOMETRIC_LINES: ReadonlyArray<{
  readonly key: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}> = ISOMETRIC_ANGLES_DEG.flatMap((angle) => {
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const nx = -sin;
  const ny = cos;
  const len = 820;
  return ISOMETRIC_OFFSETS.map((offset) => {
    const cx = 800 + nx * offset;
    const cy = 806 + ny * offset;
    return {
      key: `${angle}-${offset}`,
      x1: cx - cos * len,
      y1: cy - sin * len,
      x2: cx + cos * len,
      y2: cy + sin * len,
    };
  });
});

const StaticGridDefs = React.memo(function StaticGridDefs() {
  return (
    <defs>
      {/* Sub-malha fina de CAD (0.5px, rgba(56, 189, 248, 0.1)) */}
      <pattern
        id="caldra-iso-subgrid"
        width="32"
        height="32"
        patternUnits="userSpaceOnUse"
      >
        <path
          d="M 32 0 L 0 0 0 32"
          fill="none"
          stroke="rgba(56, 189, 248, 0.1)"
          strokeWidth="0.5"
        />
        {/* Grid Snap Points nas interseções */}
        <circle
          cx="0"
          cy="0"
          r="0.85"
          fill="rgba(56, 189, 248, 0.22)"
        />
      </pattern>

      {/* Malha principal de prancheta com snap points destacados */}
      <pattern
        id="caldra-iso-majgrid"
        width="160"
        height="160"
        patternUnits="userSpaceOnUse"
      >
        <rect width="160" height="160" fill="url(#caldra-iso-subgrid)" />
        <path
          d="M 160 0 L 0 0 0 160"
          fill="none"
          stroke="rgba(56, 189, 248, 0.18)"
          strokeWidth="0.75"
        />
        <circle
          cx="0"
          cy="0"
          r="1.8"
          fill="rgba(148, 163, 184, 0.35)"
        />
      </pattern>

      <radialGradient id="caldra-grid-vignette" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
        <stop offset="62%" stopColor="#FFFFFF" stopOpacity="0.85" />
        <stop offset="88%" stopColor="#FFFFFF" stopOpacity="0.24" />
        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
      </radialGradient>

      <mask id="caldra-grid-mask">
        <rect width="1600" height="1600" fill="url(#caldra-grid-vignette)" />
      </mask>
    </defs>
  );
});

const StaticLogoDefs = React.memo(function StaticLogoDefs() {
  return (
    <defs>
      {/* Haste 1 (Sup-Esq): Branco Prateado */}
      <linearGradient id="caldra-h1-grad" x1="55%" y1="15%" x2="26%" y2="51%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="55%" stopColor="#EBF3FF" />
        <stop offset="100%" stopColor="#C8DCF8" />
      </linearGradient>

      {/* Haste 2 (Inf-Esq): Branco Gelo -> Prata Azulado */}
      <linearGradient id="caldra-h2-body-grad" x1="18%" y1="38%" x2="48%" y2="73%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="52%" stopColor="#DCEBFE" />
        <stop offset="100%" stopColor="#A6CAFA" />
      </linearGradient>

      {/* Haste 2 Chanfro: Azul Royal */}
      <linearGradient id="caldra-h2-chamfer-grad" x1="0%" y1="50%" x2="100%" y2="50%">
        <stop offset="0%" stopColor="#0055FF" />
        <stop offset="100%" stopColor="#0088FF" />
      </linearGradient>

      {/* Haste 3 Chanfro: Azul Royal */}
      <linearGradient id="caldra-h3-chamfer-grad" x1="0%" y1="50%" x2="100%" y2="50%">
        <stop offset="0%" stopColor="#0051FF" />
        <stop offset="100%" stopColor="#0084FF" />
      </linearGradient>

      {/* Haste 3 Corpo (Sup-Dir): Azul Ciano -> Azul Royal */}
      <linearGradient id="caldra-h3-body-grad" x1="82%" y1="32%" x2="65%" y2="68%">
        <stop offset="0%" stopColor="#00E1FF" />
        <stop offset="48%" stopColor="#0095FF" />
        <stop offset="100%" stopColor="#0044EE" />
      </linearGradient>

      {/* Haste 4 (Inf-Dir): Azul Royal -> Azul Ciano */}
      <linearGradient id="caldra-h4-grad" x1="39%" y1="86%" x2="76%" y2="52%">
        <stop offset="0%" stopColor="#0044EE" />
        <stop offset="50%" stopColor="#0088FF" />
        <stop offset="100%" stopColor="#00E1FF" />
      </linearGradient>

      {/* Sistema de Degradê Contínuo em Camadas Suaves da Estrela Central (Centro em 497, 514) */}
      <linearGradient id="starBaseGrad" x1="0%" y1="50%" x2="100%" y2="35%">
        <stop offset="0%" stopColor="#00E6FF" />
        <stop offset="42%" stopColor="#00B2FF" />
        <stop offset="68%" stopColor="#006AFF" />
        <stop offset="100%" stopColor="#0044E8" />
      </linearGradient>

      <linearGradient id="starTopRightShade" x1="0%" y1="100%" x2="75%" y2="15%">
        <stop offset="0%" stopColor="#0044E8" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#002AB9" stopOpacity="0.85" />
      </linearGradient>

      <linearGradient id="starBottomRightShade" x1="0%" y1="0%" x2="60%" y2="80%">
        <stop offset="0%" stopColor="#009BFF" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#005FFF" stopOpacity="0.45" />
      </linearGradient>

      <linearGradient id="starLeftGlow" x1="0%" y1="50%" x2="100%" y2="50%">
        <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.65" />
        <stop offset="65%" stopColor="#00B9FF" stopOpacity="0.25" />
        <stop offset="100%" stopColor="#0082FF" stopOpacity="0" />
      </linearGradient>

      <radialGradient id="caldra-star-bloom-rad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#00D2FF" stopOpacity="0.72" />
        <stop offset="42%" stopColor="#0088FF" stopOpacity="0.36" />
        <stop offset="75%" stopColor="#0044E8" stopOpacity="0.12" />
        <stop offset="100%" stopColor="#002AB9" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
});

const TOTAL_DURATION_MS = 5000;
const FADEOUT_DURATION_MS = 300;
// 25px de profundidade física convertidos para a escala do SVG 1000x1000 (palco 450px -> ~55.5 unidades)
const EXTRUSION_25PX_SVG_UNITS = 55.5;

/**
 * SPLASH SCREEN / INTRODUÇÃO CINEMATOGRÁFICA CAD (5 SEGUNDOS - 5000ms)
 * Extrusão 3D com volume de peça (25px) sobre grid técnico de CAD isométrico (30°, 90°, 150°),
 * traçado em tempo real com SNAP de interseções, rotação orbital para vista frontal (0°),
 * revelação dos gradientes oficiais e Star Bloom direcional em (497, 514).
 */
export function CaldraGenesisPreIntro({
  onComplete,
  className,
}: CaldraGenesisPreIntroProps) {
  const [elapsed, setElapsed] = useState(0);
  const [fadingOut, setFadingOut] = useState(false);
  const completedRef = useRef(false);

  useEffect(() => {
    let rafId: number | null = null;
    let fadeTimer: number | null = null;
    const startTime = performance.now();

    const tick = (now: number) => {
      const dt = now - startTime;
      if (dt < TOTAL_DURATION_MS) {
        setElapsed(dt);
        rafId = window.requestAnimationFrame(tick);
      } else {
        setElapsed(TOTAL_DURATION_MS);
        setFadingOut(true);
        fadeTimer = window.setTimeout(() => {
          if (!completedRef.current) {
            completedRef.current = true;
            onComplete();
          }
        }, FADEOUT_DURATION_MS);
      }
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (fadeTimer !== null) window.clearTimeout(fadeTimer);
    };
  }, [onComplete]);

  // ==========================================================================
  // CÁLCULO MATEMÁTICO DAS 5 FASES (0.0s -> 5.0s)
  // ==========================================================================
  const tSec = elapsed / 1000;

  // Fase 1 (0.0s – 1.8s): O Traçado de CAD em Isométrico com Volume 3D (25px)
  const gridDraw = easeInOutCubic(tSec / 1.0);
  const bladesDraw = easeInOutCubic((tSec - 0.04) / 1.42);
  const extrusionDraw = easeInOutCubic((tSec - 0.16) / 1.48);
  const starDraw = easeInOutCubic((tSec - 0.32) / 1.42);

  // Fase 2 (1.8s – 3.1s): Giro Cinematográfico em 3D
  // Rotaciona de rotateX(60deg) rotateY(0deg) rotateZ(-38deg) scale(0.85) -> 0deg, scale(1.0)
  const rotProgress = cubicBezier022_1_036_1(clamp01((tSec - 1.8) / 1.3));
  const rotateXDeg = 60 * (1 - rotProgress);
  const rotateYDeg = 0;
  const rotateZDeg = -38 * (1 - rotProgress);
  const stageScale = 0.85 + 0.15 * rotProgress;

  // O grid de CAD e o anel elíptico suavizam lentamente para opacity -> 0.05
  const gridCenterFade = clamp01(1 - 0.95 * easeInOutCubic((tSec - 1.8) / 1.25));
  const orbitalRingsOpacity = clamp01(1 - easeInOutCubic((tSec - 1.8) / 1.15));

  // Volume 3D de 25px (translateZ(-25px)) visível na fase isométrica e recolhendo-se durante o giro frontal
  const extrusionVolumeOpacity =
    tSec <= 1.8
      ? clamp01((tSec - 0.1) / 0.55)
      : clamp01(1 - easeInOutCubic((tSec - 1.8) / 1.05));

  // Deslocamento projetado no espaço SVG para conectar com exatidão matemática
  // cada vértice da face frontal (translateZ(0px)) ao vértice da face traseira (translateZ(-25px))
  const rxRad = (rotateXDeg * Math.PI) / 180;
  const rzRad = (rotateZDeg * Math.PI) / 180;
  const extrudeDx =
    EXTRUSION_25PX_SVG_UNITS * Math.tan(rxRad) * Math.sin(rzRad) * extrusionDraw;
  const extrudeDy =
    EXTRUSION_25PX_SVG_UNITS * Math.tan(rxRad) * Math.cos(rzRad) * extrusionDraw;

  // Fase 3 (3.1s – 3.9s): Revelação dos Gradientes Oficiais
  const fillOpacity = easeInOutCubic((tSec - 3.1) / 0.8);
  // As linhas brancas do wireframe desaparecem 100% (opacity -> 0) quando a logo colorida frontal se consolida
  const wireframeStrokeOpacity =
    tSec < 3.1 ? 1 : clamp01(1 - easeInOutCubic((tSec - 3.1) / 0.75));

  // Fase 4 (3.9s – 4.6s): O Brilho da Estrela (Star Bloom em 497, 514)
  // Fase 5 (4.6s – 5.0s): Estabilização de Finalização por 400ms
  const rawBloomWindow = clamp01((tSec - 3.9) / 0.7);
  const bloomPulse = Math.sin(rawBloomWindow * Math.PI);
  const settledGlow = tSec >= 3.9 ? clamp01((tSec - 3.9) / 0.4) * 0.24 : 0;
  const starGlowIntensity = clamp01(
    bloomPulse + settledGlow * (1 - bloomPulse * 0.55),
  );

  return (
    <div
      aria-hidden="true"
      className={cn(
        "fixed inset-0 z-[200] flex items-center justify-center overflow-hidden select-none pointer-events-auto",
        className,
      )}
      style={{
        backgroundColor: "#030712",
        opacity: fadingOut ? 0 : 1,
        transition: `opacity ${FADEOUT_DURATION_MS}ms ease-out`,
      }}
    >
      {/* Atmosfera escura técnica de bancada CAD */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(10, 25, 52, 0.52) 0%, rgba(4, 10, 22, 0.90) 56%, #030712 100%)",
        }}
      />

      {/* ==================================================================== */}
      {/* CONTAINER DE PERSPECTIVA 3D (perspective: 1100px; preserve-3d)       */}
      {/* ==================================================================== */}
      <div
        className="relative flex items-center justify-center"
        style={{
          width: "min(86vw, 450px)",
          height: "min(86vw, 450px)",
          perspective: "1100px",
          transformStyle: "preserve-3d",
        }}
      >
        {/* ================================================================== */}
        {/* CÂMERA / GRUPO 3D EM CONSTRUÇÃO ISOMÉTRICA -> FRONTAL              */}
        {/* ================================================================== */}
        <div
          className="relative size-full"
          style={{
            transformStyle: "preserve-3d",
            transform: `rotateX(${rotateXDeg.toFixed(3)}deg) rotateY(${rotateYDeg}deg) rotateZ(${rotateZDeg.toFixed(3)}deg) scale(${stageScale.toFixed(4)})`,
            willChange: "transform",
          }}
        >
          {/* ---------------------------------------------------------------- */}
          {/* CAMADA 1: GRID TÉCNICO DE CAD EM PERSPECTIVA (translateZ(-30px)) */}
          {/* Malha convergente 0.5px, eixos 30°/90°/150°, snap points e anéis */}
          {/* ---------------------------------------------------------------- */}
          <div
            className="pointer-events-none absolute inset-[-55%]"
            style={{
              transform: "translateZ(-30px)",
              opacity: gridCenterFade,
              willChange: "opacity, transform",
            }}
          >
            <svg
              viewBox="0 0 1600 1600"
              className="size-full overflow-visible"
              xmlns="http://www.w3.org/2000/svg"
            >
              <StaticGridDefs />

              <g mask="url(#caldra-grid-mask)">
                {/* Plano da malha CAD */}
                <rect width="1600" height="1600" fill="url(#caldra-iso-majgrid)" />

                {/* Eixos clássicos de prancheta isométrica: 30°, 90° e 150° */}
                <g
                  stroke="rgba(56, 189, 248, 0.14)"
                  strokeWidth="0.6"
                  strokeDasharray="6 6"
                >
                  {STATIC_ISOMETRIC_LINES.map((line) => (
                    <line
                      key={line.key}
                      x1={line.x1}
                      y1={line.y1}
                      x2={line.x2}
                      y2={line.y2}
                      pathLength={1}
                      strokeDashoffset={1 - gridDraw}
                    />
                  ))}
                </g>

                {/* Eixos principais ortogonais X e Y passando pelo centro da peça */}
                <line
                  x1="60"
                  y1="806"
                  x2="1540"
                  y2="806"
                  stroke="rgba(255, 255, 255, 0.20)"
                  strokeWidth="1.2"
                  strokeDasharray="10 7"
                  pathLength={1}
                  strokeDashoffset={1 - gridDraw}
                />
                <line
                  x1="798"
                  y1="60"
                  x2="798"
                  y2="1540"
                  stroke="rgba(255, 255, 255, 0.20)"
                  strokeWidth="1.2"
                  strokeDasharray="10 7"
                  pathLength={1}
                  strokeDashoffset={1 - gridDraw}
                />

                {/* Elipses/Anéis de referência orbitais no chão da bancada */}
                {orbitalRingsOpacity > 0.01 && (
                  <g opacity={orbitalRingsOpacity}>
                    <circle
                      cx="798"
                      cy="806"
                      r="442"
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.22)"
                      strokeWidth="1.4"
                      pathLength={1}
                      strokeDashoffset={1 - gridDraw}
                    />
                    <circle
                      cx="798"
                      cy="806"
                      r="392"
                      fill="none"
                      stroke="rgba(56, 189, 248, 0.20)"
                      strokeWidth="1.0"
                      strokeDasharray="12 8"
                      pathLength={1}
                      strokeDashoffset={1 - gridDraw}
                    />
                    <circle
                      cx="798"
                      cy="806"
                      r="525"
                      fill="none"
                      stroke="rgba(56, 189, 248, 0.12)"
                      strokeWidth="0.8"
                      strokeDasharray="4 10"
                      pathLength={1}
                      strokeDashoffset={1 - gridDraw}
                    />
                  </g>
                )}
              </g>
            </svg>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* CAMADA 2: FACE TRASEIRA DO VOLUME 3D (translateZ(-25px))         */}
          {/* Profundidade física real de 25px das 4 garras e estrela central  */}
          {/* ---------------------------------------------------------------- */}
          {extrusionVolumeOpacity > 0.004 && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                transform: "translateZ(-25px)",
                opacity: extrusionVolumeOpacity * 0.45,
              }}
            >
              <svg
                viewBox="0 0 1000 1000"
                className="size-full overflow-visible"
                xmlns="http://www.w3.org/2000/svg"
              >
                <g
                  fill="rgba(56, 189, 248, 0.03)"
                  stroke="rgba(255, 255, 255, 0.42)"
                  strokeWidth="1.2"
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                >
                  <path
                    d={PATH_HASTE_1}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - extrusionDraw}
                  />
                  <path
                    d={PATH_HASTE_2_BODY}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - extrusionDraw}
                  />
                  <path
                    d={PATH_HASTE_2_CHAMFER}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - extrusionDraw}
                  />
                  <path
                    d={PATH_HASTE_3_CHAMFER}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - extrusionDraw}
                  />
                  <path
                    d={PATH_HASTE_3_BODY}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - extrusionDraw}
                  />
                  <path
                    d={PATH_HASTE_4}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - extrusionDraw}
                  />
                  <path
                    d={PATH_STAR_CONTOUR}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - extrusionDraw}
                  />
                </g>
              </svg>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* CAMADA 2B: FATIA INTERMEDIÁRIA DE VOLUME (translateZ(-12.5px))   */}
          {/* Reforça a densidade da extrusão 3D durante o estágio isométrico  */}
          {/* ---------------------------------------------------------------- */}
          {extrusionVolumeOpacity > 0.01 && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                transform: "translateZ(-12.5px)",
                opacity: extrusionVolumeOpacity * 0.22,
              }}
            >
              <svg
                viewBox="0 0 1000 1000"
                className="size-full overflow-visible"
                xmlns="http://www.w3.org/2000/svg"
              >
                <g
                  fill="none"
                  stroke="rgba(56, 189, 248, 0.45)"
                  strokeWidth="0.9"
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray="6 4"
                >
                  <path d={PATH_HASTE_1} />
                  <path d={PATH_HASTE_2_BODY} />
                  <path d={PATH_HASTE_2_CHAMFER} />
                  <path d={PATH_HASTE_3_CHAMFER} />
                  <path d={PATH_HASTE_3_BODY} />
                  <path d={PATH_HASTE_4} />
                  <path d={PATH_STAR_CONTOUR} />
                </g>
              </svg>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* CAMADA 3: FACE FRONTAL + ARESTAS DE ESPESSURA 3D (translateZ(0)) */}
          {/* ---------------------------------------------------------------- */}
          <div
            className="relative size-full"
            style={{
              transform: "translateZ(0px)",
            }}
          >
            <svg
              viewBox="0 0 1000 1000"
              className="size-full overflow-visible"
              xmlns="http://www.w3.org/2000/svg"
            >
              <StaticLogoDefs />

              {/* ============================================================ */}
              {/* VOLUME DE PEÇA 3D (25px): PAREDES LATERAIS E ARESTAS DE 1PX  */}
              {/* Conectam translateZ(0px) a translateZ(-25px) com rgba(255,255,255,0.4) */}
              {/* ============================================================ */}
              {extrusionVolumeOpacity > 0.004 && (
                <g opacity={extrusionVolumeOpacity}>
                  {/* Paredes laterais translúcidas do volume usinado */}
                  <g fill="rgba(56, 189, 248, 0.055)" stroke="none">
                    {EXTRUSION_WALL_SEGMENTS.map(([x1, y1, x2, y2], idx) => (
                      <polygon
                        key={`wall-${idx}`}
                        points={`${x1},${y1} ${x2},${y2} ${x2 + extrudeDx},${y2 + extrudeDy} ${x1 + extrudeDx},${y1 + extrudeDy}`}
                      />
                    ))}
                  </g>

                  {/* Contorno projetado da base (-25px) para fechamento exato com as arestas */}
                  <g
                    transform={`translate(${extrudeDx.toFixed(2)}, ${extrudeDy.toFixed(2)})`}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.36)"
                    strokeWidth="1.1"
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                  >
                    <path
                      d={PATH_HASTE_1}
                      pathLength={1}
                      strokeDasharray={1}
                      strokeDashoffset={1 - extrusionDraw}
                    />
                    <path
                      d={PATH_HASTE_2_BODY}
                      pathLength={1}
                      strokeDasharray={1}
                      strokeDashoffset={1 - extrusionDraw}
                    />
                    <path
                      d={PATH_HASTE_2_CHAMFER}
                      pathLength={1}
                      strokeDasharray={1}
                      strokeDashoffset={1 - extrusionDraw}
                    />
                    <path
                      d={PATH_HASTE_3_CHAMFER}
                      pathLength={1}
                      strokeDasharray={1}
                      strokeDashoffset={1 - extrusionDraw}
                    />
                    <path
                      d={PATH_HASTE_3_BODY}
                      pathLength={1}
                      strokeDasharray={1}
                      strokeDashoffset={1 - extrusionDraw}
                    />
                    <path
                      d={PATH_HASTE_4}
                      pathLength={1}
                      strokeDasharray={1}
                      strokeDashoffset={1 - extrusionDraw}
                    />
                    <path
                      d={PATH_STAR_CONTOUR}
                      pathLength={1}
                      strokeDasharray={1}
                      strokeDashoffset={1 - extrusionDraw}
                    />
                  </g>

                  {/* Linhas de cantos de 1px em wireframe translúcido (rgba(255, 255, 255, 0.4)) */}
                  <g
                    stroke="rgba(255, 255, 255, 0.4)"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round"
                  >
                    {EXTRUSION_VERTICES.map((v, idx) => (
                      <line
                        key={`edge-${idx}`}
                        x1={v.x}
                        y1={v.y}
                        x2={v.x + extrudeDx}
                        y2={v.y + extrudeDy}
                      />
                    ))}
                  </g>
                </g>
              )}

              {/* ============================================================ */}
              {/* FASE 3 (3.1s – 3.9s): REVELAÇÃO DOS GRADIENTES OFICIAIS      */}
              {/* ============================================================ */}
              {fillOpacity > 0.002 && (
                <g opacity={fillOpacity} stroke="none">
                  {/* Haste 1 (Sup-Esq — Branco Prateado) */}
                  <path d={PATH_HASTE_1} fill="url(#caldra-h1-grad)" stroke="none" />

                  {/* Haste 2 (Inf-Esq — Branco / Chanfro Azul Royal sem fresta subpixel) */}
                  <path d={PATH_HASTE_2_BODY} fill="url(#caldra-h2-body-grad)" stroke="none" />
                  <path
                    d="M 267.5,724.2 L 509.5,724.2 L 510,725 L 452,777 L 320,777 L 268,725 Z"
                    fill="url(#caldra-h2-chamfer-grad)"
                    stroke="none"
                  />

                  {/* Haste 3 (Sup-Dir — Corpo Azul Ciano / Chanfro Azul Royal sem fresta subpixel) */}
                  <path d={PATH_HASTE_3_BODY} fill="url(#caldra-h3-body-grad)" stroke="none" />
                  <path
                    d="M 558,263 L 702,263 L 754,315 L 754.8,315.8 L 502.8,315.8 L 502,315 Z"
                    fill="url(#caldra-h3-chamfer-grad)"
                    stroke="none"
                  />

                  {/* Haste 4 (Inf-Dir — Azul Ciano) */}
                  <path d={PATH_HASTE_4} fill="url(#caldra-h4-grad)" stroke="none" />

                  {/* Pulso luminoso radial difuso posicionado POR TRÁS da estrela central */}
                  {starGlowIntensity > 0.01 && (
                    <circle
                      cx="497"
                      cy="514"
                      r={145 + 75 * bloomPulse}
                      fill="url(#caldra-star-bloom-rad)"
                      opacity={starGlowIntensity}
                      pointerEvents="none"
                    />
                  )}

                  {/* Estrela Central de 4 Pontas (Centro 497, 514) — Degradê Contínuo Fiel à 3ª Imagem */}
                  <g
                    stroke="none"
                    style={{
                      filter:
                        starGlowIntensity > 0.02
                          ? `drop-shadow(0 0 ${Math.round(24 * starGlowIntensity)}px rgba(0, 210, 255, ${(0.75 * starGlowIntensity).toFixed(2)}))`
                          : undefined,
                    }}
                  >
                    {/* Camada 1 — Corpo Base Unificado */}
                    <path d={PATH_STAR_CONTOUR} fill="url(#starBaseGrad)" stroke="none" />
                    {/* Camada 2 — Relevo Tonal Superior-Direito */}
                    <path
                      d={PATH_STAR_TOP_RIGHT_SHADE}
                      fill="url(#starTopRightShade)"
                      stroke="none"
                    />
                    {/* Camada 3 — Nuance Tonal Inferior-Direita */}
                    <path
                      d={PATH_STAR_BOTTOM_RIGHT_SHADE}
                      fill="url(#starBottomRightShade)"
                      stroke="none"
                    />
                    {/* Camada 4 — Luz Suave na Metade Esquerda */}
                    <path d={PATH_STAR_LEFT_GLOW} fill="url(#starLeftGlow)" stroke="none" />
                  </g>
                </g>
              )}

              {/* ============================================================ */}
              {/* FASE 1 (0.0s – 1.8s): TRAÇADO VETORIAL CAD EM TEMPO REAL     */}
              {/* Ocultado completamente (opacity 0) quando a logo fica frontal */}
              {/* ============================================================ */}
              {wireframeStrokeOpacity > 0.002 && (
                <g
                  fill="none"
                  stroke="#FFFFFF"
                  strokeOpacity={wireframeStrokeOpacity}
                  strokeWidth="2.1"
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                >
                  {/* Haste 1 */}
                  <path
                    d={PATH_HASTE_1}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - bladesDraw}
                  />
                  {/* Haste 2 + Chanfro */}
                  <path
                    d={PATH_HASTE_2_BODY}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - bladesDraw}
                  />
                  <path
                    d={PATH_HASTE_2_CHAMFER}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - bladesDraw}
                  />
                  {/* Haste 3 + Chanfro */}
                  <path
                    d={PATH_HASTE_3_CHAMFER}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - bladesDraw}
                  />
                  <path
                    d={PATH_HASTE_3_BODY}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - bladesDraw}
                  />
                  {/* Haste 4 */}
                  <path
                    d={PATH_HASTE_4}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - bladesDraw}
                  />
                  {/* Contorno Côncavo Externo da Estrela Central (sem cruz interna) */}
                  <path
                    d={PATH_STAR_CONTOUR}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - starDraw}
                    strokeOpacity={clamp01(1 - fillOpacity)}
                  />
                </g>
              )}

              {/* ============================================================ */}
              {/* SNAP DE INTERSEÇÕES CAD (OSNAP MARKERS PISCANDO NAS QUINAS)  */}
              {/* Simula canetas vetoriais CAD e SNAP nas quinas em 0.0s–1.8s  */}
              {/* ============================================================ */}
              {tSec < 2.25 && (
                <g pointerEvents="none">
                  {EXTRUSION_VERTICES.map((v, idx) => {
                    if (!v.primary) return null;
                    const dtSnap = tSec - v.snapAt;
                    if (dtSnap < 0) return null;
                    // Pisca forte ao atingir a interseção e mantém marcador técnico suave até o início do giro
                    const flash =
                      dtSnap < 0.28 ? Math.sin((dtSnap / 0.28) * Math.PI) : 0;
                    const hold =
                      tSec < 1.8 ? 0.38 : clamp01(1 - (tSec - 1.8) / 0.4) * 0.38;
                    const snapAlpha = clamp01(flash * 0.95 + hold);
                    const boxSize = 7 + flash * 5;
                    return (
                      <g key={`snap-${idx}`} opacity={snapAlpha}>
                        {/* Quadrado OSNAP Endpoint na face frontal */}
                        <rect
                          x={v.x - boxSize / 2}
                          y={v.y - boxSize / 2}
                          width={boxSize}
                          height={boxSize}
                          fill="none"
                          stroke={flash > 0.3 ? "#38BDF8" : "#FFFFFF"}
                          strokeWidth="1.2"
                          vectorEffect="non-scaling-stroke"
                        />
                        {/* Ponto luminoso da caneta vetorial no instante do SNAP */}
                        {flash > 0.05 && (
                          <circle
                            cx={v.x}
                            cy={v.y}
                            r={2.5 + flash * 3.5}
                            fill="#FFFFFF"
                          />
                        )}
                      </g>
                    );
                  })}
                </g>
              )}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
