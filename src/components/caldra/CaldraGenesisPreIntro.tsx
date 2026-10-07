import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useSettings, type ThemeMode, type AccentColor } from "@/lib/settings/SettingsProvider";

interface CaldraGenesisPreIntroProps {
  /** Chamado quando a animação termina após exatamente 5,000 segundos */
  onComplete: () => void;
  /** Força o uso da composição original de cores da marca se true */
  forceOriginalColors?: boolean;
  className?: string;
}

interface Vec2 {
  x: number;
  y: number;
}

const FIRST_RUN_KEY = "caldra.genesis.played_first";

/* ========================================================================== */
/* GEOMETRIA CANÔNICA DA LOGO CALDRA (VIEWBOX 0 0 100 100)                    */
/* ========================================================================== */

// Vértices do corpo "C" com chanfros e diagonais a 45°
const OUTER_C_VERTICES: Vec2[] = [
  { x: 38, y: 18 },
  { x: 82, y: 18 },
  { x: 66.5, y: 33.5 },
  { x: 50, y: 33.5 },
  { x: 33.5, y: 50 },
  { x: 50, y: 66.5 },
  { x: 82, y: 66.5 },
  { x: 66.5, y: 82 },
  { x: 38, y: 82 },
  { x: 18, y: 62 },
  { x: 18, y: 38 },
  { x: 38, y: 18 },
];

// Vértices da pastilha paralelogramo interna (Azul CALDRA a 45°)
const INNER_BLUE_VERTICES: Vec2[] = [
  { x: 43, y: 42.5 },
  { x: 60, y: 42.5 },
  { x: 75.5, y: 58 },
  { x: 58.5, y: 58 },
  { x: 43, y: 42.5 },
];

/** Interpolação paramétrica contínua ao longo de um polígono vetorial */
function getPolyPoint(vertices: Vec2[], t: number): Vec2 {
  if (t <= 0) return vertices[0]!;
  if (t >= 1) return vertices[vertices.length - 1]!;

  const lengths: number[] = [];
  let totalLength = 0;
  for (let i = 0; i < vertices.length - 1; i++) {
    const dx = vertices[i + 1]!.x - vertices[i]!.x;
    const dy = vertices[i + 1]!.y - vertices[i]!.y;
    const len = Math.hypot(dx, dy);
    lengths.push(len);
    totalLength += len;
  }

  const targetDist = t * totalLength;
  let accumulated = 0;

  for (let i = 0; i < lengths.length; i++) {
    const segLen = lengths[i]!;
    if (accumulated + segLen >= targetDist) {
      const segT = (targetDist - accumulated) / segLen;
      return {
        x: vertices[i]!.x + segT * (vertices[i + 1]!.x - vertices[i]!.x),
        y: vertices[i]!.y + segT * (vertices[i + 1]!.y - vertices[i]!.y),
      };
    }
    accumulated += segLen;
  }

  return vertices[vertices.length - 1]!;
}

/** Easing cúbico suave com aceleração e desaceleração progressivas */
function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Mapeamento de intervalo com curva suave */
function mapRange(t: number, start: number, end: number): number {
  if (t <= start) return 0;
  if (t >= end) return 1;
  const norm = (t - start) / (end - start);
  return easeInOutCubic(norm);
}

/* ========================================================================== */
/* PALETA DINÂMICA DE CORES (ORIGINAL VS TEMA / DESTAQUE DINÂMICOS)           */
/* ========================================================================== */

interface GenesisPalette {
  isDark: boolean;
  background: string;
  gridBaseColor: string;
  gridBaseOpacity: number;
  gridMajorColor: string;
  gridMajorOpacity: number;
  gridBrightColor: string;
  axesColor: string;
  raysColor: string;
  crossesColor: string;
  compassCircleColor: string;
  outerPenColor: string;
  cursorOuterCore: string;
  cursorOuterGlow: string;
  innerPenColor: string;
  cursorInnerCore: string;
  cursorInnerGlow: string;
  cBodyGradient: [string, string, string, string];
  cBodyStroke: string;
  innerGradient: [string, string, string];
  innerStroke: string;
  innerTopEdge: string;
  specularGradient: [string, string, string, string];
}

function computePalette(
  isFirstRun: boolean,
  theme: ThemeMode,
  accent: AccentColor,
): GenesisPalette {
  // 1. PRIMEIRA ABERTURA DO APLICATIVO: Composição original de cores canônica
  if (isFirstRun) {
    return {
      isDark: true,
      background: "#051833",
      gridBaseColor: "#FB7185",
      gridBaseOpacity: 0.14,
      gridMajorColor: "#F43F5E",
      gridMajorOpacity: 0.26,
      gridBrightColor: "#FDA4AF",
      axesColor: "#38BDF8",
      raysColor: "#94A3B8",
      crossesColor: "#F8FAFC",
      compassCircleColor: "#38BDF8",
      outerPenColor: "#FFFFFF",
      cursorOuterCore: "#FFFFFF",
      cursorOuterGlow: "#38BDF8",
      innerPenColor: "#007AFF",
      cursorInnerCore: "#FFFFFF",
      cursorInnerGlow: "#60A5FA",
      cBodyGradient: ["#FFFFFF", "#F8FAFC", "#E2E8F0", "#CBD5E1"],
      cBodyStroke: "#FFFFFF",
      innerGradient: ["#38BDF8", "#007AFF", "#0052CC"],
      innerStroke: "#38BDF8",
      innerTopEdge: "#93C5FD",
      specularGradient: [
        "rgba(255,255,255,0.40)",
        "rgba(255,255,255,0.05)",
        "rgba(5,24,51,0.25)",
        "rgba(0,0,0,0.35)",
      ],
    };
  }

  // 2. ABERTURAS POSTERIORES: Adaptação ao Tema (Escuro / Claro) e Cor de Destaque
  const isDark =
    theme === "dark" ||
    theme === "amoled" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches);

  if (isDark) {
    // MODO ESCURO
    const bg = theme === "amoled" ? "#000000" : "#070B14";
    const cBodyGrad: [string, string, string, string] = [
      "#FFFFFF",
      "#F8FAFC",
      "#E2E8F0",
      "#CBD5E1",
    ];
    const cStroke = "#FFFFFF";

    switch (accent) {
      case "amber":
        return {
          isDark: true,
          background: bg,
          gridBaseColor: "#F59E0B",
          gridBaseOpacity: 0.12,
          gridMajorColor: "#D97706",
          gridMajorOpacity: 0.24,
          gridBrightColor: "#FDE68A",
          axesColor: "#F59E0B",
          raysColor: "#78716C",
          crossesColor: "#FDE68A",
          compassCircleColor: "#FBBF24",
          outerPenColor: "#FFFFFF",
          cursorOuterCore: "#FFFFFF",
          cursorOuterGlow: "#F59E0B",
          innerPenColor: "#F59E0B",
          cursorInnerCore: "#FFFFFF",
          cursorInnerGlow: "#FBBF24",
          cBodyGradient: cBodyGrad,
          cBodyStroke: cStroke,
          innerGradient: ["#FDE68A", "#F59E0B", "#B45309"],
          innerStroke: "#FDE68A",
          innerTopEdge: "#FEF08A",
          specularGradient: [
            "rgba(255,255,255,0.35)",
            "rgba(255,255,255,0.05)",
            "rgba(0,0,0,0.25)",
            "rgba(0,0,0,0.40)",
          ],
        };

      case "crimson":
      case "magenta":
        return {
          isDark: true,
          background: bg,
          gridBaseColor: "#FB7185",
          gridBaseOpacity: 0.12,
          gridMajorColor: "#E11D48",
          gridMajorOpacity: 0.24,
          gridBrightColor: "#FECDD3",
          axesColor: "#E11D48",
          raysColor: "#78716C",
          crossesColor: "#FDA4AF",
          compassCircleColor: "#F43F5E",
          outerPenColor: "#FFFFFF",
          cursorOuterCore: "#FFFFFF",
          cursorOuterGlow: "#E11D48",
          innerPenColor: "#E11D48",
          cursorInnerCore: "#FFFFFF",
          cursorInnerGlow: "#FB7185",
          cBodyGradient: cBodyGrad,
          cBodyStroke: cStroke,
          innerGradient: ["#FB7185", "#E11D48", "#9F1239"],
          innerStroke: "#FB7185",
          innerTopEdge: "#FDA4AF",
          specularGradient: [
            "rgba(255,255,255,0.35)",
            "rgba(255,255,255,0.05)",
            "rgba(0,0,0,0.25)",
            "rgba(0,0,0,0.40)",
          ],
        };

      case "default":
        // Preto & Branco no modo escuro -> Branco dominante
        return {
          isDark: true,
          background: bg,
          gridBaseColor: "#FFFFFF",
          gridBaseOpacity: 0.09,
          gridMajorColor: "#E2E8F0",
          gridMajorOpacity: 0.20,
          gridBrightColor: "#FFFFFF",
          axesColor: "#FFFFFF",
          raysColor: "#94A3B8",
          crossesColor: "#FFFFFF",
          compassCircleColor: "#E2E8F0",
          outerPenColor: "#FFFFFF",
          cursorOuterCore: "#FFFFFF",
          cursorOuterGlow: "#E2E8F0",
          innerPenColor: "#E2E8F0",
          cursorInnerCore: "#FFFFFF",
          cursorInnerGlow: "#CBD5E1",
          cBodyGradient: cBodyGrad,
          cBodyStroke: cStroke,
          innerGradient: ["#FFFFFF", "#E2E8F0", "#94A3B8"],
          innerStroke: "#FFFFFF",
          innerTopEdge: "#FFFFFF",
          specularGradient: [
            "rgba(255,255,255,0.40)",
            "rgba(255,255,255,0.05)",
            "rgba(0,0,0,0.25)",
            "rgba(0,0,0,0.40)",
          ],
        };

      case "blue":
      default:
        // AZUL REAL no escuro
        return {
          isDark: true,
          background: bg,
          gridBaseColor: "#38BDF8",
          gridBaseOpacity: 0.12,
          gridMajorColor: "#0284C7",
          gridMajorOpacity: 0.24,
          gridBrightColor: "#BAE6FD",
          axesColor: "#007AFF",
          raysColor: "#64748B",
          crossesColor: "#93C5FD",
          compassCircleColor: "#38BDF8",
          outerPenColor: "#FFFFFF",
          cursorOuterCore: "#FFFFFF",
          cursorOuterGlow: "#38BDF8",
          innerPenColor: "#007AFF",
          cursorInnerCore: "#FFFFFF",
          cursorInnerGlow: "#60A5FA",
          cBodyGradient: cBodyGrad,
          cBodyStroke: cStroke,
          innerGradient: ["#60A5FA", "#007AFF", "#0047AB"],
          innerStroke: "#60A5FA",
          innerTopEdge: "#93C5FD",
          specularGradient: [
            "rgba(255,255,255,0.35)",
            "rgba(255,255,255,0.05)",
            "rgba(0,0,0,0.25)",
            "rgba(0,0,0,0.40)",
          ],
        };
    }
  } else {
    // MODO CLARO
    const bg = "#FAF9F6";
    // No modo claro, corpo C em grafite/aço carbono garante alto contraste
    const cBodyGrad: [string, string, string, string] = [
      "#27272A",
      "#18181B",
      "#18181B",
      "#09090B",
    ];
    const cStroke = "#18181B";

    switch (accent) {
      case "amber":
        return {
          isDark: false,
          background: bg,
          gridBaseColor: "#D97706",
          gridBaseOpacity: 0.12,
          gridMajorColor: "#B45309",
          gridMajorOpacity: 0.24,
          gridBrightColor: "#92400E",
          axesColor: "#B45309",
          raysColor: "#78716C",
          crossesColor: "#B45309",
          compassCircleColor: "#D97706",
          outerPenColor: "#18181B",
          cursorOuterCore: "#18181B",
          cursorOuterGlow: "#D97706",
          innerPenColor: "#B45309",
          cursorInnerCore: "#FFFFFF",
          cursorInnerGlow: "#D97706",
          cBodyGradient: cBodyGrad,
          cBodyStroke: cStroke,
          innerGradient: ["#FBBF24", "#F59E0B", "#B45309"],
          innerStroke: "#FBBF24",
          innerTopEdge: "#FDE68A",
          specularGradient: [
            "rgba(255,255,255,0.35)",
            "rgba(255,255,255,0.05)",
            "rgba(0,0,0,0.25)",
            "rgba(0,0,0,0.45)",
          ],
        };

      case "crimson":
      case "magenta":
        return {
          isDark: false,
          background: bg,
          gridBaseColor: "#E11D48",
          gridBaseOpacity: 0.12,
          gridMajorColor: "#BE123C",
          gridMajorOpacity: 0.24,
          gridBrightColor: "#9F1239",
          axesColor: "#BE123C",
          raysColor: "#78716C",
          crossesColor: "#BE123C",
          compassCircleColor: "#E11D48",
          outerPenColor: "#18181B",
          cursorOuterCore: "#18181B",
          cursorOuterGlow: "#BE123C",
          innerPenColor: "#BE123C",
          cursorInnerCore: "#FFFFFF",
          cursorInnerGlow: "#E11D48",
          cBodyGradient: cBodyGrad,
          cBodyStroke: cStroke,
          innerGradient: ["#FB7185", "#E11D48", "#9F1239"],
          innerStroke: "#FB7185",
          innerTopEdge: "#FDA4AF",
          specularGradient: [
            "rgba(255,255,255,0.35)",
            "rgba(255,255,255,0.05)",
            "rgba(0,0,0,0.25)",
            "rgba(0,0,0,0.45)",
          ],
        };

      case "default":
        // Preto & Branco no modo claro -> Preto dominante
        return {
          isDark: false,
          background: bg,
          gridBaseColor: "#52525B",
          gridBaseOpacity: 0.12,
          gridMajorColor: "#27272A",
          gridMajorOpacity: 0.24,
          gridBrightColor: "#09090B",
          axesColor: "#18181B",
          raysColor: "#71717A",
          crossesColor: "#18181B",
          compassCircleColor: "#27272A",
          outerPenColor: "#09090B",
          cursorOuterCore: "#09090B",
          cursorOuterGlow: "#52525B",
          innerPenColor: "#27272A",
          cursorInnerCore: "#FFFFFF",
          cursorInnerGlow: "#52525B",
          cBodyGradient: cBodyGrad,
          cBodyStroke: cStroke,
          innerGradient: ["#3F3F46", "#27272A", "#18181B"],
          innerStroke: "#3F3F46",
          innerTopEdge: "#71717A",
          specularGradient: [
            "rgba(255,255,255,0.35)",
            "rgba(255,255,255,0.05)",
            "rgba(0,0,0,0.25)",
            "rgba(0,0,0,0.45)",
          ],
        };

      case "blue":
      default:
        // AZUL REAL no claro
        return {
          isDark: false,
          background: bg,
          gridBaseColor: "#0284C7",
          gridBaseOpacity: 0.12,
          gridMajorColor: "#0369A1",
          gridMajorOpacity: 0.24,
          gridBrightColor: "#075985",
          axesColor: "#0284C7",
          raysColor: "#64748B",
          crossesColor: "#0284C7",
          compassCircleColor: "#0369A1",
          outerPenColor: "#18181B",
          cursorOuterCore: "#18181B",
          cursorOuterGlow: "#0284C7",
          innerPenColor: "#007AFF",
          cursorInnerCore: "#FFFFFF",
          cursorInnerGlow: "#0284C7",
          cBodyGradient: cBodyGrad,
          cBodyStroke: cStroke,
          innerGradient: ["#38BDF8", "#007AFF", "#0052CC"],
          innerStroke: "#38BDF8",
          innerTopEdge: "#93C5FD",
          specularGradient: [
            "rgba(255,255,255,0.35)",
            "rgba(255,255,255,0.05)",
            "rgba(0,0,0,0.25)",
            "rgba(0,0,0,0.45)",
          ],
        };
    }
  }
}

/**
 * GÊNESE VISUAL CALDRA — MOTION DESIGN DE ENGENHARIA / CAD
 *
 * REGRAS RIGOROSAS:
 * 1. Zero números, zero cotas, zero textos numéricos ou rótulos. Somente desenho geométrico puro.
 * 2. Na primeira abertura: composição canônica original da marca (#051833, azul CALDRA, aço prata).
 * 3. Em aberturas posteriores: adaptação dinâmica ao tema (Escuro/Claro) e cor de destaque salva.
 * 4. Duração: EXATAMENTE 5,000 SEGUNDOS entre o primeiro frame e o início do aplicativo.
 * 5. Bloqueio de interação durante os 5 segundos; transição suave no fim exato.
 */
export function CaldraGenesisPreIntro({
  onComplete,
  forceOriginalColors = false,
  className,
}: CaldraGenesisPreIntroProps) {
  // Consulta configurações visuais salvas
  let currentTheme: ThemeMode = "light";
  let currentAccent: AccentColor = "crimson";
  try {
    const settings = useSettings();
    currentTheme = settings.theme;
    currentAccent = settings.accent;
  } catch {
    /* fallback seguro se montado fora de contexto */
  }

  // Identifica primeira abertura do app
  const [isFirstRun] = useState(() => {
    if (forceOriginalColors) return true;
    if (typeof window === "undefined") return false;
    try {
      return !localStorage.getItem(FIRST_RUN_KEY);
    } catch {
      return false;
    }
  });

  const palette = computePalette(isFirstRun, currentTheme, currentAccent);

  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const isExitingRef = useRef(false);
  const finishedRef = useRef(false);

  /* DURAÇÃO EXATA: 5,000 SEGUNDOS (5000ms cravados) */
  const TOTAL_DURATION_MS = 5000;
  const FADE_OUT_MS = 400;
  const PLAY_DURATION_MS = TOTAL_DURATION_MS - FADE_OUT_MS; // 4600ms

  const handleFinish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    try {
      localStorage.setItem(FIRST_RUN_KEY, "true");
    } catch {
      /* ignore */
    }
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    let active = true;

    const frame = (timestamp: number) => {
      if (!active) return;
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }
      const elapsed = timestamp - startTimeRef.current;

      // Progresso da construção geométrica (0 a 1 em 4600ms)
      const rawP = Math.min(1, elapsed / PLAY_DURATION_MS);
      setProgress(rawP);

      // Inicia o fade out suave em 4600ms
      if (elapsed >= PLAY_DURATION_MS && !isExitingRef.current) {
        isExitingRef.current = true;
        setIsExiting(true);
      }

      // Ao completar exatamente 5000ms (5,000s), executa a transição imediata
      if (elapsed >= TOTAL_DURATION_MS) {
        handleFinish();
        return;
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [handleFinish, PLAY_DURATION_MS, TOTAL_DURATION_MS]);

  /* -------------------------------------------------------------------------- */
  /* CRONOGRAMA DE ETAPAS (NORMALIZADO PARA T = 4.6s DE CONSTRUÇÃO)             */
  /* -------------------------------------------------------------------------- */
  const T = 4.6;

  // 0.0s – 0.4s: Fundo e Ponto Germinal Inicial
  const pBackground = mapRange(progress, 0.0, 0.4 / T);
  const pDotPulse = mapRange(progress, 0.05 / T, 0.32 / T);

  // 0.4s – 0.9s: Grid e Eixos
  const pGridExpand = mapRange(progress, 0.4 / T, 0.9 / T);
  const pAxes = mapRange(progress, 0.55 / T, 0.95 / T);

  // 0.9s – 1.8s: Linhas e Arcos de Construção CAD
  const pRays45 = mapRange(progress, 0.9 / T, 1.35 / T);
  const pCompassCircle = mapRange(progress, 1.1 / T, 1.65 / T);
  const pAuxTangents = mapRange(progress, 1.4 / T, 1.85 / T);
  const pCrossNodes = mapRange(progress, 1.5 / T, 1.95 / T);

  // 1.8s – 3.0s: Traçado da Geometria da Logo em Tempo Real
  const pDrawOuterC = mapRange(progress, 1.8 / T, 2.75 / T);
  const pDrawInnerBlue = mapRange(progress, 2.2 / T, 3.0 / T);

  // 3.0s – 3.8s: Preenchimento / Morph das Linhas Técnicas para a Superfície Sólida
  const pMorphC = mapRange(progress, 3.0 / T, 3.75 / T);
  const pMorphBlue = mapRange(progress, 3.15 / T, 3.8 / T);

  // 3.8s – 4.3s: Dissolução Suave das Guias e Grid
  const pGuidesFadeOut = 1 - mapRange(progress, 3.8 / T, 4.25 / T);
  const pGridFadeOut = 1 - mapRange(progress, 3.9 / T, 4.35 / T);

  // 4.3s – 4.6s: Pausa para a Marca Respirar + Reflexo Especular
  const pFinalSheen = mapRange(progress, 4.1 / T, 4.6 / T);

  /* -------------------------------------------------------------------------- */
  /* CURSORES TÉCNICOS EM TEMPO REAL                                            */
  /* -------------------------------------------------------------------------- */
  const cOuterLength = 292.1;
  const cInnerLength = 77.8;

  const outerStrokeDash = Math.max(0, cOuterLength * (1 - pDrawOuterC));
  const innerStrokeDash = Math.max(0, cInnerLength * (1 - pDrawInnerBlue));

  // Posição exata do cursor no contorno do corpo C
  const outerCursor = getPolyPoint(OUTER_C_VERTICES, pDrawOuterC);
  // Posição exata do cursor na pastilha azul interna
  const innerCursor = getPolyPoint(INNER_BLUE_VERTICES, pDrawInnerBlue);

  // Cursor do compasso traçando o círculo R32
  const compassAngle = pCompassCircle * Math.PI * 2 - Math.PI / 2;
  const compassCursor: Vec2 = {
    x: 50 + 32 * Math.cos(compassAngle),
    y: 50 + 32 * Math.sin(compassAngle),
  };

  // Cursor ativo que ilumina sutilmente a malha técnica
  let activeCursor: Vec2 = { x: 50, y: 50 };
  let hasActiveCursor = false;

  if (pDrawInnerBlue > 0 && pDrawInnerBlue < 1) {
    activeCursor = innerCursor;
    hasActiveCursor = true;
  } else if (pDrawOuterC > 0 && pDrawOuterC < 1) {
    activeCursor = outerCursor;
    hasActiveCursor = true;
  } else if (pCompassCircle > 0 && pCompassCircle < 1) {
    activeCursor = compassCursor;
    hasActiveCursor = true;
  }

  // Caminhos canônicos das formas
  const pathDataOuterC =
    "M 38 18 L 82 18 L 66.5 33.5 L 50 33.5 L 33.5 50 L 50 66.5 L 82 66.5 L 66.5 82 L 38 82 L 18 62 L 18 38 Z";
  const pathDataInnerBlue =
    "M 43 42.5 L 60 42.5 L 75.5 58 L 58.5 58 Z";

  return (
    <div
      aria-label="Abertura técnica Caldra"
      role="dialog"
      aria-modal="true"
      className={cn(
        "fixed inset-0 z-[120] flex flex-col items-center justify-center overflow-hidden select-none pointer-events-auto",
        "transition-opacity duration-400 ease-out",
        isExiting ? "opacity-0 pointer-events-none" : "opacity-100",
        className,
      )}
      style={{
        backgroundColor: palette.background,
        opacity: isExiting ? 0 : Math.min(1, pBackground * 1.5),
      }}
    >
      {/* ====================================================================== */}
      {/* CANVAS VETORIAL SVG (SEM QUALQUER TEXTO, NÚMERO OU COTA)               */}
      {/* ====================================================================== */}
      <div className="relative flex items-center justify-center w-full h-full max-w-[92vw] max-h-[85vh] aspect-square pointer-events-none">
        <svg
          viewBox="-45 -45 190 190"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full max-w-[580px] max-h-[580px] overflow-visible drop-shadow-2xl"
          aria-hidden="true"
        >
          <defs>
            {/* 1. MALHA MILIMETRADA TÉCNICA BASE */}
            <pattern
              id="genesis-subgrid"
              width="5"
              height="5"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 5 0 L 0 0 0 5"
                fill="none"
                stroke={palette.gridBaseColor}
                strokeWidth="0.22"
                strokeOpacity={palette.gridBaseOpacity}
              />
            </pattern>

            <pattern
              id="genesis-majorgid"
              width="25"
              height="25"
              patternUnits="userSpaceOnUse"
            >
              <rect width="25" height="25" fill="url(#genesis-subgrid)" />
              <path
                d="M 25 0 L 0 0 0 25"
                fill="none"
                stroke={palette.gridMajorColor}
                strokeWidth="0.45"
                strokeOpacity={palette.gridMajorOpacity}
              />
            </pattern>

            {/* 2. MALHA ATIVA DE ALTA LUMINOSIDADE (reação do grid sob o cursor) */}
            <pattern
              id="genesis-majorgid-bright"
              width="25"
              height="25"
              patternUnits="userSpaceOnUse"
            >
              <rect width="25" height="25" fill="url(#genesis-subgrid-bright)" />
              <path
                d="M 25 0 L 0 0 0 25"
                fill="none"
                stroke={palette.gridBrightColor}
                strokeWidth="0.75"
                strokeOpacity="0.85"
              />
            </pattern>

            <pattern
              id="genesis-subgrid-bright"
              width="5"
              height="5"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 5 0 L 0 0 0 5"
                fill="none"
                stroke={palette.gridBrightColor}
                strokeWidth="0.38"
                strokeOpacity="0.55"
              />
            </pattern>

            {/* Máscara de expansão circular do grid a partir do centro (50, 50) */}
            <mask id="grid-expansion-mask">
              <circle
                cx="50"
                cy="50"
                r={pGridExpand * 135}
                fill="#FFFFFF"
              />
            </mask>

            {/* Máscara radial reativa sob o cursor que ilumina o grid momentaneamente */}
            <radialGradient
              id="cursor-light-field"
              cx={activeCursor.x}
              cy={activeCursor.y}
              r="20"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.75" />
              <stop offset="45%" stopColor="#FFFFFF" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </radialGradient>

            <mask id="cursor-grid-glow-mask">
              <rect
                x="-50"
                y="-50"
                width="200"
                height="200"
                fill="url(#cursor-light-field)"
              />
            </mask>

            {/* Silhueta para recorte do Morph do corpo C */}
            <clipPath id="c-silhouette-clip">
              <path d={pathDataOuterC} />
            </clipPath>

            {/* Silhueta para recorte do Morph da pastilha azul */}
            <clipPath id="blue-silhouette-clip">
              <path d={pathDataInnerBlue} />
            </clipPath>

            {/* Gradiente do corpo metálico da CALDRA */}
            <linearGradient id="c-sheen" x1="18" y1="18" x2="82" y2="82" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={palette.cBodyGradient[0]} />
              <stop offset="35%" stopColor={palette.cBodyGradient[1]} />
              <stop offset="70%" stopColor={palette.cBodyGradient[2]} />
              <stop offset="100%" stopColor={palette.cBodyGradient[3]} />
            </linearGradient>

            {/* Gradiente da pastilha interna */}
            <linearGradient id="blue-chevron" x1="43" y1="42.5" x2="75.5" y2="58" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={palette.innerGradient[0]} />
              <stop offset="35%" stopColor={palette.innerGradient[1]} />
              <stop offset="100%" stopColor={palette.innerGradient[2]} />
            </linearGradient>

            {/* Reflexo chanfrado especular sobre o logo final */}
            <linearGradient id="specular-reflection" x1="20" y1="20" x2="80" y2="80" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={palette.specularGradient[0]} />
              <stop offset="40%" stopColor={palette.specularGradient[1]} />
              <stop offset="75%" stopColor={palette.specularGradient[2]} />
              <stop offset="100%" stopColor={palette.specularGradient[3]} />
            </linearGradient>
          </defs>

          {/* ================================================================== */}
          {/* ETAPA 1 & 2: GRID MILIMETRADO E EIXOS                              */}
          {/* ================================================================== */}

          {/* Grid Técnico Base */}
          {pGridExpand > 0 && pGridFadeOut > 0 && (
            <g
              mask="url(#grid-expansion-mask)"
              opacity={Math.min(1, pGridExpand * 1.4) * pGridFadeOut}
            >
              <rect
                x="-45"
                y="-45"
                width="190"
                height="190"
                fill="url(#genesis-majorgid)"
              />
            </g>
          )}

          {/* Reação Dinâmica do Grid: ilumina sob o cursor técnico enquanto desenha */}
          {hasActiveCursor && pGridFadeOut > 0.3 && (
            <g
              mask="url(#cursor-grid-glow-mask)"
              opacity={pGridFadeOut}
            >
              <rect
                x="-45"
                y="-45"
                width="190"
                height="190"
                fill="url(#genesis-majorgid-bright)"
              />
            </g>
          )}

          {/* Eixos Cartesianos X e Y Centrais (sem numerais) */}
          {pAxes > 0 && pGuidesFadeOut > 0 && (
            <g opacity={pAxes * pGuidesFadeOut}>
              {/* Eixo X */}
              <line
                x1={50 - 75 * pAxes}
                y1="50"
                x2={50 + 75 * pAxes}
                y2="50"
                stroke={palette.axesColor}
                strokeWidth="0.55"
                strokeDasharray="4 2"
                strokeOpacity="0.75"
              />
              {/* Eixo Y */}
              <line
                x1="50"
                y1={50 - 75 * pAxes}
                x2="50"
                y2={50 + 75 * pAxes}
                stroke={palette.axesColor}
                strokeWidth="0.55"
                strokeDasharray="4 2"
                strokeOpacity="0.75"
              />

              {/* Ticks milimétricos calibrados nos eixos (sem números) */}
              {[-30, -20, -10, 10, 20, 30].map((delta) => (
                <g key={`tick-${delta}`} opacity={pAxes * 0.85}>
                  <line
                    x1={50 + delta}
                    y1={48.8}
                    x2={50 + delta}
                    y2={51.2}
                    stroke={palette.gridMajorColor}
                    strokeWidth="0.4"
                    strokeOpacity="0.75"
                  />
                  <line
                    x1={48.8}
                    y1={50 + delta}
                    x2={51.2}
                    y2={50 + delta}
                    stroke={palette.gridMajorColor}
                    strokeWidth="0.4"
                    strokeOpacity="0.75"
                  />
                </g>
              ))}

              {/* Origem geométrica central (0, 0) */}
              <circle
                cx="50"
                cy="50"
                r="1.6"
                fill="none"
                stroke={palette.axesColor}
                strokeWidth="0.5"
                strokeOpacity="0.85"
              />
            </g>
          )}

          {/* Ponto Luminoso Germinal Inicial */}
          {progress < 0.35 / T && (
            <g opacity={(1 - mapRange(progress, 0.15 / T, 0.35 / T)) * pDotPulse}>
              <circle
                cx="50"
                cy="50"
                r="4.2"
                fill={palette.cursorOuterGlow}
                fillOpacity="0.25"
              />
              <circle
                cx="50"
                cy="50"
                r="1.2"
                fill={palette.outerPenColor}
              />
            </g>
          )}

          {/* ================================================================== */}
          {/* ETAPA 3: LINHAS E ARCOS DE CONSTRUÇÃO CAD (SEM COTA/NÚMEROS)        */}
          {/* ================================================================== */}

          {pGuidesFadeOut > 0 && (
            <g opacity={pGuidesFadeOut}>
              {/* Raios fundamentais a 45° */}
              {pRays45 > 0 && (
                <g opacity={pRays45}>
                  <line
                    x1={50 - 55 * pRays45}
                    y1={50 - 55 * pRays45}
                    x2={50 + 55 * pRays45}
                    y2={50 + 55 * pRays45}
                    stroke={palette.raysColor}
                    strokeWidth="0.4"
                    strokeDasharray="3 3"
                    strokeOpacity="0.6"
                  />
                  <line
                    x1={50 - 55 * pRays45}
                    y1={50 + 55 * pRays45}
                    x2={50 + 55 * pRays45}
                    y2={50 - 55 * pRays45}
                    stroke={palette.raysColor}
                    strokeWidth="0.4"
                    strokeDasharray="3 3"
                    strokeOpacity="0.6"
                  />
                </g>
              )}

              {/* Círculo guia de compasso R32 traçado progressivamente */}
              {pCompassCircle > 0 && (
                <g>
                  <circle
                    cx="50"
                    cy="50"
                    r="32"
                    fill="none"
                    stroke={palette.compassCircleColor}
                    strokeWidth="0.45"
                    strokeDasharray={`${2 * Math.PI * 32}`}
                    strokeDashoffset={`${2 * Math.PI * 32 * (1 - pCompassCircle)}`}
                    strokeOpacity="0.55"
                  />
                  {/* Círculo concêntrico do entalhe central */}
                  <circle
                    cx="50"
                    cy="50"
                    r="23.33"
                    fill="none"
                    stroke={palette.raysColor}
                    strokeWidth="0.35"
                    strokeDasharray="2 3"
                    strokeOpacity={0.45 * pCompassCircle}
                  />
                </g>
              )}

              {/* Reticulado delimitador e tangentes auxiliares */}
              {pAuxTangents > 0 && (
                <g opacity={pAuxTangents}>
                  {/* Caixa delimitadora de 18 a 82 */}
                  <rect
                    x="18"
                    y="18"
                    width="64"
                    height="64"
                    fill="none"
                    stroke={palette.raysColor}
                    strokeWidth="0.35"
                    strokeDasharray="2 3"
                    strokeOpacity="0.45"
                  />

                  {/* Prolongamentos de topo e base */}
                  <line
                    x1="10"
                    y1="18"
                    x2="90"
                    y2="18"
                    stroke={palette.axesColor}
                    strokeWidth="0.32"
                    strokeDasharray="4 4"
                    strokeOpacity="0.4"
                  />
                  <line
                    x1="10"
                    y1="82"
                    x2="90"
                    y2="82"
                    stroke={palette.axesColor}
                    strokeWidth="0.32"
                    strokeDasharray="4 4"
                    strokeOpacity="0.4"
                  />
                  {/* Costas do C */}
                  <line
                    x1="18"
                    y1="10"
                    x2="18"
                    y2="90"
                    stroke={palette.axesColor}
                    strokeWidth="0.32"
                    strokeDasharray="4 4"
                    strokeOpacity="0.4"
                  />

                  {/* Guias dos patamares internos */}
                  <line
                    x1="45"
                    y1="33.5"
                    x2="75"
                    y2="33.5"
                    stroke={palette.raysColor}
                    strokeWidth="0.3"
                    strokeDasharray="2 2"
                    strokeOpacity="0.5"
                  />
                  <line
                    x1="45"
                    y1="66.5"
                    x2="85"
                    y2="66.5"
                    stroke={palette.raysColor}
                    strokeWidth="0.3"
                    strokeDasharray="2 2"
                    strokeOpacity="0.5"
                  />

                  {/* Alinhamento da pastilha interna */}
                  <line
                    x1="35"
                    y1="42.5"
                    x2="68"
                    y2="42.5"
                    stroke={palette.axesColor}
                    strokeWidth="0.28"
                    strokeDasharray="1 2"
                    strokeOpacity="0.45"
                  />
                  <line
                    x1="52"
                    y1="58"
                    x2="82"
                    y2="58"
                    stroke={palette.axesColor}
                    strokeWidth="0.28"
                    strokeDasharray="1 2"
                    strokeOpacity="0.45"
                  />
                </g>
              )}

              {/* Cruzes de centro nos nós principais (+) */}
              {pCrossNodes > 0 && (
                <g opacity={pCrossNodes}>
                  {[
                    { x: 38, y: 18 },
                    { x: 82, y: 18 },
                    { x: 66.5, y: 33.5 },
                    { x: 50, y: 33.5 },
                    { x: 33.5, y: 50 },
                    { x: 50, y: 66.5 },
                    { x: 82, y: 66.5 },
                    { x: 66.5, y: 82 },
                    { x: 38, y: 82 },
                    { x: 18, y: 62 },
                    { x: 18, y: 38 },
                    { x: 43, y: 42.5 },
                    { x: 60, y: 42.5 },
                    { x: 75.5, y: 58 },
                    { x: 58.5, y: 58 },
                  ].map((pt, i) => (
                    <g key={`cross-${i}`} opacity={pCrossNodes * 0.75}>
                      <line
                        x1={pt.x - 1.2}
                        y1={pt.y}
                        x2={pt.x + 1.2}
                        y2={pt.y}
                        stroke={palette.crossesColor}
                        strokeWidth="0.32"
                      />
                      <line
                        x1={pt.x}
                        y1={pt.y - 1.2}
                        x2={pt.x}
                        y2={pt.y + 1.2}
                        stroke={palette.crossesColor}
                        strokeWidth="0.32"
                      />
                    </g>
                  ))}
                </g>
              )}
            </g>
          )}

          {/* ================================================================== */}
          {/* ETAPA 5: MORPH DAS LINHAS PARA SUPERFÍCIE (EXPANSÃO INTERNA)       */}
          {/* ================================================================== */}

          {/* Superfície do Corpo C nascendo diretamente do traçado */}
          {pMorphC > 0 && (
            <g clipPath="url(#c-silhouette-clip)">
              <path
                d={pathDataOuterC}
                fill="url(#c-sheen)"
                stroke="url(#c-sheen)"
                strokeWidth={2.8 + pMorphC * 32}
                strokeLinejoin="round"
                opacity={Math.min(1, pMorphC * 1.2)}
              />
            </g>
          )}

          {/* Superfície da Pastilha nascendo diretamente do traçado */}
          {pMorphBlue > 0 && (
            <g clipPath="url(#blue-silhouette-clip)">
              <path
                d={pathDataInnerBlue}
                fill="url(#blue-chevron)"
                stroke="url(#blue-chevron)"
                strokeWidth={2.8 + pMorphBlue * 20}
                strokeLinejoin="round"
                opacity={Math.min(1, pMorphBlue * 1.2)}
              />
            </g>
          )}

          {/* ================================================================== */}
          {/* ETAPA 4: TRAÇADO DA GEOMETRIA CANÔNICA EM TEMPO REAL               */}
          {/* ================================================================== */}

          {/* Traçado do contorno do corpo C */}
          {pDrawOuterC > 0 && (
            <path
              d={pathDataOuterC}
              fill="none"
              stroke={palette.outerPenColor}
              strokeWidth="2.8"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={cOuterLength}
              strokeDashoffset={outerStrokeDash}
              opacity={Math.min(1, pDrawOuterC * 1.6)}
            />
          )}

          {/* Traçado do contorno da pastilha interna */}
          {pDrawInnerBlue > 0 && (
            <path
              d={pathDataInnerBlue}
              fill="none"
              stroke={palette.innerPenColor}
              strokeWidth="2.8"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={cInnerLength}
              strokeDashoffset={innerStrokeDash}
              opacity={Math.min(1, pDrawInnerBlue * 1.6)}
            />
          )}

          {/* ================================================================== */}
          {/* CURSORES TÉCNICOS LUMINOSOS (PONTOS DE LUZ ACOMPANHANDO AS LINHAS) */}
          {/* ================================================================== */}

          {/* Cursor do corpo C */}
          {pDrawOuterC > 0 && pDrawOuterC < 1 && (
            <g
              transform={`translate(${outerCursor.x}, ${outerCursor.y})`}
              className="pointer-events-none"
            >
              <circle r="3.2" fill={palette.cursorOuterGlow} fillOpacity="0.30" />
              <circle r="1.6" fill={palette.cursorOuterGlow} fillOpacity="0.75" />
              <circle r="0.8" fill={palette.cursorOuterCore} />
              <line
                x1="-2.6"
                y1="0"
                x2="2.6"
                y2="0"
                stroke={palette.cursorOuterCore}
                strokeWidth="0.32"
                strokeOpacity="0.9"
              />
              <line
                x1="0"
                y1="-2.6"
                x2="0"
                y2="2.6"
                stroke={palette.cursorOuterCore}
                strokeWidth="0.32"
                strokeOpacity="0.9"
              />
            </g>
          )}

          {/* Cursor da pastilha interna */}
          {pDrawInnerBlue > 0 && pDrawInnerBlue < 1 && (
            <g
              transform={`translate(${innerCursor.x}, ${innerCursor.y})`}
              className="pointer-events-none"
            >
              <circle r="3.0" fill={palette.cursorInnerGlow} fillOpacity="0.35" />
              <circle r="1.5" fill={palette.cursorInnerGlow} fillOpacity="0.8" />
              <circle r="0.75" fill={palette.cursorInnerCore} />
              <line
                x1="-2.4"
                y1="0"
                x2="2.4"
                y2="0"
                stroke={palette.cursorInnerGlow}
                strokeWidth="0.32"
                strokeOpacity="0.9"
              />
              <line
                x1="0"
                y1="-2.4"
                x2="0"
                y2="2.4"
                stroke={palette.cursorInnerGlow}
                strokeWidth="0.32"
                strokeOpacity="0.9"
              />
            </g>
          )}

          {/* Cursor do compasso traçando o círculo R32 */}
          {pCompassCircle > 0 && pCompassCircle < 1 && (
            <g
              transform={`translate(${compassCursor.x}, ${compassCursor.y})`}
              className="pointer-events-none"
            >
              <circle r="2.4" fill={palette.axesColor} fillOpacity="0.35" />
              <circle r="1.0" fill={palette.outerPenColor} />
            </g>
          )}

          {/* ================================================================== */}
          {/* ETAPA 6 & 7: LOGO FINAL FORMADA COM PROFUNDIDADE E REFLEXO LÍMPIDO */}
          {/* ================================================================== */}

          {pFinalSheen > 0 && (
            <g opacity={pFinalSheen}>
              {/* Reflexo especular chanfrado chanfrado sobre o corpo */}
              <path
                d={pathDataOuterC}
                fill="url(#specular-reflection)"
                stroke="transparent"
                strokeWidth="0"
                className="pointer-events-none"
              />

              {/* Aresta límpida de brilho superior no elemento interno */}
              <path
                d="M 43 42.5 L 60 42.5 L 75.5 58"
                fill="none"
                stroke={palette.innerTopEdge}
                strokeWidth="0.9"
                strokeLinecap="round"
                opacity="0.85"
              />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
