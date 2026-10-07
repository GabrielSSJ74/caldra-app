import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface CaldraGenesisPreIntroProps {
  /** Chamado quando a animação termina naturalmente ou o usuário pula */
  onComplete: () => void;
  /** Se deve permitir pular a animação (padrão true) */
  allowSkip?: boolean;
  /** Duração total da animação em milissegundos (padrão 5800ms para 5.8s a 6.0s) */
  durationMs?: number;
  className?: string;
}

interface Vec2 {
  x: number;
  y: number;
}

/* ========================================================================== */
/* GEOMETRIA CANÔNICA EXATA DA LOGO CALDRA (VIEWBOX 0 0 100 100)              */
/* ========================================================================== */

// Vértices do corpo "C" com chanfros a 45°
const OUTER_C_VERTICES: Vec2[] = [
  { x: 38, y: 18 }, // V0: Início topo chanfrado
  { x: 82, y: 18 }, // V1: Ponta superior direita
  { x: 66.5, y: 33.5 }, // V2: Diagonal interna 45°
  { x: 50, y: 33.5 }, // V3: Patamar horizontal superior
  { x: 33.5, y: 50 }, // V4: Entalhe central a 45°
  { x: 50, y: 66.5 }, // V5: Patamar horizontal inferior
  { x: 82, y: 66.5 }, // V6: Ponta inferior direita
  { x: 66.5, y: 82 }, // V7: Diagonal inferior 45°
  { x: 38, y: 82 }, // V8: Base horizontal
  { x: 18, y: 62 }, // V9: Chanfro inferior esquerdo
  { x: 18, y: 38 }, // V10: Aresta vertical esquerda
  { x: 38, y: 18 }, // V11: Retorno ao início (fechamento)
];

// Vértices da pastilha paralelogramo interna (Azul CALDRA a 45°)
const INNER_BLUE_VERTICES: Vec2[] = [
  { x: 43, y: 42.5 }, // I0: Canto superior esquerdo
  { x: 60, y: 42.5 }, // I1: Canto superior direito
  { x: 75.5, y: 58 }, // I2: Canto inferior direito
  { x: 58.5, y: 58 }, // I3: Canto inferior esquerdo
  { x: 43, y: 42.5 }, // I4: Retorno ao início (fechamento)
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

/**
 * GÊNESE VISUAL CALDRA — MOTION DESIGN PREMIUM CAD/ENGENHARIA
 *
 * RITMO REFINADO (5 a 6 segundos):
 * - 0.0s – 0.5s: Fundo técnico #051833 e ponto luminoso germinal.
 * - 0.5s – 1.1s: Grid milimetrado e eixos construídos com traçado progressivo.
 * - 1.1s – 2.2s: Linhas e arcos auxiliares (45°, compasso R32, cotas) desenhados em tempo real.
 * - 2.2s – 3.5s: A geometria da logo é traçada pelo cursor técnico deixando o contorno atrás.
 * - 3.5s – 4.4s: Morph das linhas técnicas para a superfície sólida da logo.
 * - 4.4s – 5.0s: Logo completamente formada e dissolução suave das guias e grid.
 * - 5.0s – 5.5s: Breve pausa para a marca respirar com iluminação límpida.
 * - 5.5s – 6.0s: Transição suave para a introdução existente.
 */
export function CaldraGenesisPreIntro({
  onComplete,
  allowSkip = true,
  durationMs = 5800,
  className,
}: CaldraGenesisPreIntroProps) {
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const handleFinish = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    window.setTimeout(() => {
      onComplete();
    }, 480);
  }, [isExiting, onComplete]);

  useEffect(() => {
    let active = true;

    const frame = (timestamp: number) => {
      if (!active) return;
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }
      const elapsed = timestamp - startTimeRef.current;
      const rawP = Math.min(1, elapsed / durationMs);

      setProgress(rawP);

      if (rawP < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        // Pausa de respiro e transição final (5.5s - 6.0s)
        window.setTimeout(() => {
          if (active) handleFinish();
        }, 150);
      }
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [durationMs, handleFinish]);

  // Suporte a teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " " || e.key === "Enter") {
        handleFinish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleFinish]);

  /* -------------------------------------------------------------------------- */
  /* CRONOGRAMA DE ETAPAS (NORMALIZADO PARA DURAÇÃO TOTAL T = 5.8s)             */
  /* -------------------------------------------------------------------------- */
  const T = 5.8;

  // 0.0s – 0.5s: Fundo e Ponto Germinal
  const pBackground = mapRange(progress, 0.0, 0.5 / T);
  const pDotPulse = mapRange(progress, 0.05 / T, 0.35 / T);

  // 0.5s – 1.1s: Grid e Eixos
  const pGridExpand = mapRange(progress, 0.5 / T, 1.1 / T);
  const pAxes = mapRange(progress, 0.65 / T, 1.15 / T);

  // 1.1s – 2.2s: Linhas e Arcos de Construção CAD
  const pRays45 = mapRange(progress, 1.1 / T, 1.6 / T);
  const pCompassCircle = mapRange(progress, 1.3 / T, 1.95 / T);
  const pAuxTangents = mapRange(progress, 1.65 / T, 2.2 / T);
  const pCadAnnotations = mapRange(progress, 1.8 / T, 2.3 / T);

  // 2.2s – 3.5s: A Própria Geometria da Logo Sendo Construída
  const pDrawOuterC = mapRange(progress, 2.2 / T, 3.25 / T);
  const pDrawInnerBlue = mapRange(progress, 2.65 / T, 3.5 / T);

  // 3.5s – 4.4s: Preenchimento / Morph das Linhas Técnicas para a Superfície Sólida
  const pMorphC = mapRange(progress, 3.5 / T, 4.35 / T);
  const pMorphBlue = mapRange(progress, 3.65 / T, 4.4 / T);

  // 4.4s – 5.0s: Dissolução Suave das Guias e Grid
  const pGuidesFadeOut = 1 - mapRange(progress, 4.35 / T, 4.95 / T);
  const pGridFadeOut = 1 - mapRange(progress, 4.5 / T, 5.1 / T);

  // 5.0s – 5.5s: Pausa para a Marca Respirar + Reflexo Especular
  const pFinalSheen = mapRange(progress, 4.8 / T, 5.5 / T);

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

  // Cursor do compasso traçando o círculo R32 durante 1.3s - 1.95s
  const compassAngle = pCompassCircle * Math.PI * 2 - Math.PI / 2;
  const compassCursor: Vec2 = {
    x: 50 + 32 * Math.cos(compassAngle),
    y: 50 + 32 * Math.sin(compassAngle),
  };

  // Cursor ativo mais relevante para guiar a reação luminosa do grid
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

  // Caminhos SVG canônicos
  const pathDataOuterC =
    "M 38 18 L 82 18 L 66.5 33.5 L 50 33.5 L 33.5 50 L 50 66.5 L 82 66.5 L 66.5 82 L 38 82 L 18 62 L 18 38 Z";
  const pathDataInnerBlue =
    "M 43 42.5 L 60 42.5 L 75.5 58 L 58.5 58 Z";

  return (
    <aside
      aria-label="Abertura técnica Caldra"
      className={cn(
        "fixed inset-0 z-[120] flex flex-col items-center justify-center overflow-hidden select-none",
        "bg-[#051833] text-white transition-opacity duration-500 ease-out",
        isExiting ? "opacity-0 pointer-events-none" : "opacity-100",
        className,
      )}
      style={{
        opacity: isExiting ? 0 : Math.min(1, pBackground * 1.5),
      }}
    >
      {/* Botão sutil para pular (discreto, no canto superior) */}
      {allowSkip && (
        <button
          type="button"
          onClick={handleFinish}
          className="absolute top-5 right-6 z-30 font-mono text-[11px] tracking-widest uppercase text-sky-200/50 hover:text-white transition-colors duration-200 px-3 py-1.5 rounded-full border border-sky-400/15 hover:border-sky-400/40 backdrop-blur-sm cursor-pointer"
        >
          Pular
        </button>
      )}

      {/* Indicador discreto de fase de construção CAD no rodapé */}
      <footer className="absolute bottom-6 inset-x-0 z-30 flex items-center justify-between px-8 text-sky-300/40 font-mono text-[9px] tracking-[0.25em] pointer-events-none">
        <span className="hidden sm:inline">CALDRA CAD · KERNEL 2D</span>
        <span className="mx-auto sm:mx-0">
          {progress < 0.5 / T && "CALIBRANDO COORDENADAS"}
          {progress >= 0.5 / T && progress < 1.1 / T && "CONSTRUINDO EIXOS E GRID"}
          {progress >= 1.1 / T && progress < 2.2 / T && "TRAÇANDO RAIO E TANGENTES"}
          {progress >= 2.2 / T && progress < 3.5 / T && "COMPUTANDO GEOMETRIA CANÔNICA"}
          {progress >= 3.5 / T && progress < 4.4 / T && "EXPANDINDO SUPERFÍCIES"}
          {progress >= 4.4 / T && "SÍMBOLO CONCLUÍDO"}
        </span>
        <span className="hidden sm:inline">PRECISÃO ZERO FRESTA</span>
      </footer>

      {/* ====================================================================== */}
      {/* CANVAS VETORIAL PRINCIPAL SVG (100% ESCALÁVEL E ULTRA PRECISO)         */}
      {/* ====================================================================== */}
      <div className="relative flex items-center justify-center w-full h-full max-w-[92vw] max-h-[85vh] aspect-square">
        <svg
          viewBox="-45 -45 190 190"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full max-w-[580px] max-h-[580px] overflow-visible drop-shadow-2xl"
          aria-hidden="true"
        >
          <defs>
            {/* 1. MALHA MILIMETRADA TÉCNICA BASE (rosada suave sobre #051833) */}
            <pattern
              id="genesis-subgrid"
              width="5"
              height="5"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 5 0 L 0 0 0 5"
                fill="none"
                stroke="#FB7185"
                strokeWidth="0.22"
                strokeOpacity="0.12"
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
                stroke="#F43F5E"
                strokeWidth="0.45"
                strokeOpacity="0.24"
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
                stroke="#FDA4AF"
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
                stroke="#FDA4AF"
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

            {/* Gradiente da chapa de aço/prata metálica da CALDRA */}
            <linearGradient id="c-sheen" x1="18" y1="18" x2="82" y2="82" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="35%" stopColor="#F8FAFC" />
              <stop offset="70%" stopColor="#E2E8F0" />
              <stop offset="100%" stopColor="#CBD5E1" />
            </linearGradient>

            {/* Gradiente azul royal icônico oficial da CALDRA */}
            <linearGradient id="blue-chevron" x1="43" y1="42.5" x2="75.5" y2="58" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="35%" stopColor="#007AFF" />
              <stop offset="100%" stopColor="#0052CC" />
            </linearGradient>

            {/* Reflexo chanfrado especular sobre o logo final */}
            <linearGradient id="specular-reflection" x1="20" y1="20" x2="80" y2="80" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.4" />
              <stop offset="40%" stopColor="#FFFFFF" stopOpacity="0.05" />
              <stop offset="75%" stopColor="#051833" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
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

          {/* Eixos Cartesianos X e Y Centrais (Origem 50, 50) */}
          {pAxes > 0 && pGuidesFadeOut > 0 && (
            <g opacity={pAxes * pGuidesFadeOut}>
              {/* Eixo X traçado a partir do centro */}
              <line
                x1={50 - 75 * pAxes}
                y1="50"
                x2={50 + 75 * pAxes}
                y2="50"
                stroke="#38BDF8"
                strokeWidth="0.55"
                strokeDasharray="4 2"
                strokeOpacity="0.7"
              />
              {/* Eixo Y traçado a partir do centro */}
              <line
                x1="50"
                y1={50 - 75 * pAxes}
                x2="50"
                y2={50 + 75 * pAxes}
                stroke="#38BDF8"
                strokeWidth="0.55"
                strokeDasharray="4 2"
                strokeOpacity="0.7"
              />

              {/* Ticks milimétricos calibrados nos eixos */}
              {[-30, -20, -10, 10, 20, 30].map((delta) => (
                <g key={`tick-${delta}`} opacity={pAxes * 0.85}>
                  <line
                    x1={50 + delta}
                    y1={48.8}
                    x2={50 + delta}
                    y2={51.2}
                    stroke="#F43F5E"
                    strokeWidth="0.4"
                    strokeOpacity="0.75"
                  />
                  <line
                    x1={48.8}
                    y1={50 + delta}
                    x2={51.2}
                    y2={50 + delta}
                    stroke="#F43F5E"
                    strokeWidth="0.4"
                    strokeOpacity="0.75"
                  />
                </g>
              ))}

              {/* Origem técnica (0, 0) */}
              <circle
                cx="50"
                cy="50"
                r="1.6"
                fill="none"
                stroke="#38BDF8"
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
                fill="#38BDF8"
                fillOpacity="0.25"
              />
              <circle
                cx="50"
                cy="50"
                r="1.2"
                fill="#FFFFFF"
              />
            </g>
          )}

          {/* ================================================================== */}
          {/* ETAPA 3: LINHAS E ARCOS DE CONSTRUÇÃO CAD (TRAÇADOS EM TEMPO REAL)  */}
          {/* ================================================================== */}

          {pGuidesFadeOut > 0 && (
            <g opacity={pGuidesFadeOut}>
              {/* Raios fundamentais de caldeiraria a 45° */}
              {pRays45 > 0 && (
                <g opacity={pRays45}>
                  <line
                    x1={50 - 55 * pRays45}
                    y1={50 - 55 * pRays45}
                    x2={50 + 55 * pRays45}
                    y2={50 + 55 * pRays45}
                    stroke="#94A3B8"
                    strokeWidth="0.4"
                    strokeDasharray="3 3"
                    strokeOpacity="0.6"
                  />
                  <line
                    x1={50 - 55 * pRays45}
                    y1={50 + 55 * pRays45}
                    x2={50 + 55 * pRays45}
                    y2={50 - 55 * pRays45}
                    stroke="#94A3B8"
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
                    stroke="#38BDF8"
                    strokeWidth="0.45"
                    strokeDasharray={`${2 * Math.PI * 32}`}
                    strokeDashoffset={`${2 * Math.PI * 32 * (1 - pCompassCircle)}`}
                    strokeOpacity="0.55"
                  />
                  {/* Círculo do entalhe central R23.33 */}
                  <circle
                    cx="50"
                    cy="50"
                    r="23.33"
                    fill="none"
                    stroke="#94A3B8"
                    strokeWidth="0.35"
                    strokeDasharray="2 3"
                    strokeOpacity={0.45 * pCompassCircle}
                  />
                </g>
              )}

              {/* Reticulado delimitador e tangentes auxiliares */}
              {pAuxTangents > 0 && (
                <g opacity={pAuxTangents}>
                  {/* Caixa 64x64 mm de 18 a 82 */}
                  <rect
                    x="18"
                    y="18"
                    width="64"
                    height="64"
                    fill="none"
                    stroke="#64748B"
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
                    stroke="#38BDF8"
                    strokeWidth="0.32"
                    strokeDasharray="4 4"
                    strokeOpacity="0.4"
                  />
                  <line
                    x1="10"
                    y1="82"
                    x2="90"
                    y2="82"
                    stroke="#38BDF8"
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
                    stroke="#38BDF8"
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
                    stroke="#94A3B8"
                    strokeWidth="0.3"
                    strokeDasharray="2 2"
                    strokeOpacity="0.5"
                  />
                  <line
                    x1="45"
                    y1="66.5"
                    x2="85"
                    y2="66.5"
                    stroke="#94A3B8"
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
                    stroke="#38BDF8"
                    strokeWidth="0.28"
                    strokeDasharray="1 2"
                    strokeOpacity="0.45"
                  />
                  <line
                    x1="52"
                    y1="58"
                    x2="82"
                    y2="58"
                    stroke="#38BDF8"
                    strokeWidth="0.28"
                    strokeDasharray="1 2"
                    strokeOpacity="0.45"
                  />
                </g>
              )}

              {/* Cruzes de centro nos nós principais e cotas técnicas CAD */}
              {pCadAnnotations > 0 && (
                <g opacity={pCadAnnotations}>
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
                    <g key={`cross-${i}`} opacity={pCadAnnotations * 0.75}>
                      <line
                        x1={pt.x - 1.2}
                        y1={pt.y}
                        x2={pt.x + 1.2}
                        y2={pt.y}
                        stroke="#F8FAFC"
                        strokeWidth="0.32"
                      />
                      <line
                        x1={pt.x}
                        y1={pt.y - 1.2}
                        x2={pt.x}
                        y2={pt.y + 1.2}
                        stroke="#F8FAFC"
                        strokeWidth="0.32"
                      />
                    </g>
                  ))}

                  <text
                    x="84"
                    y="16"
                    fill="#38BDF8"
                    fontSize="2.8"
                    fontFamily="monospace"
                    opacity="0.75"
                  >
                    (82, 18)
                  </text>
                  <text
                    x="8"
                    y="86"
                    fill="#38BDF8"
                    fontSize="2.8"
                    fontFamily="monospace"
                    opacity="0.75"
                  >
                    (18, 82)
                  </text>
                  <text
                    x="48"
                    y="14"
                    fill="#94A3B8"
                    fontSize="2.6"
                    fontFamily="monospace"
                    opacity="0.65"
                  >
                    R32.0 · 45°
                  </text>
                  <text
                    x="68"
                    y="52"
                    fill="#38BDF8"
                    fontSize="2.4"
                    fontFamily="monospace"
                    opacity="0.65"
                  >
                    CAD·REF
                  </text>
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
              {/* O traçado se expande para o interior preenchendo a chapa */}
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

          {/* Superfície da Pastilha Azul nascendo diretamente do traçado */}
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
              stroke="#FFFFFF"
              strokeWidth="2.8"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={cOuterLength}
              strokeDashoffset={outerStrokeDash}
              opacity={Math.min(1, pDrawOuterC * 1.6)}
            />
          )}

          {/* Traçado do contorno da pastilha azul */}
          {pDrawInnerBlue > 0 && (
            <path
              d={pathDataInnerBlue}
              fill="none"
              stroke="#007AFF"
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
              <circle r="3.2" fill="#38BDF8" fillOpacity="0.25" />
              <circle r="1.6" fill="#38BDF8" fillOpacity="0.65" />
              <circle r="0.8" fill="#FFFFFF" />
              <line x1="-2.6" y1="0" x2="2.6" y2="0" stroke="#FFFFFF" strokeWidth="0.32" strokeOpacity="0.9" />
              <line x1="0" y1="-2.6" x2="0" y2="2.6" stroke="#FFFFFF" strokeWidth="0.32" strokeOpacity="0.9" />
            </g>
          )}

          {/* Cursor da pastilha azul */}
          {pDrawInnerBlue > 0 && pDrawInnerBlue < 1 && (
            <g
              transform={`translate(${innerCursor.x}, ${innerCursor.y})`}
              className="pointer-events-none"
            >
              <circle r="3.0" fill="#60A5FA" fillOpacity="0.3" />
              <circle r="1.5" fill="#60A5FA" fillOpacity="0.75" />
              <circle r="0.75" fill="#FFFFFF" />
              <line x1="-2.4" y1="0" x2="2.4" y2="0" stroke="#60A5FA" strokeWidth="0.32" strokeOpacity="0.9" />
              <line x1="0" y1="-2.4" x2="0" y2="2.4" stroke="#60A5FA" strokeWidth="0.32" strokeOpacity="0.9" />
            </g>
          )}

          {/* Cursor do compasso traçando o círculo R32 */}
          {pCompassCircle > 0 && pCompassCircle < 1 && (
            <g
              transform={`translate(${compassCursor.x}, ${compassCursor.y})`}
              className="pointer-events-none"
            >
              <circle r="2.4" fill="#38BDF8" fillOpacity="0.3" />
              <circle r="1.0" fill="#FFFFFF" />
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

              {/* Aresta límpida de brilho superior no elemento azul */}
              <path
                d="M 43 42.5 L 60 42.5 L 75.5 58"
                fill="none"
                stroke="#93C5FD"
                strokeWidth="0.9"
                strokeLinecap="round"
                opacity="0.85"
              />
            </g>
          )}
        </svg>
      </div>
    </aside>
  );
}
