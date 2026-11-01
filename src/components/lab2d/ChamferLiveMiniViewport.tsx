/**
 * CALDRA — CHAMFER INTENT: PRÉVIA GEOMÉTRICA PADRÃO CAD PROFISSIONAL
 * (ISO 128 / ABNT NBR 8403 para linhas · ISO 129 / ABNT NBR 10126 para cotagem)
 *
 * Arquitetura pura em 2 estágios memorizados (§5.2):
 *  1. `buildDrawing(scene, options)` → Modelo de desenho técnico em `mm` (eixo Y do CAD para cima),
 *     métricas analíticas exatas (Área líquida, Perímetro de corte, Furos), pontos de snap notáveis
 *     (extremidade □, ponto médio △, centro ○, interseção ✕) e cotagem técnica gerada em código;
 *  2. `projectToScreen(drawing, view, theme)` → Primitivas já projetadas em `px` (espaço de tela),
 *     com contorno externo + furos num único `<path fillRule="evenodd">` (furos realmente vazados
 *     sobre a grade), anticolisão de caixas delimitadoras de textos de cota e pesos de linha
 *     constantes em px (grossa 1,6px · média 1,1px · fina 0,8px).
 */

import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import {
  Maximize2,
  Minimize2,
  Eye,
  Ruler,
  Crosshair,
  AlertTriangle,
  Grid,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
} from "lucide-react";
import type { CornerSelector, HoleDistributionMode } from "@/lib/intent";
import { outlinePoints, type Entity } from "@/lib/lab2d/core";
import {
  useIntentTheme,
  displayColor,
  getTechnicalLayerColor,
  type IntentThemeTokens,
} from "./useIntentTheme";

export interface LiveViewportValidationState {
  isValid: boolean;
  isRadiusError: boolean;
  isPitchCollision: boolean;
  isMarginError: boolean;
  errorMessages: string[];
  computedPitch: number;
}

export type DimensionVisibilityLevel = "off" | "main" | "all";

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
  // Novos callbacks opcionais para integração bidirecional (§2, §5, §6)
  isProvisional?: boolean;
  isCompiling?: boolean;
  activeLayerName?: string;
  focusedParamKey?: string | null;
  onSelectEntityParam?: (paramKey: string) => void;
  isFullscreenPreview?: boolean;
  onToggleFullscreenPreview?: () => void;
  decimalSeparator?: "," | ".";
}

/**
 * Avalia em tempo real (0ms) as restrições geométricas da chapa paramétrica.
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
 * Formata valor numérico sem zeros à direita desnecessários (§5.4: "87,5; 400").
 */
export function formatCadNumber(
  value: number,
  decimalSeparator: "," | "." = ",",
  showUnit = false,
): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  const raw = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/\.?0+$/, "");
  const formatted = decimalSeparator === "," ? raw.replace(".", ",") : raw;
  return showUnit ? `${formatted} mm` : formatted;
}

// ============================================================================
// ESTRUTURAS DE DADOS DO ESTÁGIO 1: `buildDrawing` (coordenadas em mm, Y para cima)
// ============================================================================

export type CadSnapKind = "endpoint" | "midpoint" | "center" | "intersection";

export interface CadSnapPointMm {
  x: number;
  y: number;
  kind: CadSnapKind;
  label: string;
}

export interface CadHoleMm {
  id: string;
  cx: number;
  cy: number;
  r: number;
  paramKey: string;
}

export interface CadCenterlineMm {
  id: string;
  kind: "line" | "circle";
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  cx?: number;
  cy?: number;
  r?: number;
}

export interface CadLinearDimMm {
  id: string;
  priority: "main" | "secondary";
  orientation: "horizontal" | "vertical";
  /** Pontos medidos na peça em mm (CAD Y-up) */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Direção para fora da peça: -1 (abaixo/esquerda) ou +1 (acima/direita) */
  side: -1 | 1;
  /** Nível de fileira de cota (1 = 26px, 2 = 46px, etc.) */
  row: number;
  text: string;
  paramKey: string;
}

export interface CadLeaderCalloutMm {
  id: string;
  priority: "main" | "secondary";
  kind: "hole_callout" | "radius_callout" | "diameter_callout";
  /** Ponto onde a seta toca o elemento em mm (CAD Y-up) */
  anchorX: number;
  anchorY: number;
  /** Direção unitária para fora (dx, dy em Y-up) */
  dirX: number;
  dirY: number;
  text: string;
  paramKey: string;
}

export interface CadAnalyticalMetrics {
  netAreaMm2: number;
  cutPerimeterMm: number;
  holeCount: number;
}

export interface CadDrawingMm {
  family: "plate" | "flange" | "slot" | "custom";
  titleSummary: string;
  descriptionSummary: string;
  isValid: boolean;
  errorLegend?: string;
  errorParamKey?: string;
  // Geometria principal em mm (CAD Y-up, centrada na origem (0,0))
  plate?: {
    W: number;
    H: number;
    R: number;
    corners: { tl: boolean; tr: boolean; br: boolean; bl: boolean };
  };
  flange?: {
    outerR: number;
    innerR: number;
    pcdR?: number;
  };
  slot?: {
    length: number;
    width: number;
    cx: number;
    cy: number;
  };
  holes: CadHoleMm[];
  secondarySegments: Array<{
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    dashed?: boolean;
  }>;
  centerlines: CadCenterlineMm[];
  linearDims: CadLinearDimMm[];
  leaders: CadLeaderCalloutMm[];
  snapPoints: CadSnapPointMm[];
  metrics: CadAnalyticalMetrics;
  modelBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

export interface BuildDrawingInput {
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
  decimalSeparator?: "," | ".";
  showUnitInDims?: boolean;
}

/**
 * Detecta se `fallbackEntities` representa um flange circular ou contém rasgo oblongo.
 */
function inspectFallbackEntities(entities: Entity[] | undefined) {
  if (!entities || entities.length === 0) {
    return { circles: [], lines: [], arcs: [], polylines: [] };
  }
  const circles = entities.filter(
    (e): e is Extract<Entity, { type: "circle" }> => e.type === "circle",
  );
  const lines = entities.filter(
    (e): e is Extract<Entity, { type: "line" }> => e.type === "line",
  );
  const arcs = entities.filter(
    (e): e is Extract<Entity, { type: "arc" }> => e.type === "arc",
  );
  const polylines = entities.filter(
    (e): e is Extract<Entity, { type: "polyline" }> => e.type === "polyline",
  );
  return { circles, lines, arcs, polylines };
}

/**
 * ESTÁGIO 1 (PURO): Constrói o modelo de desenho técnico em `mm` (eixo Y do CAD para cima)
 * a partir dos parâmetros compilados ou entidades da cena (§5.2, §5.3, §5.4).
 */
export function buildDrawing(input: BuildDrawingInput): CadDrawingMm {
  const sep = input.decimalSeparator ?? ",";
  const showUnit = Boolean(input.showUnitInDims);
  const fmt = (val: number) => formatCadNumber(val, sep, showUnit);

  const { circles, lines, arcs, polylines } = inspectFallbackEntities(input.fallbackEntities);

  // Detecta se é Flange Circular (T3): círculos de corte concêntricos na origem (excluindo círculo de construção PCD)
  const concentricCutCircles = circles
    .filter(
      (c) =>
        !c.isConstruction &&
        c.layer !== "construcao" &&
        c.layer !== "referencia" &&
        Math.hypot(c.cx, c.cy) < 1e-2,
    )
    .sort((a, b) => b.r - a.r);

  const isFlangeScene =
    (!input.isPlateMode && concentricCutCircles.length >= 1) ||
    (input.holeDistribution === "circular_pcd" &&
      !input.isPlateMode &&
      concentricCutCircles.length >= 1);

  if (isFlangeScene && concentricCutCircles.length >= 1) {
    const outerCircle = concentricCutCircles[0]!;
    const outerR = outerCircle.r;
    const outerD = outerR * 2;
    const innerCircle =
      concentricCutCircles.length >= 2
        ? concentricCutCircles[concentricCutCircles.length - 1]
        : undefined;
    const innerR = innerCircle ? innerCircle.r : 0;
    const innerD = innerR * 2;

    const boltCircles = circles.filter(
      (c) =>
        !c.isConstruction &&
        c.layer !== "construcao" &&
        c.layer !== "referencia" &&
        Math.hypot(c.cx, c.cy) >= 1,
    );
    const holes: CadHoleMm[] = boltCircles.map((c, idx) => ({
      id: `hole_${idx + 1}`,
      cx: c.cx,
      cy: c.cy,
      r: c.r,
      paramKey: "hole_diameter",
    }));

    const pcdR =
      holes.length > 0
        ? Math.hypot(holes[0]!.cx, holes[0]!.cy)
        : input.pcd
          ? input.pcd / 2
          : 0;
    const pcdD = pcdR * 2;

    const netAreaMm2 = Math.max(
      0,
      Math.PI * outerR * outerR -
        Math.PI * innerR * innerR -
        holes.reduce((acc, h) => acc + Math.PI * h.r * h.r, 0),
    );
    const cutPerimeterMm =
      2 * Math.PI * outerR +
      (innerR > 0 ? 2 * Math.PI * innerR : 0) +
      holes.reduce((acc, h) => acc + 2 * Math.PI * h.r, 0);

    const centerlines: CadCenterlineMm[] = [
      { id: "sym_x", kind: "line", x1: -outerR * 1.08, y1: 0, x2: outerR * 1.08, y2: 0 },
      { id: "sym_y", kind: "line", x1: 0, y1: -outerR * 1.08, x2: 0, y2: outerR * 1.08 },
    ];
    if (pcdR > 0) {
      centerlines.push({ id: "pcd_circle", kind: "circle", cx: 0, cy: 0, r: pcdR });
    }

    const linearDims: CadLinearDimMm[] = [
      {
        id: "flange_od",
        priority: "main",
        orientation: "horizontal",
        x1: -outerR,
        y1: -outerR,
        x2: outerR,
        y2: -outerR,
        side: -1,
        row: 2,
        text: `Ø${fmt(outerD)}`,
        paramKey: "outer_diameter",
      },
    ];
    if (innerD > 0) {
      linearDims.push({
        id: "flange_id",
        priority: "main",
        orientation: "horizontal",
        x1: -innerR,
        y1: -outerR,
        x2: innerR,
        y2: -outerR,
        side: -1,
        row: 1,
        text: `Ø${fmt(innerD)}`,
        paramKey: "inner_diameter",
      });
    }
    if (pcdD > 0) {
      linearDims.push({
        id: "flange_pcd",
        priority: "main",
        orientation: "vertical",
        x1: outerR,
        y1: -pcdR,
        x2: outerR,
        y2: pcdR,
        side: 1,
        row: 1,
        text: `Ø${fmt(pcdD)} PCD`,
        paramKey: "pcd",
      });
    }

    const leaders: CadLeaderCalloutMm[] = [];
    if (holes.length > 0) {
      const targetHole =
        holes.reduce((best, h) => (h.cx + h.cy > best.cx + best.cy ? h : best), holes[0]!) ??
        holes[0]!;
      const holeD = targetHole.r * 2;
      leaders.push({
        id: "flange_holes_callout",
        priority: "main",
        kind: "hole_callout",
        anchorX: targetHole.cx + targetHole.r * Math.SQRT1_2,
        anchorY: targetHole.cy + targetHole.r * Math.SQRT1_2,
        dirX: Math.SQRT1_2,
        dirY: Math.SQRT1_2,
        text: `${holes.length}× Ø${fmt(holeD)}`,
        paramKey: "hole_diameter",
      });
    }

    const snapPoints: CadSnapPointMm[] = [
      { x: 0, y: 0, kind: "center", label: "Origem (0, 0)" },
      { x: outerR, y: 0, kind: "endpoint", label: `Quadrante (+${fmt(outerR)}, 0)` },
      { x: -outerR, y: 0, kind: "endpoint", label: `Quadrante (-${fmt(outerR)}, 0)` },
      { x: 0, y: outerR, kind: "endpoint", label: `Quadrante (0, +${fmt(outerR)})` },
      { x: 0, y: -outerR, kind: "endpoint", label: `Quadrante (0, -${fmt(outerR)})` },
      ...holes.map((h) => ({
        x: h.cx,
        y: h.cy,
        kind: "center" as const,
        label: `Centro Furo (${fmt(h.cx)}, ${fmt(h.cy)})`,
      })),
    ];

    return {
      family: "flange",
      titleSummary: `Flange Ø${fmt(outerD)}${innerD > 0 ? ` / Ø${fmt(innerD)}` : ""}`,
      descriptionSummary: `Flange Ø${fmt(outerD)}, furo central Ø${fmt(innerD)}, PCD ${fmt(pcdD)}, ${holes.length} furos Ø${holes[0] ? fmt(holes[0].r * 2) : "0"}`,
      isValid: outerR > innerR && outerR > 0,
      flange: { outerR, innerR, pcdR },
      holes,
      secondarySegments: [],
      centerlines,
      linearDims,
      leaders,
      snapPoints,
      metrics: {
        netAreaMm2,
        cutPerimeterMm,
        holeCount: holes.length,
      },
      modelBounds: {
        minX: -outerR,
        minY: -outerR,
        maxX: outerR,
        maxY: outerR,
      },
    };
  }

  // Caso padrão / Chapa Paramétrica (T1, T2, T4)
  const validation = evaluateLivePlateValidation(input);
  const W = Math.max(1, Number.isFinite(input.width) && input.width > 0 ? input.width : 400);
  const H = Math.max(1, Number.isFinite(input.height) && input.height > 0 ? input.height : 250);
  const halfW = W / 2;
  const halfH = H / 2;
  const rawR = Math.max(0, Number.isFinite(input.cornerRadius) ? input.cornerRadius : 0);
  const maxGeomR = Math.min(W, H) / 2;
  const R = Math.min(rawR, maxGeomR);

  const sel = input.cornerSelector || "all";
  const corners = {
    tl: sel === "all" || sel === "top_two" || sel === "left_two",
    tr: sel === "all" || sel === "top_two" || sel === "right_two",
    br: sel === "all" || sel === "bottom_two" || sel === "right_two",
    bl: sel === "all" || sel === "bottom_two" || sel === "left_two",
  };
  const activeCornerCount =
    (corners.tl ? 1 : 0) + (corners.tr ? 1 : 0) + (corners.br ? 1 : 0) + (corners.bl ? 1 : 0);

  // Detecta se há rasgo oblongo nas entidades compiladas (T4: via arcos ou polilinha fechada de oblongo)
  let detectedSlot: { length: number; width: number; cx: number; cy: number } | undefined;
  if (arcs.length >= 2) {
    for (let i = 0; i < arcs.length; i++) {
      for (let j = i + 1; j < arcs.length; j++) {
        const a1 = arcs[i]!;
        const a2 = arcs[j]!;
        if (
          Math.abs(a1.r - a2.r) < 0.5 &&
          Math.abs(a1.cy - a2.cy) < 0.5 &&
          Math.abs(a1.cx - a2.cx) > 1
        ) {
          const slotR = a1.r;
          const distCenters = Math.abs(a2.cx - a1.cx);
          const totalLen = distCenters + 2 * slotR;
          if (totalLen < W * 0.92 && slotR * 2 < H * 0.9) {
            detectedSlot = {
              length: Number(totalLen.toFixed(2)),
              width: Number((slotR * 2).toFixed(2)),
              cx: 0,
              cy: 0,
            };
            break;
          }
        }
      }
      if (detectedSlot) break;
    }
  }
  if (!detectedSlot && polylines.length > 0) {
    for (const poly of polylines) {
      const hasBulge = Boolean(poly.bulges && poly.bulges.some((b) => Math.abs(b) > 0.1));
      if (!poly.closed || (poly.pts.length < 6 && !(poly.pts.length >= 4 && hasBulge))) continue;
      const samplePts = hasBulge ? outlinePoints(poly) : poly.pts;
      const xs = samplePts.map((p) => p.x);
      const ys = samplePts.map((p) => p.y);
      const spanX = Math.max(...xs) - Math.min(...xs);
      const spanY = Math.max(...ys) - Math.min(...ys);
      const len = Math.max(spanX, spanY);
      const wid = Math.min(spanX, spanY);
      if (len > wid && len < W * 0.92 && wid < H * 0.9 && wid > 2) {
        detectedSlot = {
          length: Number(len.toFixed(2)),
          width: Number(wid.toFixed(2)),
          cx: 0,
          cy: 0,
        };
        break;
      }
    }
  }

  // Cálculo dos furos em mm (CAD Y-up, peça centrada em 0,0)
  const N = Math.max(0, Math.floor(input.holeCount));
  const D = Math.max(0, input.holeDiameter);
  const holeR = D / 2;
  const M = input.margin;
  const distMode = input.holeDistribution || "linear_centerline_x";

  const holes: CadHoleMm[] = [];
  if (N > 0 && D > 0) {
    if (distMode === "corner_inset") {
      const ix = Math.max(0, halfW - M);
      const iy = Math.max(0, halfH - M);
      const pts: Array<[number, number]> = [
        [-ix, -iy],
        [ix, -iy],
        [ix, iy],
        [-ix, iy],
      ];
      for (let i = 0; i < Math.min(N, pts.length); i++) {
        holes.push({
          id: `hole_${i + 1}`,
          cx: pts[i]![0],
          cy: pts[i]![1],
          r: holeR,
          paramKey: "hole_diameter",
        });
      }
    } else if (distMode === "circular_pcd") {
      const pcdDiam = input.pcd && input.pcd > 0 ? input.pcd : Math.max(20, Math.min(W, H) - 2 * M);
      const pcdRad = pcdDiam / 2;
      for (let i = 0; i < N; i++) {
        const angle = (2 * Math.PI * i) / N;
        holes.push({
          id: `hole_${i + 1}`,
          cx: Number((pcdRad * Math.cos(angle)).toFixed(4)),
          cy: Number((pcdRad * Math.sin(angle)).toFixed(4)),
          r: holeR,
          paramKey: "hole_diameter",
        });
      }
    } else if (N === 1) {
      holes.push({
        id: "hole_1",
        cx: 0,
        cy: 0,
        r: holeR,
        paramKey: "hole_diameter",
      });
    } else {
      const pitch = (W - 2 * M) / (N - 1);
      for (let i = 0; i < N; i++) {
        const cx = -halfW + M + i * pitch;
        holes.push({
          id: `hole_${i + 1}`,
          cx: Number(cx.toFixed(4)),
          cy: 0,
          r: holeR,
          paramKey: "hole_diameter",
        });
      }
    }
  } else if (circles.length > 0) {
    // Se os furos vieram diretamente das entidades compiladas
    circles.forEach((c, idx) => {
      holes.push({
        id: `hole_${idx + 1}`,
        cx: c.cx,
        cy: c.cy,
        r: c.r,
        paramKey: "hole_diameter",
      });
    });
  }

  // Linhas de centro (§5.3)
  const centerlines: CadCenterlineMm[] = [];
  if (distMode === "linear_centerline_x" && holes.length > 1) {
    // §5.3: "A linha de centro de uma fileira de furos vai só ~5 px além do último furo (nunca atravessa a peça nem a tela)."
    const minHoleX = Math.min(...holes.map((h) => h.cx - h.r));
    const maxHoleX = Math.max(...holes.map((h) => h.cx + h.r));
    const holeRowY = holes[0]?.cy ?? 0;
    const extMm = Math.max(4, Math.min(12, D * 0.45));
    centerlines.push({
      id: "hole_row_cl",
      kind: "line",
      x1: minHoleX - extMm,
      y1: holeRowY,
      x2: maxHoleX + extMm,
      y2: holeRowY,
    });
  } else if (distMode === "circular_pcd" && holes.length > 0) {
    const pcdRad = Math.hypot(holes[0]!.cx, holes[0]!.cy);
    if (pcdRad > 0) {
      centerlines.push({ id: "pcd_cl", kind: "circle", cx: 0, cy: 0, r: pcdRad });
    }
  }

  if (detectedSlot) {
    const slotHalfL = detectedSlot.length / 2;
    const extMm = Math.max(4, detectedSlot.width * 0.35);
    centerlines.push({
      id: "slot_cl_x",
      kind: "line",
      x1: detectedSlot.cx - slotHalfL - extMm,
      y1: detectedSlot.cy,
      x2: detectedSlot.cx + slotHalfL + extMm,
      y2: detectedSlot.cy,
    });
  }

  // Cotas lineares convencionais (§5.4)
  const linearDims: CadLinearDimMm[] = [];
  const leaders: CadLeaderCalloutMm[] = [];

  // 1. Largura total (embaixo) e Altura total (à direita)
  const hasBottomChain =
    holes.length > 1 &&
    (distMode === "linear_centerline_x" || distMode === "corner_inset") &&
    W - 2 * M > 0;

  linearDims.push({
    id: "dim_total_w",
    priority: "main",
    orientation: "horizontal",
    x1: -halfW,
    y1: -halfH,
    x2: halfW,
    y2: -halfH,
    side: -1,
    row: hasBottomChain ? 2 : 1,
    text: fmt(W),
    paramKey: "width",
  });

  const hasRightChain = distMode === "corner_inset" && holes.length >= 4 && H - 2 * M > 0;

  linearDims.push({
    id: "dim_total_h",
    priority: "main",
    orientation: "vertical",
    x1: halfW,
    y1: -halfH,
    x2: halfW,
    y2: halfH,
    side: 1,
    row: hasRightChain ? 2 : 1,
    text: fmt(H),
    paramKey: "height",
  });

  // 2. Cadeia de cotas de furos alinhados (T1: 25 | 4× 87,5 | 25) ou nos cantos (T2: 25 | 450 | 25 e 25 | 250 | 25)
  if (distMode === "linear_centerline_x" && holes.length > 1 && W - 2 * M > 0) {
    const firstX = holes[0]!.cx;
    const lastX = holes[holes.length - 1]!.cx;
    const holeY = holes[0]!.cy;
    const intervals = holes.length - 1;
    const pitch = validation.computedPitch;

    // Margem esquerda (borda esquerda até 1.º furo)
    linearDims.push({
      id: "dim_chain_left_margin",
      priority: "main",
      orientation: "horizontal",
      x1: -halfW,
      y1: -halfH,
      x2: firstX,
      y2: holeY,
      side: -1,
      row: 1,
      text: fmt(M),
      paramKey: "margin",
    });

    // Intervalo total entre 1.º e último furo ("4× 87,5" no modo Principais)
    linearDims.push({
      id: "dim_chain_pitch_group",
      priority: "main",
      orientation: "horizontal",
      x1: firstX,
      y1: holeY,
      x2: lastX,
      y2: holeY,
      side: -1,
      row: 1,
      text: intervals > 1 ? `${intervals}× ${fmt(pitch)}` : fmt(pitch),
      paramKey: "hole_count",
    });

    // Margem direita (último furo até borda direita)
    linearDims.push({
      id: "dim_chain_right_margin",
      priority: "main",
      orientation: "horizontal",
      x1: lastX,
      y1: holeY,
      x2: halfW,
      y2: -halfH,
      side: -1,
      row: 1,
      text: fmt(M),
      paramKey: "margin",
    });

    // Cotas secundárias (nível "Todas"): cada passo individual e posição Y da linha de furos
    linearDims.push({
      id: "dim_hole_row_y",
      priority: "secondary",
      orientation: "vertical",
      x1: -halfW,
      y1: -halfH,
      x2: firstX,
      y2: holeY,
      side: -1,
      row: 1,
      text: fmt(halfH + holeY),
      paramKey: "height",
    });

    if (intervals > 1) {
      for (let i = 0; i < intervals; i++) {
        linearDims.push({
          id: `dim_sub_pitch_${i + 1}`,
          priority: "secondary",
          orientation: "horizontal",
          x1: holes[i]!.cx,
          y1: holes[i]!.cy,
          x2: holes[i + 1]!.cx,
          y2: holes[i + 1]!.cy,
          side: 1,
          row: 1,
          text: fmt(pitch),
          paramKey: "hole_count",
        });
      }
    }
  } else if (distMode === "corner_inset" && holes.length >= 2) {
    // T2: Chapa 500 × 300 com 4 furos Ø12 nos cantos a 25 mm: cotas 25 | 450 | 25 e 25 | 250 | 25
    const spanX = W - 2 * M;
    const spanY = H - 2 * M;
    const leftX = -halfW + M;
    const rightX = halfW - M;
    const bottomY = -halfH + M;
    const topY = halfH - M;

    linearDims.push(
      {
        id: "dim_corner_x_left",
        priority: "main",
        orientation: "horizontal",
        x1: -halfW,
        y1: -halfH,
        x2: leftX,
        y2: bottomY,
        side: -1,
        row: 1,
        text: fmt(M),
        paramKey: "margin",
      },
      {
        id: "dim_corner_x_span",
        priority: "main",
        orientation: "horizontal",
        x1: leftX,
        y1: bottomY,
        x2: rightX,
        y2: bottomY,
        side: -1,
        row: 1,
        text: fmt(spanX),
        paramKey: "margin",
      },
      {
        id: "dim_corner_x_right",
        priority: "main",
        orientation: "horizontal",
        x1: rightX,
        y1: bottomY,
        x2: halfW,
        y2: -halfH,
        side: -1,
        row: 1,
        text: fmt(M),
        paramKey: "margin",
      },
      {
        id: "dim_corner_y_bottom",
        priority: "main",
        orientation: "vertical",
        x1: halfW,
        y1: -halfH,
        x2: rightX,
        y2: bottomY,
        side: 1,
        row: 1,
        text: fmt(M),
        paramKey: "margin",
      },
      {
        id: "dim_corner_y_span",
        priority: "main",
        orientation: "vertical",
        x1: rightX,
        y1: bottomY,
        x2: rightX,
        y2: topY,
        side: 1,
        row: 1,
        text: fmt(spanY),
        paramKey: "margin",
      },
      {
        id: "dim_corner_y_top",
        priority: "main",
        orientation: "vertical",
        x1: rightX,
        y1: topY,
        x2: halfW,
        y2: halfH,
        side: 1,
        row: 1,
        text: fmt(M),
        paramKey: "margin",
      },
    );
  }

  // Cotas de rasgo oblongo (T4: comprimento, largura e R)
  if (detectedSlot) {
    const slotHalfL = detectedSlot.length / 2;
    const slotR = detectedSlot.width / 2;
    linearDims.push({
      id: "dim_slot_length",
      priority: "main",
      orientation: "horizontal",
      x1: detectedSlot.cx - slotHalfL,
      y1: detectedSlot.cy,
      x2: detectedSlot.cx + slotHalfL,
      y2: detectedSlot.cy,
      side: 1,
      row: 1,
      text: fmt(detectedSlot.length),
      paramKey: "slot_length",
    });
    leaders.push({
      id: "leader_slot_radius",
      priority: "main",
      kind: "radius_callout",
      anchorX: detectedSlot.cx + slotHalfL - slotR * (1 - Math.SQRT1_2),
      anchorY: detectedSlot.cy + slotR * Math.SQRT1_2,
      dirX: Math.SQRT1_2,
      dirY: Math.SQRT1_2,
      text: `R${fmt(slotR)} (${fmt(detectedSlot.width)})`,
      paramKey: "slot_width",
    });
  }

  // 3. Chamada de furos ("5× Ø12" ou "4× Ø12") com linha de chamada até a borda de um furo (§5.4)
  if (holes.length > 0 && D > 0) {
    const refHole = holes[holes.length - 1]!;
    leaders.push({
      id: "leader_holes_callout",
      priority: "main",
      kind: "hole_callout",
      anchorX: refHole.cx + refHole.r * Math.SQRT1_2,
      anchorY: refHole.cy + refHole.r * Math.SQRT1_2,
      dirX: Math.SQRT1_2,
      dirY: Math.SQRT1_2,
      text: holes.length > 1 ? `${holes.length}× Ø${fmt(D)}` : `Ø${fmt(D)}`,
      paramKey: "hole_diameter",
    });
  }

  // 4. Chamada radial a 45° nos cantos arredondados ("R20") tocando o arco (§5.4)
  if (rawR > 0 && activeCornerCount > 0) {
    // Escolhe o canto superior esquerdo (ou primeiro ativo) para a chamada R a 45°
    let cx = -halfW + R;
    let cy = halfH - R;
    let dirX = -Math.SQRT1_2;
    let dirY = Math.SQRT1_2;
    if (corners.tl) {
      cx = -halfW + R;
      cy = halfH - R;
      dirX = -Math.SQRT1_2;
      dirY = Math.SQRT1_2;
    } else if (corners.tr) {
      cx = halfW - R;
      cy = halfH - R;
      dirX = Math.SQRT1_2;
      dirY = Math.SQRT1_2;
    } else if (corners.bl) {
      cx = -halfW + R;
      cy = -halfH + R;
      dirX = -Math.SQRT1_2;
      dirY = -Math.SQRT1_2;
    } else {
      cx = halfW - R;
      cy = -halfH + R;
      dirX = Math.SQRT1_2;
      dirY = -Math.SQRT1_2;
    }

    leaders.push({
      id: "leader_corner_radius",
      priority: "main",
      kind: "radius_callout",
      anchorX: cx + R * dirX,
      anchorY: cy + R * dirY,
      dirX,
      dirY,
      text: `R${fmt(rawR)}`,
      paramKey: "corner_radius",
    });
  }

  // Métricas analíticas exatas (§5.1: nunca pela tesselação e nunca inventadas)
  const cornerAreaLoss = activeCornerCount * (1 - Math.PI / 4) * R * R;
  const holesAreaLoss = holes.reduce((acc, h) => acc + Math.PI * h.r * h.r, 0);
  const slotAreaLoss = detectedSlot
    ? (detectedSlot.length - detectedSlot.width) * detectedSlot.width +
      Math.PI * Math.pow(detectedSlot.width / 2, 2)
    : 0;
  const netAreaMm2 = Math.max(0, W * H - cornerAreaLoss - holesAreaLoss - slotAreaLoss);

  const outerPerim = 2 * (W + H) - activeCornerCount * (2 - Math.PI / 2) * R;
  const holesPerim = holes.reduce((acc, h) => acc + 2 * Math.PI * h.r, 0);
  const slotPerim = detectedSlot
    ? 2 * (detectedSlot.length - detectedSlot.width) + Math.PI * detectedSlot.width
    : 0;
  const cutPerimeterMm = outerPerim + holesPerim + slotPerim;

  // Pontos de snap notáveis (extremidade □, ponto médio △, centro ○, interseção ✕)
  const snapPoints: CadSnapPointMm[] = [
    { x: 0, y: 0, kind: "center", label: "Centro da Peça (0, 0)" },
    { x: -halfW, y: -halfH, kind: "endpoint", label: `Canto IE (-${fmt(halfW)}, -${fmt(halfH)})` },
    { x: halfW, y: -halfH, kind: "endpoint", label: `Canto ID (${fmt(halfW)}, -${fmt(halfH)})` },
    { x: halfW, y: halfH, kind: "endpoint", label: `Canto SD (${fmt(halfW)}, ${fmt(halfH)})` },
    { x: -halfW, y: halfH, kind: "endpoint", label: `Canto SE (-${fmt(halfW)}, ${fmt(halfH)})` },
    { x: 0, y: halfH, kind: "midpoint", label: `Meio Superior (0, ${fmt(halfH)})` },
    { x: 0, y: -halfH, kind: "midpoint", label: `Meio Inferior (0, -${fmt(halfH)})` },
    { x: -halfW, y: 0, kind: "midpoint", label: `Meio Esquerdo (-${fmt(halfW)}, 0)` },
    { x: halfW, y: 0, kind: "midpoint", label: `Meio Direito (${fmt(halfW)}, 0)` },
    ...holes.map((h, idx) => ({
      x: h.cx,
      y: h.cy,
      kind: "center" as const,
      label: `Furo #${idx + 1} (${fmt(h.cx)}, ${fmt(h.cy)})`,
    })),
  ];

  const errorLegend = !validation.isValid ? validation.errorMessages[0] : undefined;
  const errorParamKey = validation.isRadiusError
    ? "corner_radius"
    : validation.isMarginError
      ? "margin"
      : validation.isPitchCollision
        ? "hole_count"
        : undefined;

  const pitchDesc =
    holes.length > 1 && distMode === "linear_centerline_x"
      ? `, passo ${fmt(validation.computedPitch)}`
      : "";
  const descriptionSummary = `Chapa ${fmt(W)} × ${fmt(H)}${rawR > 0 ? `, R${fmt(rawR)}` : ""}${
    holes.length > 0 ? `, ${holes.length} furos Ø${fmt(D)}${pitchDesc}` : ""
  }`;

  return {
    family: detectedSlot ? "slot" : "plate",
    titleSummary: `Chapa ${fmt(W)} × ${fmt(H)} mm`,
    descriptionSummary,
    isValid: validation.isValid,
    errorLegend,
    errorParamKey,
    plate: {
      W,
      H,
      R,
      corners,
    },
    slot: detectedSlot,
    holes,
    secondarySegments: [],
    centerlines,
    linearDims,
    leaders,
    snapPoints,
    metrics: {
      netAreaMm2,
      cutPerimeterMm,
      holeCount: holes.length,
    },
    modelBounds: {
      minX: -halfW,
      minY: -halfH,
      maxX: halfW,
      maxY: halfH,
    },
  };
}

// ============================================================================
// ESTRUTURAS DE DADOS DO ESTÁGIO 2: `projectToScreen` (coordenadas em px, Y para baixo)
// ============================================================================

export interface ScreenViewTransform {
  widthPx: number;
  heightPx: number;
  /** Escala em px por mm */
  scalePxPerMm: number;
  /** Posição na tela (px) onde a origem do modelo (0,0 mm) é projetada */
  originScreenX: number;
  originScreenY: number;
  dimLevel: DimensionVisibilityLevel;
}

export interface ScreenLabelBox {
  id: string;
  text: string;
  cx: number;
  cy: number;
  width: number;
  height: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  paramKey: string;
}

export interface ProjectedDimensionPx {
  id: string;
  paramKey: string;
  extLine1: { x1: number; y1: number; x2: number; y2: number };
  extLine2: { x1: number; y1: number; x2: number; y2: number };
  dimLine: { x1: number; y1: number; x2: number; y2: number };
  arrow1Points: string;
  arrow2Points: string;
  labelBox: ScreenLabelBox;
}

export interface ProjectedLeaderPx {
  id: string;
  paramKey: string;
  polylinePoints: string;
  arrowPoints: string;
  labelBox: ScreenLabelBox;
}

export interface ProjectedDrawingPx {
  compoundCutPathD: string;
  centerlinesPx: Array<{
    id: string;
    kind: "line" | "circle";
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    cx?: number;
    cy?: number;
    r?: number;
  }>;
  holeCenterCrossesPx: Array<{
    id: string;
    cx: number;
    cy: number;
    armHalfPx: number;
    renderCircleInCutPath: boolean;
    rPx: number;
    paramKey: string;
  }>;
  dimensionsPx: ProjectedDimensionPx[];
  leadersPx: ProjectedLeaderPx[];
  allLabelBoxes: ScreenLabelBox[];
  hiddenDimensionCount: number;
  grid: {
    minorStepPx: number;
    majorStepPx: number;
    minorStepMm: number;
    verticalLines: Array<{ x: number; isMajor: boolean }>;
    horizontalLines: Array<{ y: number; isMajor: boolean }>;
  };
  scaleBar: {
    mmValue: number;
    widthPx: number;
    label: string;
  };
  cutDisplayColor: string;
}

/**
 * Calcula o enquadramento automático (Auto-Fit) incluindo a caixa envolvente
 * da geometria E das anotações externas (cotas e chamadas), com margem adaptável (§5.6).
 */
export function computeAutoFitView(
  drawing: CadDrawingMm,
  widthPx: number,
  heightPx: number,
  dimLevel: DimensionVisibilityLevel,
): ScreenViewTransform {
  const safeW = Math.max(160, widthPx);
  const safeH = Math.max(120, heightPx);

  // Reserva margens para o rótulo superior esquerdo, UCS inferior esquerdo, escala inferior direita e cotas externas
  const hasBottomDims =
    dimLevel !== "off" &&
    drawing.linearDims.some((d) => d.orientation === "horizontal" && d.side === -1);
  const maxBottomRow = hasBottomDims
    ? Math.max(
        1,
        ...drawing.linearDims
          .filter((d) => d.orientation === "horizontal" && d.side === -1)
          .map((d) => d.row),
      )
    : 0;

  const hasRightDims =
    dimLevel !== "off" &&
    drawing.linearDims.some((d) => d.orientation === "vertical" && d.side === 1);
  const maxRightRow = hasRightDims
    ? Math.max(
        1,
        ...drawing.linearDims
          .filter((d) => d.orientation === "vertical" && d.side === 1)
          .map((d) => d.row),
      )
    : 0;

  const hasTopCallouts = dimLevel !== "off" && drawing.leaders.length > 0;

  const padLeftPx = Math.min(64, Math.max(32, safeW * 0.1));
  const padRightPx = Math.min(
    110,
    Math.max(36, 28 + maxRightRow * 26 + (hasTopCallouts ? 24 : 0)),
  );
  const padTopPx = Math.min(76, Math.max(34, hasTopCallouts ? 54 : 34));
  const padBottomPx = Math.min(96, Math.max(38, 30 + maxBottomRow * 24));

  const availW = Math.max(60, safeW - padLeftPx - padRightPx);
  const availH = Math.max(50, safeH - padTopPx - padBottomPx);

  const modelW = Math.max(10, drawing.modelBounds.maxX - drawing.modelBounds.minX);
  const modelH = Math.max(10, drawing.modelBounds.maxY - drawing.modelBounds.minY);

  const scalePxPerMm = Math.max(0.05, Math.min(availW / modelW, availH / modelH));

  const modelCenterX = (drawing.modelBounds.minX + drawing.modelBounds.maxX) / 2;
  const modelCenterY = (drawing.modelBounds.minY + drawing.modelBounds.maxY) / 2;

  const viewportCenterX = padLeftPx + availW / 2;
  const viewportCenterY = padTopPx + availH / 2;

  return {
    widthPx: safeW,
    heightPx: safeH,
    scalePxPerMm,
    originScreenX: viewportCenterX - modelCenterX * scalePxPerMm,
    originScreenY: viewportCenterY + modelCenterY * scalePxPerMm,
    dimLevel,
  };
}

/**
 * Gera polígono de seta fechada e preenchida (~9,5 px de comprimento, proporção ~1:3, ponta afiada — §5.4).
 */
function buildFilledArrowPolygonPx(
  tipX: number,
  tipY: number,
  dirX: number,
  dirY: number,
  lengthPx = 9.5,
  halfWidthPx = 1.75,
): string {
  // Vetor unitário apontando para a ponta (tipX, tipY)
  const len = Math.hypot(dirX, dirY) || 1;
  const ux = dirX / len;
  const uy = dirY / len;
  const bx = tipX - ux * lengthPx;
  const by = tipY - uy * lengthPx;
  const px = -uy * halfWidthPx;
  const py = ux * halfWidthPx;

  return `${tipX.toFixed(2)},${tipY.toFixed(2)} ${(bx + px).toFixed(2)},${(by + py).toFixed(2)} ${(bx - px).toFixed(2)},${(by - py).toFixed(2)}`;
}

/**
 * Verifica se duas caixas delimitadoras (bounding boxes) se sobrepõem.
 */
export function boxesOverlap(a: ScreenLabelBox, b: ScreenLabelBox, paddingPx = 3): boolean {
  return !(
    a.maxX + paddingPx < b.minX ||
    a.minX - paddingPx > b.maxX ||
    a.maxY + paddingPx < b.minY ||
    a.minY - paddingPx > b.maxY
  );
}

function makeLabelBox(
  id: string,
  text: string,
  cx: number,
  cy: number,
  paramKey: string,
): ScreenLabelBox {
  const width = Math.max(22, text.length * 6.8 + 8);
  const height = 15;
  return {
    id,
    text,
    cx,
    cy,
    width,
    height,
    minX: cx - width / 2,
    minY: cy - height / 2,
    maxX: cx + width / 2,
    maxY: cy + height / 2,
    paramKey,
  };
}

/**
 * Escolhe passo 1-2-5 adaptativo para que o passo menor fique entre 10 e 28 px na tela (§5.3).
 */
function computeAdaptiveGrid125(scalePxPerMm: number): {
  minorStepMm: number;
  minorStepPx: number;
  majorStepPx: number;
} {
  const bases = [1, 2, 5];
  const exponents = [-1, 0, 1, 2, 3, 4];
  let bestMm = 10;
  for (const exp of exponents) {
    const mult = Math.pow(10, exp);
    for (const b of bases) {
      const candidateMm = b * mult;
      const px = candidateMm * scalePxPerMm;
      if (px >= 12 && px <= 28) {
        return {
          minorStepMm: candidateMm,
          minorStepPx: px,
          majorStepPx: px * 5,
        };
      }
      if (px >= 10) {
        bestMm = candidateMm;
      }
    }
  }
  const minorStepPx = Math.max(12, Math.min(32, bestMm * scalePxPerMm));
  return {
    minorStepMm: bestMm,
    minorStepPx,
    majorStepPx: minorStepPx * 5,
  };
}

/**
 * Escolhe valor redondo em `mm` para a barra de escala no canto inferior direito (§5.1).
 */
function computeRoundScaleBar(scalePxPerMm: number): {
  mmValue: number;
  widthPx: number;
  label: string;
} {
  const candidates = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  let chosen = 50;
  for (const c of candidates) {
    const px = c * scalePxPerMm;
    if (px >= 42 && px <= 110) {
      chosen = c;
      break;
    }
    if (px < 42) {
      chosen = c;
    }
  }
  return {
    mmValue: chosen,
    widthPx: Math.max(32, Math.min(120, chosen * scalePxPerMm)),
    label: `${chosen} mm`,
  };
}

/**
 * ESTÁGIO 2 (PURO): Projeta `CadDrawingMm` (em `mm`, CAD Y-up) para coordenadas de tela (`px`, SVG Y-down)
 * aplicando regras ISO 128 / ISO 129, `fillRule="evenodd"` para furos vazados e anticolisão de cotas (§5.2–§5.4).
 */
export function projectToScreen(
  drawing: CadDrawingMm,
  view: ScreenViewTransform,
  theme?: Pick<IntentThemeTokens, "cadCanvas">,
  activeLayerName = "CORTE",
): ProjectedDrawingPx {
  const s = view.scalePxPerMm;
  const ox = view.originScreenX;
  const oy = view.originScreenY;

  // Conversores mm (CAD Y-up) -> px (Tela Y-down)
  const toScreenX = (xMm: number) => ox + xMm * s;
  const toScreenY = (yMm: number) => oy - yMm * s;

  // 1. Contorno externo + furos num único path com fill-rule="evenodd" (§5.2)
  const subPaths: string[] = [];

  if (drawing.plate) {
    const { W, H, R, corners } = drawing.plate;
    const halfW = W / 2;
    const halfH = H / 2;
    const rPx = R * s;

    const rTL = corners.tl ? rPx : 0;
    const rTR = corners.tr ? rPx : 0;
    const rBR = corners.br ? rPx : 0;
    const rBL = corners.bl ? rPx : 0;

    const leftX = toScreenX(-halfW);
    const rightX = toScreenX(halfW);
    const topY = toScreenY(halfH);
    const bottomY = toScreenY(-halfH);

    // Sentido horário na tela (topo -> direita -> base -> esquerda)
    const parts: string[] = [`M ${(leftX + rTL).toFixed(2)} ${topY.toFixed(2)}`];
    parts.push(`L ${(rightX - rTR).toFixed(2)} ${topY.toFixed(2)}`);
    if (rTR > 0) {
      parts.push(
        `A ${rTR.toFixed(2)} ${rTR.toFixed(2)} 0 0 1 ${rightX.toFixed(2)} ${(topY + rTR).toFixed(2)}`,
      );
    }
    parts.push(`L ${rightX.toFixed(2)} ${(bottomY - rBR).toFixed(2)}`);
    if (rBR > 0) {
      parts.push(
        `A ${rBR.toFixed(2)} ${rBR.toFixed(2)} 0 0 1 ${(rightX - rBR).toFixed(2)} ${bottomY.toFixed(2)}`,
      );
    }
    parts.push(`L ${(leftX + rBL).toFixed(2)} ${bottomY.toFixed(2)}`);
    if (rBL > 0) {
      parts.push(
        `A ${rBL.toFixed(2)} ${rBL.toFixed(2)} 0 0 1 ${leftX.toFixed(2)} ${(bottomY - rBL).toFixed(2)}`,
      );
    }
    parts.push(`L ${leftX.toFixed(2)} ${(topY + rTL).toFixed(2)}`);
    if (rTL > 0) {
      parts.push(
        `A ${rTL.toFixed(2)} ${rTL.toFixed(2)} 0 0 1 ${(leftX + rTL).toFixed(2)} ${topY.toFixed(2)}`,
      );
    }
    parts.push("Z");
    subPaths.push(parts.join(" "));
  } else if (drawing.flange) {
    const { outerR, innerR } = drawing.flange;
    const cx = toScreenX(0);
    const cy = toScreenY(0);
    const rOutPx = outerR * s;
    subPaths.push(
      `M ${(cx - rOutPx).toFixed(2)} ${cy.toFixed(2)} A ${rOutPx.toFixed(2)} ${rOutPx.toFixed(2)} 0 1 0 ${(cx + rOutPx).toFixed(2)} ${cy.toFixed(2)} A ${rOutPx.toFixed(2)} ${rOutPx.toFixed(2)} 0 1 0 ${(cx - rOutPx).toFixed(2)} ${cy.toFixed(2)} Z`,
    );
    if (innerR > 0) {
      const rInPx = innerR * s;
      subPaths.push(
        `M ${(cx - rInPx).toFixed(2)} ${cy.toFixed(2)} A ${rInPx.toFixed(2)} ${rInPx.toFixed(2)} 0 1 0 ${(cx + rInPx).toFixed(2)} ${cy.toFixed(2)} A ${rInPx.toFixed(2)} ${rInPx.toFixed(2)} 0 1 0 ${(cx - rInPx).toFixed(2)} ${cy.toFixed(2)} Z`,
      );
    }
  }

  // Rasgo oblongo interno (T4) no mesmo path evenodd
  if (drawing.slot) {
    const { length, width, cx, cy } = drawing.slot;
    const slotR = width / 2;
    const straightHalf = Math.max(0, length / 2 - slotR);
    const rPx = slotR * s;
    const xL = toScreenX(cx - straightHalf);
    const xR = toScreenX(cx + straightHalf);
    const yT = toScreenY(cy + slotR);
    const yB = toScreenY(cy - slotR);
    subPaths.push(
      `M ${xL.toFixed(2)} ${yT.toFixed(2)} L ${xR.toFixed(2)} ${yT.toFixed(2)} A ${rPx.toFixed(2)} ${rPx.toFixed(2)} 0 0 1 ${xR.toFixed(2)} ${yB.toFixed(2)} L ${xL.toFixed(2)} ${yB.toFixed(2)} A ${rPx.toFixed(2)} ${rPx.toFixed(2)} 0 0 1 ${xL.toFixed(2)} ${yT.toFixed(2)} Z`,
    );
  }

  // Furos e cruzes de centro (§5.3: "Marca de centro de cada furo: cruz fina cujos braços passam ~4–5 px do círculo; em furos < 16 px na tela, só a cruz.")
  const holeCenterCrossesPx = drawing.holes.map((h) => {
    const cxPx = toScreenX(h.cx);
    const cyPx = toScreenY(h.cy);
    const rPx = h.r * s;
    const diamPx = rPx * 2;
    const renderCircleInCutPath = diamPx >= 4;
    if (renderCircleInCutPath) {
      subPaths.push(
        `M ${(cxPx - rPx).toFixed(2)} ${cyPx.toFixed(2)} A ${rPx.toFixed(2)} ${rPx.toFixed(2)} 0 1 0 ${(cxPx + rPx).toFixed(2)} ${cyPx.toFixed(2)} A ${rPx.toFixed(2)} ${rPx.toFixed(2)} 0 1 0 ${(cxPx - rPx).toFixed(2)} ${cyPx.toFixed(2)} Z`,
      );
    }
    const armHalfPx = diamPx < 16 ? Math.max(5, rPx + 4) : rPx + 4.5;
    return {
      id: h.id,
      cx: cxPx,
      cy: cyPx,
      armHalfPx,
      renderCircleInCutPath,
      rPx,
      paramKey: h.paramKey,
    };
  });

  // 2. Linhas de centro projetadas em px
  const centerlinesPx = drawing.centerlines.map((cl) => {
    if (cl.kind === "circle") {
      return {
        id: cl.id,
        kind: "circle" as const,
        cx: toScreenX(cl.cx ?? 0),
        cy: toScreenY(cl.cy ?? 0),
        r: (cl.r ?? 0) * s,
      };
    }
    return {
      id: cl.id,
      kind: "line" as const,
      x1: toScreenX(cl.x1 ?? 0),
      y1: toScreenY(cl.y1 ?? 0),
      x2: toScreenX(cl.x2 ?? 0),
      y2: toScreenY(cl.y2 ?? 0),
    };
  });

  // 3. Cotas e chamadas com anticolisão por caixas delimitadoras (§5.4)
  const placedBoxes: ScreenLabelBox[] = [];
  const dimensionsPx: ProjectedDimensionPx[] = [];
  const leadersPx: ProjectedLeaderPx[] = [];

  const totalAvailableDims =
    drawing.linearDims.filter((d) => d.priority === "secondary").length +
    drawing.leaders.filter((l) => l.priority === "secondary").length;

  const hiddenDimensionCount =
    view.dimLevel === "main"
      ? totalAvailableDims
      : view.dimLevel === "off"
        ? drawing.linearDims.length + drawing.leaders.length
        : 0;

  if (view.dimLevel !== "off") {
    const activeLinearDims = drawing.linearDims.filter(
      (d) => view.dimLevel === "all" || d.priority === "main",
    );

    const modelLeftPx = toScreenX(drawing.modelBounds.minX);
    const modelRightPx = toScreenX(drawing.modelBounds.maxX);
    const modelTopPx = toScreenY(drawing.modelBounds.maxY);
    const modelBottomPx = toScreenY(drawing.modelBounds.minY);

    for (const dim of activeLinearDims) {
      const p1x = toScreenX(dim.x1);
      const p1y = toScreenY(dim.y1);
      const p2x = toScreenX(dim.x2);
      const p2y = toScreenY(dim.y2);

      // Primeira fileira a ~26 px do contorno, as demais a +20 px (§5.4)
      const baseOffsetPx = 26 + (dim.row - 1) * 20;

      if (dim.orientation === "horizontal") {
        // side === -1 significa abaixo da peça (em Y de tela: maior que modelBottomPx)
        const isBottom = dim.side === -1;
        let dimY = isBottom ? modelBottomPx + baseOffsetPx : modelTopPx - baseOffsetPx;

        const leftX = Math.min(p1x, p2x);
        const rightX = Math.max(p1x, p2x);
        const spanPx = rightX - leftX;
        let labelCx = (leftX + rightX) / 2;
        let labelCy = dimY;

        let candidateBox = makeLabelBox(dim.id, dim.text, labelCx, labelCy, dim.paramKey);

        // Anticolisão: se colidir com caixa já posicionada, desloca ou move para fileira seguinte
        let attempts = 0;
        while (
          placedBoxes.some((b) => boxesOverlap(candidateBox, b, 3)) &&
          attempts < 6
        ) {
          attempts++;
          if (attempts === 1 && spanPx < candidateBox.width + 14) {
            // Cota curta de margem: desloca ligeiramente para fora
            const shift =
              dim.id.includes("left")
                ? -(candidateBox.width * 0.55)
                : dim.id.includes("right")
                  ? candidateBox.width * 0.55
                  : 0;
            if (shift !== 0) {
              labelCx = (leftX + rightX) / 2 + shift;
              candidateBox = makeLabelBox(dim.id, dim.text, labelCx, labelCy, dim.paramKey);
              continue;
            }
          }
          dimY += isBottom ? 18 : -18;
          labelCy = dimY;
          candidateBox = makeLabelBox(dim.id, dim.text, labelCx, labelCy, dim.paramKey);
        }

        placedBoxes.push(candidateBox);

        const extDir = isBottom ? 1 : -1;
        const ext1StartY = p1y + extDir * 3;
        const ext2StartY = p2y + extDir * 3;
        const extEndY = dimY + extDir * 4;

        // Se o vão entre extensões for estreito (< 28px), setas ficam por fora apontando para dentro (§5.4)
        const arrowsInside = spanPx >= 28;
        const arrow1Points = arrowsInside
          ? buildFilledArrowPolygonPx(leftX, dimY, -1, 0)
          : buildFilledArrowPolygonPx(leftX, dimY, 1, 0);
        const arrow2Points = arrowsInside
          ? buildFilledArrowPolygonPx(rightX, dimY, 1, 0)
          : buildFilledArrowPolygonPx(rightX, dimY, -1, 0);

        dimensionsPx.push({
          id: dim.id,
          paramKey: dim.paramKey,
          extLine1: { x1: leftX, y1: ext1StartY, x2: leftX, y2: extEndY },
          extLine2: { x1: rightX, y1: ext2StartY, x2: rightX, y2: extEndY },
          dimLine: {
            x1: arrowsInside ? leftX : leftX - 14,
            y1: dimY,
            x2: arrowsInside ? rightX : rightX + 14,
            y2: dimY,
          },
          arrow1Points,
          arrow2Points,
          labelBox: candidateBox,
        });
      } else {
        // Cota vertical (à direita quando side === 1, à esquerda quando side === -1)
        const isRight = dim.side === 1;
        let dimX = isRight ? modelRightPx + baseOffsetPx : modelLeftPx - baseOffsetPx;

        const topY = Math.min(p1y, p2y);
        const bottomY = Math.max(p1y, p2y);
        const spanPx = bottomY - topY;
        let labelCx = dimX;
        let labelCy = (topY + bottomY) / 2;

        let candidateBox = makeLabelBox(dim.id, dim.text, labelCx, labelCy, dim.paramKey);

        let attempts = 0;
        while (
          placedBoxes.some((b) => boxesOverlap(candidateBox, b, 3)) &&
          attempts < 6
        ) {
          attempts++;
          if (attempts === 1 && spanPx < candidateBox.height + 16) {
            const shiftY = dim.id.includes("top")
              ? -14
              : dim.id.includes("bottom")
                ? 14
                : 0;
            if (shiftY !== 0) {
              labelCy = (topY + bottomY) / 2 + shiftY;
              candidateBox = makeLabelBox(dim.id, dim.text, labelCx, labelCy, dim.paramKey);
              continue;
            }
          }
          dimX += isRight ? 26 : -26;
          labelCx = dimX;
          candidateBox = makeLabelBox(dim.id, dim.text, labelCx, labelCy, dim.paramKey);
        }

        placedBoxes.push(candidateBox);

        const extDir = isRight ? 1 : -1;
        const ext1StartX = p1x + extDir * 3;
        const ext2StartX = p2x + extDir * 3;
        const extEndX = dimX + extDir * 4;

        const arrowsInside = spanPx >= 28;
        const arrow1Points = arrowsInside
          ? buildFilledArrowPolygonPx(dimX, topY, 0, -1)
          : buildFilledArrowPolygonPx(dimX, topY, 0, 1);
        const arrow2Points = arrowsInside
          ? buildFilledArrowPolygonPx(dimX, bottomY, 0, 1)
          : buildFilledArrowPolygonPx(dimX, bottomY, 0, -1);

        dimensionsPx.push({
          id: dim.id,
          paramKey: dim.paramKey,
          extLine1: { x1: ext1StartX, y1: topY, x2: extEndX, y2: topY },
          extLine2: { x1: ext2StartX, y1: bottomY, x2: extEndX, y2: bottomY },
          dimLine: {
            x1: dimX,
            y1: arrowsInside ? topY : topY - 14,
            x2: dimX,
            y2: arrowsInside ? bottomY : bottomY + 14,
          },
          arrow1Points,
          arrow2Points,
          labelBox: candidateBox,
        });
      }
    }

    // Chamadas (Leaders: "5× Ø12" e "R20" a 45°)
    const activeLeaders = drawing.leaders.filter(
      (l) => view.dimLevel === "all" || l.priority === "main",
    );

    for (const leader of activeLeaders) {
      const ax = toScreenX(leader.anchorX);
      const ay = toScreenY(leader.anchorY);
      // Em tela (Y-down), invertemos dirY
      const sDirX = leader.dirX;
      const sDirY = -leader.dirY;
      const radialLenPx = 22;
      const shelfLenPx = 14;
      const horizSign = sDirX >= 0 ? 1 : -1;

      let kneeX = ax + sDirX * radialLenPx;
      let kneeY = ay + sDirY * radialLenPx;
      let endX = kneeX + horizSign * shelfLenPx;
      let endY = kneeY;

      const textWidth = Math.max(24, leader.text.length * 6.8 + 8);
      let labelCx = endX + horizSign * (textWidth / 2 + 4);
      let labelCy = endY;

      let candidateBox = makeLabelBox(
        leader.id,
        leader.text,
        labelCx,
        labelCy,
        leader.paramKey,
      );

      let attempts = 0;
      while (placedBoxes.some((b) => boxesOverlap(candidateBox, b, 3)) && attempts < 6) {
        attempts++;
        kneeY += sDirY >= 0 ? 16 : -16;
        endY = kneeY;
        labelCy = endY;
        candidateBox = makeLabelBox(
          leader.id,
          leader.text,
          labelCx,
          labelCy,
          leader.paramKey,
        );
      }

      placedBoxes.push(candidateBox);

      // A seta na chamada aponta de (kneeX, kneeY) para o ponto de ancoragem (ax, ay)
      const arrowPoints = buildFilledArrowPolygonPx(ax, ay, ax - kneeX, ay - kneeY);

      leadersPx.push({
        id: leader.id,
        paramKey: leader.paramKey,
        polylinePoints: `${ax.toFixed(2)},${ay.toFixed(2)} ${kneeX.toFixed(2)},${kneeY.toFixed(2)} ${endX.toFixed(2)},${endY.toFixed(2)}`,
        arrowPoints,
        labelBox: candidateBox,
      });
    }
  }

  // 4. Grade 1-2-5 adaptativa (máx. ~60 linhas por eixo, alinhadas a meio pixel — §5.2 & §5.3)
  const { minorStepMm, minorStepPx, majorStepPx } = computeAdaptiveGrid125(s);
  const verticalLines: Array<{ x: number; isMajor: boolean }> = [];
  const horizontalLines: Array<{ y: number; isMajor: boolean }> = [];

  const startXIdx = Math.ceil(-ox / minorStepPx);
  const endXIdx = Math.floor((view.widthPx - ox) / minorStepPx);
  const maxLines = 60;
  const stepXStride = Math.max(1, Math.ceil((endXIdx - startXIdx + 1) / maxLines));

  for (let i = startXIdx; i <= endXIdx; i += stepXStride) {
    const xRaw = ox + i * minorStepPx;
    const xAligned = Math.round(xRaw) + 0.5;
    verticalLines.push({
      x: xAligned,
      isMajor: i % 5 === 0,
    });
  }

  const startYIdx = Math.ceil(-oy / minorStepPx);
  const endYIdx = Math.floor((view.heightPx - oy) / minorStepPx);
  const stepYStride = Math.max(1, Math.ceil((endYIdx - startYIdx + 1) / maxLines));

  for (let j = startYIdx; j <= endYIdx; j += stepYStride) {
    const yRaw = oy + j * minorStepPx;
    const yAligned = Math.round(yRaw) + 0.5;
    horizontalLines.push({
      y: yAligned,
      isMajor: j % 5 === 0,
    });
  }

  // 5. Cor de exibição da camada técnica garantindo contraste ≥ 3:1 sobre o canvas (§4)
  const rawLayerHex = getTechnicalLayerColor(activeLayerName);
  const canvasBgHex = theme?.cadCanvas ?? "var(--cad-canvas)";
  const cutDisplayColor = canvasBgHex.startsWith("#")
    ? displayColor(rawLayerHex, canvasBgHex, 3.0)
    : rawLayerHex;

  return {
    compoundCutPathD: subPaths.join(" "),
    centerlinesPx,
    holeCenterCrossesPx,
    dimensionsPx,
    leadersPx,
    allLabelBoxes: placedBoxes,
    hiddenDimensionCount,
    grid: {
      minorStepPx,
      majorStepPx,
      minorStepMm,
      verticalLines,
      horizontalLines,
    },
    scaleBar: computeRoundScaleBar(s),
    cutDisplayColor,
  };
}

// ============================================================================
// COMPONENTE REACT: `ChamferLiveMiniViewport`
// ============================================================================

export function ChamferLiveMiniViewport({
  width,
  height,
  cornerRadius,
  cornerSelector,
  holeCount,
  holeDiameter,
  margin,
  holeDistribution = "linear_centerline_x",
  pcd,
  isPlateMode,
  fallbackEntities,
  isMinimizedToSheet,
  onToggleMinimizeToSheet,
  onPeekCanvasStart,
  onPeekCanvasEnd,
  isProvisional = false,
  isCompiling = false,
  activeLayerName = "CORTE",
  focusedParamKey = null,
  onSelectEntityParam,
  isFullscreenPreview = false,
  onToggleFullscreenPreview,
  decimalSeparator = ",",
}: ChamferLiveMiniViewportProps) {
  const { tokens } = useIntentTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  // Controles de visualização da barra da prévia (§5.1)
  const [dimLevel, setDimLevel] = useState<DimensionVisibilityLevel>("main");
  const [showAxes, setShowAxes] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showUnitInDims, setShowUnitInDims] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [showTelemetry, setShowTelemetry] = useState(true);
  const [selectedParamKey, setSelectedParamKey] = useState<string | null>(null);

  // Dimensões medidas do canvas em px
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 560, h: 280 });

  // Estado de pan/zoom manual (§5.6: preserva vista após zoom/pan manual até tocar em "Ajustar")
  const [userTransform, setUserTransform] = useState<{
    hasManualView: boolean;
    scaleMultiplier: number;
    panOffsetX: number;
    panOffsetY: number;
  }>({
    hasManualView: false,
    scaleMultiplier: 1,
    panOffsetX: 0,
    panOffsetY: 0,
  });

  // Mira interativa e snap a pontos notáveis (□, △, ○, ✕)
  const [cursorMm, setCursorMm] = useState<{
    x: number;
    y: number;
    snap?: CadSnapPointMm;
    showCrosshair: boolean;
  } | null>(null);

  const dragStateRef = useRef<{
    isDragging: boolean;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    longPressTimer: number | null;
    pinchInitialDist: number | null;
    pinchInitialMult: number;
  }>({
    isDragging: false,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
    longPressTimer: null,
    pinchInitialDist: null,
    pinchInitialMult: 1,
  });

  // Mede o container SVG com ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let rafId: number | null = null;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(180, Math.round(entry.contentRect.width));
      const h = Math.max(130, Math.round(entry.contentRect.height));
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setCanvasSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
      });
    });
    ro.observe(el);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  // Constrói o modelo técnico em mm (Estágio 1)
  const rawDrawing = useMemo(() => {
    return buildDrawing({
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
      fallbackEntities,
      decimalSeparator,
      showUnitInDims,
    });
  }, [
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
    fallbackEntities,
    decimalSeparator,
    showUnitInDims,
  ]);

  // §5.5 & §8: Preserva a última prévia válida quando uma nova compilação falha
  const lastValidDrawingRef = useRef<CadDrawingMm | null>(null);
  useEffect(() => {
    if (rawDrawing.isValid) {
      lastValidDrawingRef.current = rawDrawing;
    }
  }, [rawDrawing]);

  const showingPreviousValidPreview =
    !rawDrawing.isValid && lastValidDrawingRef.current !== null;
  const activeDrawing = showingPreviousValidPreview
    ? lastValidDrawingRef.current!
    : rawDrawing;

  // Calcula vista enquadrada + aplica pan/zoom manual se houver
  const screenView = useMemo<ScreenViewTransform>(() => {
    const auto = computeAutoFitView(activeDrawing, canvasSize.w, canvasSize.h, dimLevel);
    if (!userTransform.hasManualView) {
      return auto;
    }
    return {
      ...auto,
      scalePxPerMm: Math.max(0.05, Math.min(25, auto.scalePxPerMm * userTransform.scaleMultiplier)),
      originScreenX: auto.originScreenX + userTransform.panOffsetX,
      originScreenY: auto.originScreenY + userTransform.panOffsetY,
    };
  }, [activeDrawing, canvasSize.w, canvasSize.h, dimLevel, userTransform]);

  // Projeta para coordenadas de tela em px (Estágio 2)
  const projected = useMemo(() => {
    return projectToScreen(activeDrawing, screenView, tokens, activeLayerName);
  }, [activeDrawing, screenView, tokens, activeLayerName]);

  const handleResetFit = useCallback(() => {
    setUserTransform({
      hasManualView: false,
      scaleMultiplier: 1,
      panOffsetX: 0,
      panOffsetY: 0,
    });
  }, []);

  const cycleDimensionLevel = () => {
    setDimLevel((prev) => (prev === "main" ? "all" : prev === "all" ? "off" : "main"));
  };

  const activeHighlightKey = focusedParamKey ?? selectedParamKey;

  const handleSelectEntity = (paramKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedParamKey(paramKey);
    onSelectEntityParam?.(paramKey);
  };

  // Conversão de ponto de tela (evento no SVG) para mm (CAD Y-up) e detecção de snap
  const updateCursorFromClientPoint = (clientX: number, clientY: number, showCrosshair: boolean) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const xMm = (sx - screenView.originScreenX) / screenView.scalePxPerMm;
    const yMm = (screenView.originScreenY - sy) / screenView.scalePxPerMm;

    // Snap dentro de 12 px na tela
    const snapRadiusMm = 12 / screenView.scalePxPerMm;
    let closestSnap: CadSnapPointMm | undefined;
    let minDist = snapRadiusMm;
    for (const sp of activeDrawing.snapPoints) {
      const d = Math.hypot(sp.x - xMm, sp.y - yMm);
      if (d <= minDist) {
        minDist = d;
        closestSnap = sp;
      }
    }

    setCursorMm({
      x: closestSnap ? closestSnap.x : xMm,
      y: closestSnap ? closestSnap.y : yMm,
      snap: closestSnap,
      showCrosshair,
    });
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    setUserTransform((prev) => ({
      ...prev,
      hasManualView: true,
      scaleMultiplier: Math.max(0.25, Math.min(8, prev.scaleMultiplier * factor)),
    }));
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    dragStateRef.current.isDragging = true;
    dragStateRef.current.startX = e.clientX;
    dragStateRef.current.startY = e.clientY;
    dragStateRef.current.startPanX = userTransform.panOffsetX;
    dragStateRef.current.startPanY = userTransform.panOffsetY;

    if (dragStateRef.current.longPressTimer) {
      window.clearTimeout(dragStateRef.current.longPressTimer);
    }
    dragStateRef.current.longPressTimer = window.setTimeout(() => {
      updateCursorFromClientPoint(e.clientX, e.clientY, true);
    }, 320);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const dx = e.clientX - dragStateRef.current.startX;
    const dy = e.clientY - dragStateRef.current.startY;

    if (dragStateRef.current.isDragging && Math.hypot(dx, dy) > 4) {
      if (dragStateRef.current.longPressTimer) {
        window.clearTimeout(dragStateRef.current.longPressTimer);
        dragStateRef.current.longPressTimer = null;
      }
      setUserTransform((prev) => ({
        ...prev,
        hasManualView: true,
        panOffsetX: dragStateRef.current.startPanX + dx,
        panOffsetY: dragStateRef.current.startPanY + dy,
      }));
    }

    updateCursorFromClientPoint(e.clientX, e.clientY, Boolean(cursorMm?.showCrosshair));
  };

  const handlePointerUpOrLeave = () => {
    dragStateRef.current.isDragging = false;
    if (dragStateRef.current.longPressTimer) {
      window.clearTimeout(dragStateRef.current.longPressTimer);
      dragStateRef.current.longPressTimer = null;
    }
  };

  const handleTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      dragStateRef.current.pinchInitialDist = Math.hypot(
        t2.clientX - t1.clientX,
        t2.clientY - t1.clientY,
      );
      dragStateRef.current.pinchInitialMult = userTransform.scaleMultiplier;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 2 && dragStateRef.current.pinchInitialDist) {
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const ratio = dist / Math.max(10, dragStateRef.current.pinchInitialDist);
      setUserTransform((prev) => ({
        ...prev,
        hasManualView: true,
        scaleMultiplier: Math.max(
          0.25,
          Math.min(8, dragStateRef.current.pinchInitialMult * ratio),
        ),
      }));
    }
  };

  const handleTouchEnd = () => {
    dragStateRef.current.pinchInitialDist = null;
  };

  const zoomPercentage = Math.round(userTransform.scaleMultiplier * 100);

  return (
    <div
      className="flex flex-col w-full h-full overflow-hidden rounded-lg border select-none"
      style={{
        backgroundColor: "var(--ci-surface)",
        borderColor: !rawDrawing.isValid ? "var(--ci-danger)" : "var(--ci-border)",
      }}
    >
      {/* =================================================================== */}
      {/* 5.1 BARRA DE CONTROLES PRÓPRIA ACIMA DA ÁREA GRÁFICA (FORA DO CANVAS) */}
      {/* =================================================================== */}
      <div
        className="flex items-center justify-between gap-2 px-2.5 py-1 border-b shrink-0 overflow-x-auto no-scrollbar"
        style={{
          backgroundColor: "var(--ci-surface)",
          borderColor: "var(--ci-border)",
        }}
      >
        {/* Esquerda: Rótulo de viewport CAD + indicador AO VIVO / PROVISÓRIO (nowrap, shrink-0) */}
        <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
          <span
            className="font-mono text-[10px] font-semibold tracking-wider uppercase"
            style={{ color: "var(--ci-text-muted)" }}
          >
            [−] [PLANTA] [WIREFRAME 2D]
          </span>

          <span
            className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase border shrink-0 whitespace-nowrap"
            style={{
              backgroundColor: "var(--ci-surface-2)",
              borderColor: !rawDrawing.isValid
                ? "var(--ci-danger)"
                : isProvisional
                  ? "var(--ci-warning)"
                  : "var(--ci-border)",
              color: !rawDrawing.isValid
                ? "var(--ci-danger)"
                : isProvisional
                  ? "var(--ci-warning)"
                  : "var(--ci-success)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: !rawDrawing.isValid
                  ? "var(--ci-danger)"
                  : isProvisional
                    ? "var(--ci-warning)"
                    : "var(--ci-success)",
              }}
            />
            {!rawDrawing.isValid
              ? "INVÁLIDO"
              : isProvisional
                ? "PROVISÓRIO"
                : isCompiling
                  ? "COMPILANDO"
                  : "AO VIVO"}
          </span>
        </div>

        {/* Direita: Botões de controle com alvo de toque ≥ 44 px, aria-label e aria-pressed */}
        <div className="flex items-center gap-1 shrink-0">
          {/* COTAS (3 níveis: Desligadas / Principais / Todas) */}
          <button
            type="button"
            onClick={cycleDimensionLevel}
            aria-label={`Alternar nível de cotas (atual: ${
              dimLevel === "main" ? "Principais" : dimLevel === "all" ? "Todas" : "Desligadas"
            })`}
            aria-pressed={dimLevel !== "off"}
            title="Alternar Cotas: Principais → Todas → Desligadas"
            className="min-h-[44px] px-2 rounded border font-mono text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer shrink-0"
            style={{
              backgroundColor: dimLevel !== "off" ? "var(--ci-surface-2)" : "transparent",
              borderColor: dimLevel !== "off" ? "var(--ci-accent)" : "var(--ci-border)",
              color: dimLevel !== "off" ? "var(--ci-text)" : "var(--ci-text-muted)",
            }}
          >
            <Ruler className="w-3.5 h-3.5" />
            <span>
              COTAS:{" "}
              {dimLevel === "main" ? "PRINC." : dimLevel === "all" ? "TODAS" : "OFF"}
            </span>
          </button>

          {/* Contador tocável "N cotas ocultas" no nível Principais (§5.4) */}
          {dimLevel === "main" && projected.hiddenDimensionCount > 0 && (
            <button
              type="button"
              onClick={() => setDimLevel("all")}
              aria-label={`Mostrar ${projected.hiddenDimensionCount} cotas ocultas`}
              title="Toque para exibir todas as cotas secundárias"
              className="min-h-[44px] px-2 rounded border font-mono text-[10px] transition-colors cursor-pointer shrink-0"
              style={{
                backgroundColor: "var(--ci-surface-2)",
                borderColor: "var(--ci-border)",
                color: "var(--cad-dim)",
              }}
            >
              +{projected.hiddenDimensionCount} cotas ocultas
            </button>
          )}

          {/* EIXOS */}
          <button
            type="button"
            onClick={() => setShowAxes((v) => !v)}
            aria-label="Alternar eixos de origem e simetria"
            aria-pressed={showAxes}
            title="Mostrar/ocultar Eixos X/Y e linhas de centro"
            className="min-h-[44px] min-w-[44px] px-2 rounded border font-mono text-[10px] flex items-center justify-center gap-1 transition-colors cursor-pointer shrink-0"
            style={{
              backgroundColor: showAxes ? "var(--ci-surface-2)" : "transparent",
              borderColor: showAxes ? "var(--ci-accent)" : "var(--ci-border)",
              color: showAxes ? "var(--ci-text)" : "var(--ci-text-muted)",
            }}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">EIXOS</span>
          </button>

          {/* GRADE */}
          <button
            type="button"
            onClick={() => setShowGrid((v) => !v)}
            aria-label="Alternar grade técnica adaptativa"
            aria-pressed={showGrid}
            title="Mostrar/ocultar Grade 1-2-5 adaptativa"
            className="min-h-[44px] min-w-[44px] px-2 rounded border font-mono text-[10px] flex items-center justify-center gap-1 transition-colors cursor-pointer shrink-0"
            style={{
              backgroundColor: showGrid ? "var(--ci-surface-2)" : "transparent",
              borderColor: showGrid ? "var(--ci-accent)" : "var(--ci-border)",
              color: showGrid ? "var(--ci-text)" : "var(--ci-text-muted)",
            }}
          >
            <Grid className="w-3.5 h-3.5" />
            <span className="hidden md:inline">GRADE</span>
          </button>

          {/* CANVAS (Inspecionar/minimizar sobre o canvas principal, preservado §0) */}
          <button
            type="button"
            onClick={onToggleMinimizeToSheet}
            onPointerDown={() => onPeekCanvasStart?.()}
            onPointerUp={() => onPeekCanvasEnd?.()}
            onPointerLeave={() => onPeekCanvasEnd?.()}
            aria-label="Inspecionar peça no canvas principal do CHAMFER"
            aria-pressed={isMinimizedToSheet}
            title="Segure para espiar ou clique para alternar visualização no Canvas Principal"
            className="min-h-[44px] min-w-[44px] px-2 rounded border font-mono text-[10px] flex items-center justify-center gap-1 transition-colors cursor-pointer shrink-0"
            style={{
              backgroundColor: isMinimizedToSheet ? "var(--ci-surface-2)" : "transparent",
              borderColor: isMinimizedToSheet ? "var(--ci-accent)" : "var(--ci-border)",
              color: isMinimizedToSheet ? "var(--ci-text)" : "var(--ci-text-muted)",
            }}
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">CANVAS</span>
          </button>

          {/* AJUSTAR (Re-enquadra a peça e anotações) */}
          <button
            type="button"
            onClick={handleResetFit}
            aria-label="Ajustar desenho e cotas à vista"
            title="Ajustar enquadramento (Fit All)"
            className="min-h-[44px] min-w-[44px] px-2 rounded border font-mono text-[10px] flex items-center justify-center gap-1 transition-colors cursor-pointer shrink-0"
            style={{
              backgroundColor: userTransform.hasManualView
                ? "var(--ci-surface-2)"
                : "transparent",
              borderColor: userTransform.hasManualView
                ? "var(--ci-accent)"
                : "var(--ci-border)",
              color: "var(--ci-text)",
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">AJUSTAR</span>
          </button>

          {/* OPÇÕES DE UNIDADE (Overflow Menu §5.4: "opção Mostrar unidade nas cotas no overflow") */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowOverflowMenu((v) => !v)}
              aria-label="Opções de cotagem e exibição"
              aria-expanded={showOverflowMenu}
              title="Opções de unidade nas cotas"
              className="min-h-[44px] min-w-[44px] rounded border flex items-center justify-center transition-colors cursor-pointer"
              style={{
                backgroundColor: showOverflowMenu ? "var(--ci-surface-2)" : "transparent",
                borderColor: "var(--ci-border)",
                color: "var(--ci-text-muted)",
              }}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
            {showOverflowMenu && (
              <div
                className="absolute right-0 top-12 z-30 w-56 rounded-lg border p-2 shadow-lg font-mono text-[11px] space-y-1"
                style={{
                  backgroundColor: "var(--ci-surface)",
                  borderColor: "var(--ci-border)",
                  color: "var(--ci-text)",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowUnitInDims((v) => !v);
                    setShowOverflowMenu(false);
                  }}
                  className="w-full flex items-center justify-between rounded px-2 py-1.5 text-left cursor-pointer"
                  style={{ backgroundColor: "var(--ci-surface-2)" }}
                >
                  <span>Mostrar unidade nas cotas</span>
                  <strong>{showUnitInDims ? "SIM" : "NÃO"}</strong>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowTelemetry((v) => !v);
                    setShowOverflowMenu(false);
                  }}
                  className="w-full flex items-center justify-between rounded px-2 py-1.5 text-left cursor-pointer"
                  style={{ backgroundColor: "var(--ci-surface-2)" }}
                >
                  <span>Barra de telemetria</span>
                  <strong>{showTelemetry ? "VISÍVEL" : "OCULTA"}</strong>
                </button>
              </div>
            )}
          </div>

          {/* TELA CHEIA DA PRÉVIA */}
          {onToggleFullscreenPreview && (
            <button
              type="button"
              onClick={onToggleFullscreenPreview}
              aria-label={
                isFullscreenPreview ? "Recolher tela cheia da prévia" : "Expandir prévia em tela cheia"
              }
              aria-pressed={isFullscreenPreview}
              title={
                isFullscreenPreview ? "Recolher prévia (voltar ao layout)" : "Tela cheia da prévia"
              }
              className="min-h-[44px] min-w-[44px] px-2 rounded border font-mono text-[10px] flex items-center justify-center gap-1 transition-colors cursor-pointer shrink-0"
              style={{
                backgroundColor: isFullscreenPreview ? "var(--ci-surface-2)" : "transparent",
                borderColor: isFullscreenPreview ? "var(--ci-accent)" : "var(--ci-border)",
                color: "var(--ci-text)",
              }}
            >
              {isFullscreenPreview ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* AVISO EXPLÍCITO QUANDO MANTENDO A ÚLTIMA PRÉVIA VÁLIDA (§5.5 & §8) */}
      {(showingPreviousValidPreview || !rawDrawing.isValid) && (
        <div
          className="flex items-center justify-between gap-2 px-3 py-1.5 border-b font-mono text-[11px] shrink-0"
          style={{
            backgroundColor: "var(--ci-surface-2)",
            borderColor: "var(--ci-danger)",
            color: "var(--ci-danger)",
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate font-semibold">
              {showingPreviousValidPreview
                ? "Resultado anterior: não corresponde ao último pedido — "
                : "Erro geométrico: "}
              {rawDrawing.errorLegend ?? "Verifique os parâmetros destacados."}
            </span>
          </div>
          {rawDrawing.errorParamKey && onSelectEntityParam && (
            <button
              type="button"
              onClick={() => onSelectEntityParam(rawDrawing.errorParamKey!)}
              className="px-2 py-0.5 rounded border text-[10px] font-bold shrink-0 cursor-pointer"
              style={{
                borderColor: "var(--ci-danger)",
                color: "var(--ci-danger)",
              }}
            >
              Focar campo
            </button>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* 5.2 ÁREA GRÁFICA CAD (<svg role="img">)                             */}
      {/* =================================================================== */}
      <div
        ref={containerRef}
        className="relative flex-1 w-full min-h-[140px] overflow-hidden"
        style={{ backgroundColor: "var(--cad-canvas)" }}
      >
        <svg
          role="img"
          aria-label={activeDrawing.descriptionSummary}
          width={screenView.widthPx}
          height={screenView.heightPx}
          viewBox={`0 0 ${screenView.widthPx} ${screenView.heightPx}`}
          shapeRendering="geometricPrecision"
          onWheel={handleWheel}
          onDoubleClick={handleResetFit}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUpOrLeave}
          onPointerLeave={handlePointerUpOrLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={() => setSelectedParamKey(null)}
          className="w-full h-full block touch-none cursor-grab active:cursor-grabbing"
        >
          <title>{activeDrawing.titleSummary}</title>
          <desc>{activeDrawing.descriptionSummary}</desc>

          {/* 1. GRADE 1-2-5 ADAPTATIVA (shape-rendering: crispEdges) */}
          {showGrid && (
            <g shapeRendering="crispEdges" className="pointer-events-none">
              {projected.grid.verticalLines.map((vl, idx) => (
                <line
                  key={`gv_${idx}`}
                  x1={vl.x}
                  y1={0}
                  x2={vl.x}
                  y2={screenView.heightPx}
                  stroke={vl.isMajor ? "var(--cad-grid-major)" : "var(--cad-grid-minor)"}
                  strokeWidth={vl.isMajor ? 0.8 : 0.5}
                  strokeOpacity={vl.isMajor ? 0.55 : 0.35}
                />
              ))}
              {projected.grid.horizontalLines.map((hl, idx) => (
                <line
                  key={`gh_${idx}`}
                  x1={0}
                  y1={hl.y}
                  x2={screenView.widthPx}
                  y2={hl.y}
                  stroke={hl.isMajor ? "var(--cad-grid-major)" : "var(--cad-grid-minor)"}
                  strokeWidth={hl.isMajor ? 0.8 : 0.5}
                  strokeOpacity={hl.isMajor ? 0.55 : 0.35}
                />
              ))}
            </g>
          )}

          {/* 2. EIXOS DE ORIGEM X / Y (vermelho e verde discretos via tokens) */}
          {showAxes && (
            <g className="pointer-events-none">
              <line
                x1={0}
                y1={Math.round(screenView.originScreenY) + 0.5}
                x2={screenView.widthPx}
                y2={Math.round(screenView.originScreenY) + 0.5}
                stroke="var(--cad-axis-x)"
                strokeWidth={0.8}
                strokeOpacity={0.35}
              />
              <line
                x1={Math.round(screenView.originScreenX) + 0.5}
                y1={0}
                x2={Math.round(screenView.originScreenX) + 0.5}
                y2={screenView.heightPx}
                stroke="var(--cad-axis-y)"
                strokeWidth={0.8}
                strokeOpacity={0.35}
              />
            </g>
          )}

          {/* 3 & 4. PREENCHIMENTO COM FUROS VAZADOS (fill-rule="evenodd") + CONTORNO E FUROS GROSSOS (1.6px) */}
          {projected.compoundCutPathD && (
            <path
              d={projected.compoundCutPathD}
              fillRule="evenodd"
              fill={
                !rawDrawing.isValid
                  ? "var(--ci-danger)"
                  : isProvisional
                    ? "var(--cad-provisional)"
                    : projected.cutDisplayColor
              }
              fillOpacity={0.06}
              stroke={
                !rawDrawing.isValid
                  ? "var(--ci-danger)"
                  : activeHighlightKey === "width" || activeHighlightKey === "height"
                    ? "var(--cad-selection)"
                    : isProvisional
                      ? "var(--cad-provisional)"
                      : projected.cutDisplayColor
              }
              strokeWidth={1.6}
              strokeDasharray={isProvisional ? "8 4" : undefined}
              vectorEffect="non-scaling-stroke"
              onClick={(e) => handleSelectEntity("width", e)}
              className="cursor-pointer"
            />
          )}

          {/* Alvos clicáveis transparentes sobre os furos para seleção e foco no parâmetro `hole_diameter` */}
          {projected.holeCenterCrossesPx.map((hc) => (
            <circle
              key={`hit_${hc.id}`}
              cx={hc.cx}
              cy={hc.cy}
              r={Math.max(10, hc.rPx + 4)}
              fill="transparent"
              stroke={
                activeHighlightKey === "hole_diameter" || activeHighlightKey === "hole_count"
                  ? "var(--cad-selection)"
                  : "none"
              }
              strokeWidth={1.2}
              strokeDasharray="3 2"
              onClick={(e) => handleSelectEntity(hc.paramKey, e)}
              className="cursor-pointer"
            />
          ))}

          {/* 5. LINHAS DE CENTRO E MARCAS DE CENTRO DE FUROS (traço-ponto fina 0.8px, padrão 10 3 2 3) */}
          {showAxes && (
            <g className="pointer-events-none">
              {projected.centerlinesPx.map((cl) =>
                cl.kind === "circle" ? (
                  <circle
                    key={cl.id}
                    cx={cl.cx}
                    cy={cl.cy}
                    r={cl.r}
                    fill="none"
                    stroke="var(--cad-center)"
                    strokeWidth={0.8}
                    strokeDasharray="10 3 2 3"
                  />
                ) : (
                  <line
                    key={cl.id}
                    x1={cl.x1}
                    y1={cl.y1}
                    x2={cl.x2}
                    y2={cl.y2}
                    stroke="var(--cad-center)"
                    strokeWidth={0.8}
                    strokeDasharray="10 3 2 3"
                  />
                ),
              )}

              {/* Marcas de centro (+) de cada furo passando ~4–5 px do círculo (§5.3) */}
              {projected.holeCenterCrossesPx.map((hc) => (
                <g key={`cross_${hc.id}`}>
                  <line
                    x1={hc.cx - hc.armHalfPx}
                    y1={hc.cy}
                    x2={hc.cx + hc.armHalfPx}
                    y2={hc.cy}
                    stroke="var(--cad-center)"
                    strokeWidth={0.8}
                  />
                  <line
                    x1={hc.cx}
                    y1={hc.cy - hc.armHalfPx}
                    x2={hc.cx}
                    y2={hc.cy + hc.armHalfPx}
                    stroke="var(--cad-center)"
                    strokeWidth={0.8}
                  />
                </g>
              ))}
            </g>
          )}

          {/* 6. COTAS LINEARES E CHAMADAS CONVENCIONAIS ISO 129 / ABNT NBR 10126 (fina 0.8px) */}
          <g>
            {projected.dimensionsPx.map((dim) => {
              const isHighlighted = activeHighlightKey === dim.paramKey;
              const strokeColor = isHighlighted ? "var(--cad-selection)" : "var(--cad-dim)";
              return (
                <g
                  key={dim.id}
                  onClick={(e) => handleSelectEntity(dim.paramKey, e)}
                  className="cursor-pointer"
                >
                  {/* Linhas de extensão (folga 3px, avanço 4px) */}
                  <line
                    x1={dim.extLine1.x1}
                    y1={dim.extLine1.y1}
                    x2={dim.extLine1.x2}
                    y2={dim.extLine1.y2}
                    stroke={strokeColor}
                    strokeWidth={0.8}
                  />
                  <line
                    x1={dim.extLine2.x1}
                    y1={dim.extLine2.y1}
                    x2={dim.extLine2.x2}
                    y2={dim.extLine2.y2}
                    stroke={strokeColor}
                    strokeWidth={0.8}
                  />
                  {/* Linha de cota */}
                  <line
                    x1={dim.dimLine.x1}
                    y1={dim.dimLine.y1}
                    x2={dim.dimLine.x2}
                    y2={dim.dimLine.y2}
                    stroke={strokeColor}
                    strokeWidth={0.8}
                  />
                  {/* Setas fechadas e preenchidas 1:3 */}
                  <polygon points={dim.arrow1Points} fill={strokeColor} />
                  <polygon points={dim.arrow2Points} fill={strokeColor} />
                  {/* Máscara na cor do canvas para a linha nunca riscar o número (§5.4) */}
                  <rect
                    x={dim.labelBox.minX}
                    y={dim.labelBox.minY}
                    width={dim.labelBox.width}
                    height={dim.labelBox.height}
                    rx={2}
                    fill="var(--cad-canvas)"
                  />
                  {/* Texto horizontal, 11 px, numerais tabulares */}
                  <text
                    x={dim.labelBox.cx}
                    y={dim.labelBox.cy + 3.5}
                    textAnchor="middle"
                    fill={isHighlighted ? "var(--cad-selection)" : "var(--cad-text)"}
                    style={{
                      fontFamily: 'ui-monospace, "JetBrains Mono", Consolas, monospace',
                      fontSize: "11px",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 600,
                    }}
                  >
                    {dim.labelBox.text}
                  </text>
                </g>
              );
            })}

            {projected.leadersPx.map((ldr) => {
              const isHighlighted = activeHighlightKey === ldr.paramKey;
              const strokeColor = isHighlighted ? "var(--cad-selection)" : "var(--cad-dim)";
              return (
                <g
                  key={ldr.id}
                  onClick={(e) => handleSelectEntity(ldr.paramKey, e)}
                  className="cursor-pointer"
                >
                  <polyline
                    points={ldr.polylinePoints}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={0.8}
                  />
                  <polygon points={ldr.arrowPoints} fill={strokeColor} />
                  <rect
                    x={ldr.labelBox.minX}
                    y={ldr.labelBox.minY}
                    width={ldr.labelBox.width}
                    height={ldr.labelBox.height}
                    rx={2}
                    fill="var(--cad-canvas)"
                  />
                  <text
                    x={ldr.labelBox.cx}
                    y={ldr.labelBox.cy + 3.5}
                    textAnchor="middle"
                    fill={isHighlighted ? "var(--cad-selection)" : "var(--cad-text)"}
                    style={{
                      fontFamily: 'ui-monospace, "JetBrains Mono", Consolas, monospace',
                      fontSize: "11px",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 600,
                    }}
                  >
                    {ldr.labelBox.text}
                  </text>
                </g>
              );
            })}
          </g>

          {/* 7. GRIPS DE SELEÇÃO (~7 px quadrados somente leitura quando selecionado — §5.3) */}
          {activeHighlightKey && activeDrawing.plate && (
            <g className="pointer-events-none">
              {[
                {
                  x: screenView.originScreenX - (activeDrawing.plate.W / 2) * screenView.scalePxPerMm,
                  y: screenView.originScreenY - (activeDrawing.plate.H / 2) * screenView.scalePxPerMm,
                },
                {
                  x: screenView.originScreenX + (activeDrawing.plate.W / 2) * screenView.scalePxPerMm,
                  y: screenView.originScreenY - (activeDrawing.plate.H / 2) * screenView.scalePxPerMm,
                },
                {
                  x: screenView.originScreenX + (activeDrawing.plate.W / 2) * screenView.scalePxPerMm,
                  y: screenView.originScreenY + (activeDrawing.plate.H / 2) * screenView.scalePxPerMm,
                },
                {
                  x: screenView.originScreenX - (activeDrawing.plate.W / 2) * screenView.scalePxPerMm,
                  y: screenView.originScreenY + (activeDrawing.plate.H / 2) * screenView.scalePxPerMm,
                },
              ].map((pt, i) => (
                <rect
                  key={`grip_${i}`}
                  x={pt.x - 3.5}
                  y={pt.y - 3.5}
                  width={7}
                  height={7}
                  fill="var(--cad-selection)"
                  stroke="var(--cad-canvas)"
                  strokeWidth={1}
                />
              ))}
            </g>
          )}

          {/* 8. MIRA E INDICADOR DE SNAP (extremidade □, ponto médio △, centro ○, interseção ✕ — §5.6) */}
          {cursorMm?.snap && (
            <g className="pointer-events-none">
              {(() => {
                const sx =
                  screenView.originScreenX + cursorMm.snap.x * screenView.scalePxPerMm;
                const sy =
                  screenView.originScreenY - cursorMm.snap.y * screenView.scalePxPerMm;
                if (cursorMm.snap.kind === "endpoint") {
                  return (
                    <rect
                      x={sx - 4}
                      y={sy - 4}
                      width={8}
                      height={8}
                      fill="none"
                      stroke="var(--cad-selection)"
                      strokeWidth={1.3}
                    />
                  );
                }
                if (cursorMm.snap.kind === "midpoint") {
                  return (
                    <polygon
                      points={`${sx},${sy - 5} ${sx - 4.5},${sy + 4} ${sx + 4.5},${sy + 4}`}
                      fill="none"
                      stroke="var(--cad-selection)"
                      strokeWidth={1.3}
                    />
                  );
                }
                return (
                  <circle
                    cx={sx}
                    cy={sy}
                    r={4.5}
                    fill="none"
                    stroke="var(--cad-selection)"
                    strokeWidth={1.3}
                  />
                );
              })()}
            </g>
          )}

          {/* 9. CANTOS INTERNOS DO CANVAS (§5.1: só rótulo de viewport, símbolo UCS X-Y e leitura/escala) */}
          {/* Canto superior esquerdo: Rótulo de viewport e unidade UN: mm */}
          <g className="pointer-events-none">
            <text
              x={10}
              y={16}
              fill="var(--cad-text)"
              fillOpacity={0.72}
              style={{
                fontFamily: 'ui-monospace, "JetBrains Mono", Consolas, monospace',
                fontSize: "10px",
                fontWeight: 600,
              }}
            >
              PLANTA · UN: mm · CAMADA {activeLayerName.toUpperCase()}
            </text>
          </g>

          {/* Canto inferior esquerdo: Símbolo de origem / UCS X-Y */}
          <g
            transform={`translate(18, ${screenView.heightPx - 18})`}
            className="pointer-events-none"
          >
            <line
              x1={0}
              y1={0}
              x2={22}
              y2={0}
              stroke="var(--cad-axis-x)"
              strokeWidth={1.2}
            />
            <polygon points="22,0 17,-2.2 17,2.2" fill="var(--cad-axis-x)" />
            <text
              x={25}
              y={3}
              fill="var(--cad-axis-x)"
              style={{
                fontFamily: 'ui-monospace, "JetBrains Mono", Consolas, monospace',
                fontSize: "9px",
                fontWeight: 700,
              }}
            >
              X
            </text>

            <line
              x1={0}
              y1={0}
              x2={0}
              y2={-22}
              stroke="var(--cad-axis-y)"
              strokeWidth={1.2}
            />
            <polygon points="0,-22 -2.2,-17 2.2,-17" fill="var(--cad-axis-y)" />
            <text
              x={-3}
              y={-25}
              fill="var(--cad-axis-y)"
              style={{
                fontFamily: 'ui-monospace, "JetBrains Mono", Consolas, monospace',
                fontSize: "9px",
                fontWeight: 700,
              }}
            >
              Y
            </text>
            <rect
              x={-2}
              y={-2}
              width={4}
              height={4}
              fill="none"
              stroke="var(--cad-text)"
              strokeWidth={0.9}
            />
          </g>

          {/* Canto inferior direito: Leitura de coordenadas X/Y e barra de escala com valor redondo */}
          <g
            transform={`translate(${screenView.widthPx - 12}, ${screenView.heightPx - 10})`}
            className="pointer-events-none"
          >
            {/* Coordenadas X/Y + Snap */}
            <text
              x={0}
              y={-14}
              textAnchor="end"
              fill="var(--cad-text)"
              fillOpacity={0.78}
              style={{
                fontFamily: 'ui-monospace, "JetBrains Mono", Consolas, monospace',
                fontSize: "10px",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {cursorMm
                ? `${cursorMm.snap ? `${cursorMm.snap.kind === "endpoint" ? "□" : cursorMm.snap.kind === "midpoint" ? "△" : "○"} ` : ""}X ${formatCadNumber(cursorMm.x, decimalSeparator)} · Y ${formatCadNumber(cursorMm.y, decimalSeparator)}`
                : `GRADE ${projected.grid.minorStepMm} mm`}
            </text>

            {/* Barra de escala em mm */}
            <line
              x1={-projected.scaleBar.widthPx}
              y1={-4}
              x2={0}
              y2={-4}
              stroke="var(--cad-text)"
              strokeWidth={1.1}
            />
            <line
              x1={-projected.scaleBar.widthPx}
              y1={-8}
              x2={-projected.scaleBar.widthPx}
              y2={0}
              stroke="var(--cad-text)"
              strokeWidth={1.1}
            />
            <line
              x1={0}
              y1={-8}
              x2={0}
              y2={0}
              stroke="var(--cad-text)"
              strokeWidth={1.1}
            />
            <text
              x={-projected.scaleBar.widthPx / 2}
              y={-7}
              textAnchor="middle"
              fill="var(--cad-text)"
              style={{
                fontFamily: 'ui-monospace, "JetBrains Mono", Consolas, monospace',
                fontSize: "9px",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {projected.scaleBar.label}
            </text>
          </g>
        </svg>
      </div>

      {/* =================================================================== */}
      {/* 5.1 FAIXA DE TELEMETRIA ABAIXO DO CANVAS (RECOLHÍVEL)               */}
      {/* =================================================================== */}
      <div
        className="flex items-center justify-between gap-2 px-2.5 py-1 border-t font-mono text-[10px] shrink-0"
        style={{
          backgroundColor: "var(--ci-surface)",
          borderColor: "var(--ci-border)",
          color: "var(--ci-text-muted)",
        }}
      >
        {showTelemetry ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 min-w-0">
            <span>
              ZOOM:{" "}
              <strong style={{ color: "var(--ci-text)", fontVariantNumeric: "tabular-nums" }}>
                {zoomPercentage}%
              </strong>{" "}
              ({projected.scaleBar.label})
            </span>
            <span>|</span>
            <span>
              ÁREA LÍQUIDA:{" "}
              <strong style={{ color: "var(--ci-text)", fontVariantNumeric: "tabular-nums" }}>
                {formatCadNumber(activeDrawing.metrics.netAreaMm2 / 100, decimalSeparator)} cm²
              </strong>{" "}
              ({formatCadNumber(Math.round(activeDrawing.metrics.netAreaMm2), decimalSeparator)} mm²)
            </span>
            <span>|</span>
            <span>
              PERÍMETRO DE CORTE:{" "}
              <strong style={{ color: "var(--ci-text)", fontVariantNumeric: "tabular-nums" }}>
                {formatCadNumber(activeDrawing.metrics.cutPerimeterMm, decimalSeparator)} mm
              </strong>
            </span>
            <span>|</span>
            <span>
              FUROS:{" "}
              <strong style={{ color: "var(--ci-text)", fontVariantNumeric: "tabular-nums" }}>
                {activeDrawing.metrics.holeCount}
              </strong>
            </span>
          </div>
        ) : (
          <span>TELEMETRIA GEOMÉTRICA RECOLHIDA</span>
        )}

        <button
          type="button"
          onClick={() => setShowTelemetry((v) => !v)}
          aria-label={showTelemetry ? "Recolher faixa de telemetria" : "Expandir faixa de telemetria"}
          className="p-1 rounded flex items-center gap-1 cursor-pointer shrink-0"
          style={{ color: "var(--ci-text-muted)" }}
        >
          {showTelemetry ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
