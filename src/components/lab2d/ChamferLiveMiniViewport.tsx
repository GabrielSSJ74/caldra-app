/**
 * CALDRA — CHAMFER INTENT: JANELA DE PRÉVIA EM TEMPO REAL (LIVE 2D CAD MINI-VIEWPORT)
 *
 * Renderizador SVG vetorial paramétrico de 60 FPS (zero latência de rede)
 * acoplado diretamente aos parâmetros editáveis do CHAMFER Intent:
 *  - Auto-Fit (ViewBox dinâmico com 35% de padding ao redor de W × H);
 *  - Arredondamento seletivo de cantos (all, top_two, bottom_two, left_two, right_two, none);
 *  - Distribuição determinística de furos com margem de borda e marca de centro (+);
 *  - Cotas associativas em tempo real (W mm, H mm, Passo: X mm, R{raio});
 *  - Validação geométrica instantânea com destaque visual em vermelho (#ef4444).
 */

import React, { useState, useId, useMemo } from "react";
import { Maximize2, Minimize2, Eye, Ruler, Crosshair, AlertTriangle } from "lucide-react";
import type { CornerSelector, HoleDistributionMode } from "@/lib/intent";
import type { Entity } from "@/lib/lab2d/core";

export interface LiveViewportValidationState {
  isValid: boolean;
  isRadiusError: boolean;
  isPitchCollision: boolean;
  isMarginError: boolean;
  errorMessages: string[];
  computedPitch: number;
}

export interface ChamferLiveMiniViewportProps {
  width: number;
  height: number;
  cornerRadius: number;
  cornerSelector: CornerSelector;
  holeCount: number;
  holeDiameter: number;
  margin: number;
  holeDistribution?: HoleDistributionMode;
  pcd?: number;
  isPlateMode: boolean;
  fallbackEntities?: Entity[];
  isMinimizedToSheet: boolean;
  onToggleMinimizeToSheet: () => void;
  onPeekCanvasStart?: () => void;
  onPeekCanvasEnd?: () => void;
}

/**
 * Avalia em tempo real (0ms) as restrições geométricas da chapa paramétrica
 * conforme especificado na Seção 5 dos requisitos da Prévia ao Vivo.
 */
export function evaluateLivePlateValidation(params: {
  width: number;
  height: number;
  cornerRadius: number;
  cornerSelector: CornerSelector;
  holeCount: number;
  holeDiameter: number;
  margin: number;
}): LiveViewportValidationState {
  const W = Number.isFinite(params.width) ? params.width : 0;
  const H = Number.isFinite(params.height) ? params.height : 0;
  const R = Number.isFinite(params.cornerRadius) ? Math.max(0, params.cornerRadius) : 0;
  const N = Number.isFinite(params.holeCount) ? Math.max(0, Math.floor(params.holeCount)) : 0;
  const D = Number.isFinite(params.holeDiameter) ? Math.max(0, params.holeDiameter) : 0;
  const M = Number.isFinite(params.margin) ? params.margin : 0;

  const maxAllowedRadius = Math.min(W, H) / 2;
  const hasActiveCorners = params.cornerSelector !== "none" && R > 0;
  const isRadiusError = W <= 0 || H <= 0 || (hasActiveCorners && R > maxAllowedRadius);

  const computedPitch = N > 1 ? (W - 2 * M) / (N - 1) : 0;

  const isMarginError =
    N >= 1 &&
    (D <= 0 ||
      D >= H ||
      D >= W ||
      (N > 1 && (M < D / 2 || W - 2 * M <= 0)) ||
      (N === 1 && D > Math.min(W, H)));

  const isPitchCollision = N > 1 && computedPitch <= D;

  const errorMessages: string[] = [];
  if (W <= 0 || H <= 0) {
    errorMessages.push("Dimensões W e H devem ser maiores que zero.");
  }
  if (hasActiveCorners && R > maxAllowedRadius) {
    errorMessages.push(
      `Raio R (${R} mm) excede o limite geométrico min(W, H)/2 (${maxAllowedRadius.toFixed(1)} mm).`,
    );
  }
  if (isMarginError) {
    errorMessages.push(
      `Margem de borda (${M} mm) inferior ao raio do furo Ø/2 (${(D / 2).toFixed(1)} mm) ou furo fora da chapa.`,
    );
  }
  if (isPitchCollision) {
    errorMessages.push(
      `Colisão entre furos: Passo (${computedPitch.toFixed(1)} mm) ≤ Diâmetro Ø (${D} mm).`,
    );
  }

  return {
    isValid: !isRadiusError && !isPitchCollision && !isMarginError,
    isRadiusError,
    isPitchCollision,
    isMarginError,
    errorMessages,
    computedPitch,
  };
}

/**
 * Gera o caminho SVG (<path d="...">) da chapa centrada em (0, 0)
 * com arcos circulares exatos apenas nos cantos selecionados em `cornerSelector`.
 */
function buildSelectiveRoundedRectSvgPath(
  W: number,
  H: number,
  rawRadius: number,
  selector: CornerSelector,
): {
  d: string;
  rTL: number;
  rTR: number;
  rBR: number;
  rBL: number;
  activeCornerSample: { corner: "TL" | "TR" | "BR" | "BL"; cx: number; cy: number; vx: number; vy: number } | null;
} {
  const halfW = W / 2;
  const halfH = H / 2;
  const clampedR = Math.min(Math.max(0, rawRadius), Math.min(W, H) / 2);

  const isTL =
    selector === "all" ||
    selector === "top_two" ||
    selector === "left_two" ||
    selector === "top_left";
  const isTR =
    selector === "all" ||
    selector === "top_two" ||
    selector === "right_two" ||
    selector === "top_right";
  const isBR =
    selector === "all" ||
    selector === "bottom_two" ||
    selector === "right_two" ||
    selector === "bottom_right";
  const isBL =
    selector === "all" ||
    selector === "bottom_two" ||
    selector === "left_two" ||
    selector === "bottom_left";

  const rTL = isTL ? clampedR : 0;
  const rTR = isTR ? clampedR : 0;
  const rBR = isBR ? clampedR : 0;
  const rBL = isBL ? clampedR : 0;

  // Coordenadas SVG centradas em (0,0):
  // Topo: y = -halfH | Base: y = +halfH | Esquerda: x = -halfW | Direita: x = +halfW
  const cmds: string[] = [];

  // Início na aresta superior, logo após o canto superior esquerdo
  cmds.push(`M ${(-halfW + rTL).toFixed(3)} ${(-halfH).toFixed(3)}`);

  // Aresta superior -> Canto superior direito
  cmds.push(`L ${(halfW - rTR).toFixed(3)} ${(-halfH).toFixed(3)}`);
  if (rTR > 0) {
    cmds.push(`A ${rTR.toFixed(3)} ${rTR.toFixed(3)} 0 0 1 ${halfW.toFixed(3)} ${(-halfH + rTR).toFixed(3)}`);
  }

  // Aresta direita -> Canto inferior direito
  cmds.push(`L ${halfW.toFixed(3)} ${(halfH - rBR).toFixed(3)}`);
  if (rBR > 0) {
    cmds.push(`A ${rBR.toFixed(3)} ${rBR.toFixed(3)} 0 0 1 ${(halfW - rBR).toFixed(3)} ${halfH.toFixed(3)}`);
  }

  // Aresta inferior -> Canto inferior esquerdo
  cmds.push(`L ${(-halfW + rBL).toFixed(3)} ${halfH.toFixed(3)}`);
  if (rBL > 0) {
    cmds.push(`A ${rBL.toFixed(3)} ${rBL.toFixed(3)} 0 0 1 ${(-halfW).toFixed(3)} ${(halfH - rBL).toFixed(3)}`);
  }

  // Aresta esquerda -> Canto superior esquerdo
  cmds.push(`L ${(-halfW).toFixed(3)} ${(-halfH + rTL).toFixed(3)}`);
  if (rTL > 0) {
    cmds.push(`A ${rTL.toFixed(3)} ${rTL.toFixed(3)} 0 0 1 ${(-halfW + rTL).toFixed(3)} ${(-halfH).toFixed(3)}`);
  }

  cmds.push("Z");

  let activeCornerSample: {
    corner: "TL" | "TR" | "BR" | "BL";
    cx: number;
    cy: number;
    vx: number;
    vy: number;
  } | null = null;

  if (rawRadius > 0 && selector !== "none") {
    if (isTL) {
      activeCornerSample = {
        corner: "TL",
        cx: -halfW + rTL,
        cy: -halfH + rTL,
        vx: -halfW + rTL * (1 - Math.SQRT1_2),
        vy: -halfH + rTL * (1 - Math.SQRT1_2),
      };
    } else if (isTR) {
      activeCornerSample = {
        corner: "TR",
        cx: halfW - rTR,
        cy: -halfH + rTR,
        vx: halfW - rTR * (1 - Math.SQRT1_2),
        vy: -halfH + rTR * (1 - Math.SQRT1_2),
      };
    } else if (isBL) {
      activeCornerSample = {
        corner: "BL",
        cx: -halfW + rBL,
        cy: halfH - rBL,
        vx: -halfW + rBL * (1 - Math.SQRT1_2),
        vy: halfH - rBL * (1 - Math.SQRT1_2),
      };
    } else if (isBR) {
      activeCornerSample = {
        corner: "BR",
        cx: halfW - rBR,
        cy: halfH - rBR,
        vx: halfW - rBR * (1 - Math.SQRT1_2),
        vy: halfH - rBR * (1 - Math.SQRT1_2),
      };
    }
  }

  return {
    d: cmds.join(" "),
    rTL,
    rTR,
    rBR,
    rBL,
    activeCornerSample,
  };
}

export const ChamferLiveMiniViewport = React.memo(function ChamferLiveMiniViewport({
  width,
  height,
  cornerRadius,
  cornerSelector,
  holeCount,
  holeDiameter,
  margin,
  holeDistribution,
  pcd,
  isPlateMode,
  fallbackEntities = [],
  isMinimizedToSheet,
  onToggleMinimizeToSheet,
  onPeekCanvasStart,
  onPeekCanvasEnd,
}: ChamferLiveMiniViewportProps) {
  const [showDimensions, setShowDimensions] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const patternId = useId();

  // Dimensões seguras para renderização SVG sem NaN/divisão por zero
  const safeW = Math.max(20, Number.isFinite(width) && width > 0 ? width : 400);
  const safeH = Math.max(20, Number.isFinite(height) && height > 0 ? height : 250);
  const safeR = Math.max(0, Number.isFinite(cornerRadius) ? cornerRadius : 0);
  const safeN = Math.max(0, Math.min(200, Math.floor(Number.isFinite(holeCount) ? holeCount : 0)));
  const safeD = Math.max(1, Number.isFinite(holeDiameter) && holeDiameter > 0 ? holeDiameter : 12);
  const safeMargin = Number.isFinite(margin) ? margin : 25;

  const validation = useMemo(
    () =>
      evaluateLivePlateValidation({
        width,
        height,
        cornerRadius,
        cornerSelector,
        holeCount,
        holeDiameter,
        margin,
      }),
    [width, height, cornerRadius, cornerSelector, holeCount, holeDiameter, margin],
  );

  // Auto-Fit ViewBox Dinâmico: W e H com 35% de padding ao redor (total = 1.70x)
  const padX = safeW * 0.35;
  const padY = safeH * 0.35;
  const vbMinX = -(safeW / 2 + padX);
  const vbMinY = -(safeH / 2 + padY);
  const vbWidth = safeW + padX * 2;
  const vbHeight = safeH + padY * 2;

  // Fator de escala tipográfica/geométrica proporcional ao tamanho da peça
  const u = Math.max(safeW, safeH) / 360;
  const fontSize = Math.max(8, 11.5 * u);
  const smallFontSize = Math.max(7, 10 * u);
  const arrowSize = 5.5 * u;
  const gridStep = Math.max(10, Math.pow(10, Math.floor(Math.log10(Math.max(safeW, safeH)))) / 5);

  const platePath = useMemo(
    () => buildSelectiveRoundedRectSvgPath(safeW, safeH, safeR, cornerSelector),
    [safeW, safeH, safeR, cornerSelector],
  );

  // Cálculo determinístico dos furos na Prévia em Tempo Real
  const holeCenters = useMemo(() => {
    const centers: Array<{ x: number; y: number }> = [];
    if (safeN === 1) {
      centers.push({ x: 0, y: 0 });
    } else if (safeN > 1) {
      if (holeDistribution === "circular_pcd" && pcd && pcd > 0) {
        const rPcd = pcd / 2;
        for (let i = 0; i < safeN; i++) {
          const theta = (2 * Math.PI * i) / safeN;
          centers.push({
            x: rPcd * Math.cos(theta),
            y: rPcd * Math.sin(theta),
          });
        }
      } else {
        // Convenção linear com margem de borda:
        // X_start = -W/2 + margemBorda | X_end = +W/2 - margemBorda | pitch = (W - 2*margemBorda)/(N - 1)
        const xStart = -safeW / 2 + safeMargin;
        const pitch = (safeW - 2 * safeMargin) / (safeN - 1);
        for (let i = 0; i < safeN; i++) {
          centers.push({
            x: xStart + i * pitch,
            y: 0,
          });
        }
      }
    }
    return centers;
  }, [safeN, holeDistribution, pcd, safeW, safeMargin]);

  const plateStrokeColor = validation.isRadiusError ? "#ef4444" : "#38bdf8";
  const plateFillColor = validation.isRadiusError
    ? "rgba(239, 68, 68, 0.14)"
    : "rgba(56, 189, 248, 0.08)";
  const holeHasError = validation.isPitchCollision || validation.isMarginError;
  const holeStrokeColor = holeHasError ? "#ef4444" : "#f8fafc";
  const holeFillColor = holeHasError ? "rgba(239, 68, 68, 0.22)" : "#070b14";

  // Coordenadas das linhas de cota associativas
  const halfW = safeW / 2;
  const halfH = safeH / 2;
  const dimBottomY = halfH + Math.max(safeH * 0.19, 18 * u);
  const dimRightX = halfW + Math.max(safeW * 0.14, 22 * u);
  const dimPitchY = -halfH - Math.max(safeH * 0.14, 14 * u);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border transition-all duration-150 ${
        isExpanded ? "h-[310px]" : "h-[210px]"
      } ${
        !validation.isValid && isPlateMode
          ? "border-[#ef4444]/80 shadow-[0_0_20px_rgba(239,68,68,0.15)]"
          : "border-[#1e293b]"
      }`}
      style={{ backgroundColor: "#070b14" }}
    >
      {/* BARRA DE FERRAMENTAS FLUTUANTE MINIMALISTA NO TOPO DA PRÉVIA */}
      <div className="absolute top-2 left-2.5 right-2.5 z-10 flex items-center justify-between gap-1.5 pointer-events-none">
        {/* Telemetria Técnica Esquerda */}
        <div className="flex items-center gap-1.5 rounded-lg bg-slate-950/85 border border-slate-800/90 px-2 py-1 backdrop-blur-md pointer-events-auto">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              !validation.isValid && isPlateMode ? "bg-red-500 animate-pulse" : "bg-sky-400"
            }`}
          />
          <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-300">
            CAD 2D LIVE
          </span>
          {isPlateMode && safeN > 1 && (
            <span
              className={`font-mono text-[9px] border-l border-slate-800 pl-1.5 ${
                validation.isPitchCollision ? "text-red-400 font-bold" : "text-sky-300"
              }`}
            >
              Passo: {validation.computedPitch.toFixed(1)} mm
            </span>
          )}
        </div>

        {/* 3 Botões Interativos no Canto Superior Direito */}
        <div className="flex items-center gap-1 pointer-events-auto">
          <button
            type="button"
            onClick={() => setShowDimensions((v) => !v)}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 font-mono text-[9px] font-bold uppercase transition-colors border cursor-pointer ${
              showDimensions
                ? "bg-sky-500/20 border-sky-400/50 text-sky-300"
                : "bg-slate-950/85 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
            title="Alternar exibição das linhas de cota associativas"
          >
            <Ruler className="w-2.5 h-2.5" />
            <span>Cotas {showDimensions ? "ON" : "OFF"}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAxes((v) => !v)}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 font-mono text-[9px] font-bold uppercase transition-colors border cursor-pointer ${
              showAxes
                ? "bg-sky-500/20 border-sky-400/50 text-sky-300"
                : "bg-slate-950/85 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
            title="Alternar exibição dos eixos de simetria X e Y"
          >
            <Crosshair className="w-2.5 h-2.5" />
            <span>Eixos {showAxes ? "ON" : "OFF"}</span>
          </button>

          <button
            type="button"
            onClick={onToggleMinimizeToSheet}
            onPointerDown={onPeekCanvasStart}
            onPointerUp={onPeekCanvasEnd}
            onPointerLeave={onPeekCanvasEnd}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 font-mono text-[9px] font-bold uppercase transition-colors border cursor-pointer ${
              isMinimizedToSheet
                ? "bg-amber-500/25 border-amber-400/60 text-amber-200"
                : "bg-slate-950/85 border-slate-800 text-slate-300 hover:border-sky-500/50 hover:text-white"
            }`}
            title="Minimizar para inspecionar a peça no Canvas Principal do CHAMFER"
          >
            <Eye className="w-2.5 h-2.5 text-sky-400" />
            <span className="hidden sm:inline">
              {isMinimizedToSheet ? "Restaurar Modal" : "Ver no Canvas Principal"}
            </span>
            <span className="sm:hidden">{isMinimizedToSheet ? "Modal" : "Canvas"}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className="flex items-center justify-center rounded-lg bg-slate-950/85 border border-slate-800 p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title={isExpanded ? "Compactar altura (210px)" : "Expandir prévia (310px)"}
          >
            {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* VIEWPORT VETORIAL SVG PARAMÉTRICO (60 FPS) */}
      {isPlateMode ? (
        <svg
          className="w-full h-full select-none"
          viewBox={`${vbMinX} ${vbMinY} ${vbWidth} ${vbHeight}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Grade Métrica Técnica Sutil */}
            <pattern
              id={`cad-grid-minor-${patternId}`}
              width={gridStep}
              height={gridStep}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`}
                fill="none"
                stroke="#0f172a"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            </pattern>
            <pattern
              id={`cad-grid-major-${patternId}`}
              width={gridStep * 5}
              height={gridStep * 5}
              patternUnits="userSpaceOnUse"
            >
              <rect
                width={gridStep * 5}
                height={gridStep * 5}
                fill={`url(#cad-grid-minor-${patternId})`}
              />
              <path
                d={`M ${gridStep * 5} 0 L 0 0 0 ${gridStep * 5}`}
                fill="none"
                stroke="#162238"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            </pattern>
          </defs>

          {/* Fundo de Grade Técnica */}
          <rect
            x={vbMinX}
            y={vbMinY}
            width={vbWidth}
            height={vbHeight}
            fill={`url(#cad-grid-major-${patternId})`}
          />

          {/* EIXOS DE CENTRO (X e Y) TRACEJADOS EM #334155 */}
          {showAxes && (
            <g>
              <line
                x1={-halfW - padX * 0.45}
                y1={0}
                x2={halfW + padX * 0.45}
                y2={0}
                stroke="#334155"
                strokeWidth="1.1"
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={0}
                y1={-halfH - padY * 0.45}
                x2={0}
                y2={halfH + padY * 0.45}
                stroke="#334155"
                strokeWidth="1.1"
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}

          {/* CONTORNO DA CHAPA EM CIANO BRILHANTE (#38bdf8) OU VERMELHO (#ef4444) SE CONFLITO */}
          <path
            d={platePath.d}
            fill={plateFillColor}
            stroke={plateStrokeColor}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />

          {/* CÍRCULO PRIMITIVO PCD (SE APLICÁVEL) */}
          {holeDistribution === "circular_pcd" && pcd && pcd > 0 && (
            <circle
              cx={0}
              cy={0}
              r={pcd / 2}
              fill="none"
              stroke="#38bdf8"
              strokeOpacity="0.45"
              strokeWidth="1"
              strokeDasharray="5 3"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* FUROS COM CONTORNO NÍTIDO (#f8fafc), FUNDO ESCURO (#080d1a) E MARCA DE CENTRO (+) */}
          {holeCenters.map((h, idx) => {
            const rHole = safeD / 2;
            const crossLen = Math.max(rHole * 0.55, 3.2 * u);
            return (
              <g key={`hole-${idx}`}>
                <circle
                  cx={h.x}
                  cy={h.y}
                  r={rHole}
                  fill={holeFillColor}
                  stroke={holeStrokeColor}
                  strokeWidth="1.65"
                  vectorEffect="non-scaling-stroke"
                />
                {/* Marca de centro (+) dentro de cada furo */}
                <line
                  x1={h.x - crossLen}
                  y1={h.y}
                  x2={h.x + crossLen}
                  y2={h.y}
                  stroke={holeHasError ? "#ef4444" : "#94a3b8"}
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={h.x}
                  y1={h.y - crossLen}
                  x2={h.x}
                  y2={h.y + crossLen}
                  stroke={holeHasError ? "#ef4444" : "#94a3b8"}
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}

          {/* COTAS ASSOCIATIVAS E TELEMETRIA GEOMÉTRICA */}
          {showDimensions && (
            <g>
              {/* 1. COTA HORIZONTAL (W mm) ABAIXO DA CHAPA */}
              <g>
                <line
                  x1={-halfW}
                  y1={halfH + 2 * u}
                  x2={-halfW}
                  y2={dimBottomY + 4 * u}
                  stroke="#64748b"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={halfW}
                  y1={halfH + 2 * u}
                  x2={halfW}
                  y2={dimBottomY + 4 * u}
                  stroke="#64748b"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={-halfW}
                  y1={dimBottomY}
                  x2={halfW}
                  y2={dimBottomY}
                  stroke="#38bdf8"
                  strokeWidth="1.2"
                  vectorEffect="non-scaling-stroke"
                />
                {/* Setas extremas W */}
                <polygon
                  points={`${-halfW},${dimBottomY} ${-halfW + arrowSize},${dimBottomY - arrowSize * 0.45} ${-halfW + arrowSize},${dimBottomY + arrowSize * 0.45}`}
                  fill="#38bdf8"
                />
                <polygon
                  points={`${halfW},${dimBottomY} ${halfW - arrowSize},${dimBottomY - arrowSize * 0.45} ${halfW - arrowSize},${dimBottomY + arrowSize * 0.45}`}
                  fill="#38bdf8"
                />
                {/* Fundo e Rótulo W mm */}
                <rect
                  x={-28 * u}
                  y={dimBottomY - 7.5 * u}
                  width={56 * u}
                  height={15 * u}
                  rx={3 * u}
                  fill="#070b14"
                />
                <text
                  x={0}
                  y={dimBottomY + 3.8 * u}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize={fontSize}
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                  fontWeight="700"
                >
                  {width} mm
                </text>
              </g>

              {/* 2. COTA VERTICAL (H mm) À DIREITA DA CHAPA */}
              <g>
                <line
                  x1={halfW + 2 * u}
                  y1={-halfH}
                  x2={dimRightX + 4 * u}
                  y2={-halfH}
                  stroke="#64748b"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={halfW + 2 * u}
                  y1={halfH}
                  x2={dimRightX + 4 * u}
                  y2={halfH}
                  stroke="#64748b"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={dimRightX}
                  y1={-halfH}
                  x2={dimRightX}
                  y2={halfH}
                  stroke="#38bdf8"
                  strokeWidth="1.2"
                  vectorEffect="non-scaling-stroke"
                />
                {/* Setas extremas H */}
                <polygon
                  points={`${dimRightX},${-halfH} ${dimRightX - arrowSize * 0.45},${-halfH + arrowSize} ${dimRightX + arrowSize * 0.45},${-halfH + arrowSize}`}
                  fill="#38bdf8"
                />
                <polygon
                  points={`${dimRightX},${halfH} ${dimRightX - arrowSize * 0.45},${halfH - arrowSize} ${dimRightX + arrowSize * 0.45},${halfH - arrowSize}`}
                  fill="#38bdf8"
                />
                <text
                  x={dimRightX + 7 * u}
                  y={3.5 * u}
                  textAnchor="start"
                  fill="#e2e8f0"
                  fontSize={fontSize}
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                  fontWeight="700"
                >
                  {height} mm
                </text>
              </g>

              {/* 3. COTA DE PASSO ENTRE OS DOIS PRIMEIROS FUROS (Passo: X mm) */}
              {safeN > 1 && holeCenters.length >= 2 && holeDistribution !== "circular_pcd" && (
                <g>
                  <line
                    x1={holeCenters[0]!.x}
                    y1={0}
                    x2={holeCenters[0]!.x}
                    y2={dimPitchY - 3 * u}
                    stroke={validation.isPitchCollision ? "#ef4444" : "#64748b"}
                    strokeWidth="1"
                    strokeDasharray="3 2"
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1={holeCenters[1]!.x}
                    y1={0}
                    x2={holeCenters[1]!.x}
                    y2={dimPitchY - 3 * u}
                    stroke={validation.isPitchCollision ? "#ef4444" : "#64748b"}
                    strokeWidth="1"
                    strokeDasharray="3 2"
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1={holeCenters[0]!.x}
                    y1={dimPitchY}
                    x2={holeCenters[1]!.x}
                    y2={dimPitchY}
                    stroke={validation.isPitchCollision ? "#ef4444" : "#38bdf8"}
                    strokeWidth="1.2"
                    vectorEffect="non-scaling-stroke"
                  />
                  <polygon
                    points={`${holeCenters[0]!.x},${dimPitchY} ${holeCenters[0]!.x + arrowSize * 0.85},${dimPitchY - arrowSize * 0.4} ${holeCenters[0]!.x + arrowSize * 0.85},${dimPitchY + arrowSize * 0.4}`}
                    fill={validation.isPitchCollision ? "#ef4444" : "#38bdf8"}
                  />
                  <polygon
                    points={`${holeCenters[1]!.x},${dimPitchY} ${holeCenters[1]!.x - arrowSize * 0.85},${dimPitchY - arrowSize * 0.4} ${holeCenters[1]!.x - arrowSize * 0.85},${dimPitchY + arrowSize * 0.4}`}
                    fill={validation.isPitchCollision ? "#ef4444" : "#38bdf8"}
                  />
                  <text
                    x={(holeCenters[0]!.x + holeCenters[1]!.x) / 2}
                    y={dimPitchY - 4.5 * u}
                    textAnchor="middle"
                    fill={validation.isPitchCollision ? "#ef4444" : "#38bdf8"}
                    fontSize={smallFontSize}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                    fontWeight="700"
                  >
                    Passo: {Number(validation.computedPitch.toFixed(1))} mm
                  </text>
                </g>
              )}

              {/* 4. INDICADOR DE RAIO DE CANTO (R{raio}) APONTANDO PARA O CANTO ARREDONDADO */}
              {safeR > 0 && cornerSelector !== "none" && platePath.activeCornerSample && (
                <g>
                  {(() => {
                    const sample = platePath.activeCornerSample!;
                    const dirX = sample.corner === "TL" || sample.corner === "BL" ? -1 : 1;
                    const dirY = sample.corner === "TL" || sample.corner === "TR" ? -1 : 1;
                    const elbowX = sample.vx + dirX * 14 * u;
                    const elbowY = sample.vy + dirY * 12 * u;
                    const endX = elbowX + dirX * 12 * u;
                    const rColor = validation.isRadiusError ? "#ef4444" : "#38bdf8";

                    return (
                      <>
                        <polyline
                          points={`${sample.vx},${sample.vy} ${elbowX},${elbowY} ${endX},${elbowY}`}
                          fill="none"
                          stroke={rColor}
                          strokeWidth="1.2"
                          vectorEffect="non-scaling-stroke"
                        />
                        <circle cx={sample.vx} cy={sample.vy} r={1.8 * u} fill={rColor} />
                        <text
                          x={endX + dirX * 3 * u}
                          y={elbowY + 3.2 * u}
                          textAnchor={dirX < 0 ? "end" : "start"}
                          fill={rColor}
                          fontSize={smallFontSize}
                          fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                          fontWeight="700"
                        >
                          R{cornerRadius}
                        </text>
                      </>
                    );
                  })()}
                </g>
              )}
            </g>
          )}
        </svg>
      ) : (
        /* FALLBACK PARA PEÇAS DE CALDEIRARIA / FLANGES / SUPORTES NÃO-RETANGULARES */
        <FallbackEntitiesMiniViewport
          entities={fallbackEntities}
          showAxes={showAxes}
          patternId={patternId}
        />
      )}

      {/* BARRA INFERIOR DE ALERTA EM TEMPO REAL SE HOUVER CONFLITO GEOMÉTRICO */}
      {!validation.isValid && isPlateMode && (
        <div className="absolute bottom-2 left-2.5 right-2.5 z-10 flex items-center gap-1.5 rounded-lg bg-red-950/90 border border-red-500/60 px-2.5 py-1 text-[10px] font-mono text-red-200 backdrop-blur-md">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span className="truncate">{validation.errorMessages[0]}</span>
        </div>
      )}
    </div>
  );
});

const FallbackEntitiesMiniViewport = React.memo(function FallbackEntitiesMiniViewport({
  entities,
  showAxes,
  patternId,
}: {
  entities: Entity[];
  showAxes: boolean;
  patternId: string;
}) {
  // Calcula bounding box de todas as entidades compiladas
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const includePt = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const e of entities) {
    if (e.type === "line") {
      includePt(e.x1, e.y1);
      includePt(e.x2, e.y2);
    } else if (e.type === "circle" || e.type === "arc") {
      includePt(e.cx - e.r, e.cy - e.r);
      includePt(e.cx + e.r, e.cy + e.r);
    } else if (e.type === "polyline" && Array.isArray(e.pts)) {
      for (const p of e.pts) {
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
          includePt(p.x, p.y);
        }
      }
    }
  }

  if (!Number.isFinite(minX)) {
    minX = -200;
    maxX = 200;
    minY = -125;
    maxY = 125;
  }

  const w = Math.max(20, maxX - minX);
  const h = Math.max(20, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const padX = w * 0.35;
  const padY = h * 0.35;
  const vbMinX = minX - padX;
  const vbMinY = minY - padY;
  const vbW = w + padX * 2;
  const vbH = h + padY * 2;

  return (
    <svg
      className="w-full h-full select-none"
      viewBox={`${vbMinX} ${vbMinY} ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern
          id={`cad-fallback-grid-${patternId}`}
          width={Math.max(10, w / 10)}
          height={Math.max(10, w / 10)}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${Math.max(10, w / 10)} 0 L 0 0 0 ${Math.max(10, w / 10)}`}
            fill="none"
            stroke="#162238"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </pattern>
      </defs>
      <rect
        x={vbMinX}
        y={vbMinY}
        width={vbW}
        height={vbH}
        fill={`url(#cad-fallback-grid-${patternId})`}
      />
      {showAxes && (
        <g>
          <line
            x1={vbMinX}
            y1={cy}
            x2={vbMinX + vbW}
            y2={cy}
            stroke="#475569"
            strokeWidth="1"
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={cx}
            y1={vbMinY}
            x2={cx}
            y2={vbMinY + vbH}
            stroke="#475569"
            strokeWidth="1"
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}
      {entities.map((ent) => {
        const isFold = ent.layer === "dobra";
        const isRef = ent.layer === "referencia";
        const stroke = isRef ? "#475569" : isFold ? "#f59e0b" : "#38bdf8";
        if (ent.type === "line") {
          return (
            <line
              key={ent.id}
              x1={ent.x1}
              y1={ent.y1}
              x2={ent.x2}
              y2={ent.y2}
              stroke={stroke}
              strokeWidth="1.5"
              strokeDasharray={isRef || isFold ? "5 3" : undefined}
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        if (ent.type === "circle") {
          return (
            <circle
              key={ent.id}
              cx={ent.cx}
              cy={ent.cy}
              r={ent.r}
              fill={isRef ? "none" : "rgba(8, 13, 26, 0.75)"}
              stroke={isRef ? "#475569" : "#f8fafc"}
              strokeWidth="1.6"
              strokeDasharray={isRef ? "5 3" : undefined}
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        if (ent.type === "arc") {
          const sx = ent.cx + ent.r * Math.cos(ent.a0);
          const sy = ent.cy + ent.r * Math.sin(ent.a0);
          const ex = ent.cx + ent.r * Math.cos(ent.a1);
          const ey = ent.cy + ent.r * Math.sin(ent.a1);
          let sweep = ent.a1 - ent.a0;
          while (sweep < 0) sweep += Math.PI * 2;
          const largeArc = sweep > Math.PI ? 1 : 0;
          return (
            <path
              key={ent.id}
              d={`M ${sx} ${sy} A ${ent.r} ${ent.r} 0 ${largeArc} 1 ${ex} ${ey}`}
              fill="none"
              stroke={stroke}
              strokeWidth="1.8"
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        if (ent.type === "polyline" && Array.isArray(ent.pts) && ent.pts.length >= 2) {
          const ptsStr = ent.pts.map((p) => `${p.x},${p.y}`).join(" ");
          return ent.closed ? (
            <polygon
              key={ent.id}
              points={ptsStr}
              fill="rgba(56, 189, 248, 0.08)"
              stroke={stroke}
              strokeWidth="1.8"
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <polyline
              key={ent.id}
              points={ptsStr}
              fill="none"
              stroke={stroke}
              strokeWidth="1.6"
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        return null;
      })}
    </svg>
  );
});
