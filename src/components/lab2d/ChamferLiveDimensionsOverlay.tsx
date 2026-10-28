/**
 * CALDRA CHAMFER — OVERLAY PROFISSIONAL DE GUIAS DE INTERAÇÃO EXCLUSIVAS
 *  - "blue_line": Referência de Criação de Linha (Azul — ângulos livres 0°–360°, L, ∠, ΔX, ΔY)
 *  - "purple_ref": Referência de Ponto de Encontro (Roxa — ΔX, ΔY, d + Cruz '+' Roxa Pontilhada Adaptável)
 *  - Centro de Referência Clássico em Vermelho Carmesim (#DC143C) com gatilho de confirmação [ ✓ Confirmar ] [ ✕ Cancelar ]
 *  - Animação de fluxo direcional contínuo (marching ants) de (X0, Y0) -> (X, Y)
 */

import React, { useMemo, useState, useEffect } from "react";
import type { Vec2 } from "@/lib/geometry/types";
import type { TemporaryOrigin } from "@/lib/lab2d/cadCoordinateFrames";
import type { EdgeReference } from "@/lib/lab2d/cadGeometricReferences";
import type { LiveDimension } from "@/lib/lab2d/cadDynamicDimensions";
import type { Entity } from "@/lib/lab2d/types";
import {
  CRIMSON_RED_CENTER,
  resolveBubbleCollisions,
  computeGuideAngleDeg,
  computeFlowDashOffset,
  type InteractionGuideMode,
  type DimensionalConstraints,
  type ConstrainableMeasureKind,
  type GuideBubble,
} from "@/lib/lab2d/cadInteractionGuides";

export interface ChamferLiveDimensionsOverlayProps {
  temporaryOrigin: TemporaryOrigin | null;
  activeEdge: EdgeReference | null;
  activeEdgeSide: 1 | -1;
  liveDimensions: LiveDimension[];
  viewK: number;
  isDark?: boolean;
  cursor?: Vec2 | null;
  /** Ponto inicial ativo da operação (ou centro de referência X0, Y0) */
  activeStartPoint?: Vec2 | null;
  /** Modo exclusivo de guias de interação selecionado em PRE */
  interactionGuideMode?: InteractionGuideMode;
  /** Restrições dimensionais reais ativas (L, ∠, ΔX, ΔY, d) */
  lockedConstraints?: DimensionalConstraints;
  /** Bloqueio de eventos durante gestos multitouch (zoom/pan) */
  isMultitouchNavigating?: boolean;
  /** Pontos de encontro roxos (+) já confirmados/fixados no canvas */
  pinnedMeetingPoints?: Vec2[];
  /** Entidades do desenho para adaptar a cruz (+) ponta a ponta sobre furos/formas */
  entities?: Entity[];
  pendingShape?: {
    type: string;
    center?: Vec2;
    r?: number;
    width?: number;
    height?: number;
  } | null;
  onDimensionClick?: (dim: LiveDimension, screenPos: Vec2) => void;
  onClearTemporaryOrigin?: () => void;
  onInvertEdgeSide?: () => void;
  onEditMeasure?: (
    kind: ConstrainableMeasureKind,
    currentVal: number,
    screenPos: Vec2,
    isLocked: boolean,
  ) => void;
  /** Confirmação acionada ao tocar no Centro de Referência Vermelho Carmesim e clicar em [ ✓ Confirmar ] */
  onConfirmReferenceAction?: (
    originPt: Vec2,
    targetPt: Vec2,
    mode: InteractionGuideMode,
  ) => void;
  /** Cancelamento acionado ao clicar em [ ✕ Cancelar ] na barra do Centro de Referência */
  onCancelReferenceAction?: () => void;
  /** Mantido para compatibilidade com chamadas legadas */
  onEditDelta?: (axis: "dx" | "dy", currentVal: number, screenPos: Vec2) => void;
}

/**
 * Calcula a extensão ponta-a-ponta (meio-braço horizontal e vertical) da Cruz (+) Roxa Pontilhada
 * adaptando-se automaticamente a qualquer círculo de furação ou forma desenhada sobre o ponto (X, Y).
 */
function computeAdaptiveCrossArms(
  pt: Vec2,
  safeK: number,
  pendingShape?: ChamferLiveDimensionsOverlayProps["pendingShape"],
  entities?: Entity[],
): { armX: number; armY: number; isAdaptedToShape: boolean } {
  const defaultArm = 16 / safeK;
  let armX = defaultArm;
  let armY = defaultArm;
  let adapted = false;
  const matchTol = 14 / safeK;

  // 1. Verifica forma em criação (draft ativo)
  if (pendingShape) {
    const sc = pendingShape.center;
    const isNear = !sc || Math.hypot(sc.x - pt.x, sc.y - pt.y) <= matchTol;
    if (isNear) {
      if (pendingShape.type === "circle" && pendingShape.r && pendingShape.r > 0.5) {
        const span = pendingShape.r + 6 / safeK;
        armX = Math.max(armX, span);
        armY = Math.max(armY, span);
        adapted = true;
      } else if (
        pendingShape.width &&
        pendingShape.height &&
        (pendingShape.width > 1 || pendingShape.height > 1)
      ) {
        armX = Math.max(armX, pendingShape.width / 2 + 6 / safeK);
        armY = Math.max(armY, pendingShape.height / 2 + 6 / safeK);
        adapted = true;
      }
    }
  }

  // 2. Verifica círculos de furação ou formas já existentes centradas nesse ponto de encontro
  if (entities && entities.length > 0) {
    for (const ent of entities) {
      if (ent.type === "circle") {
        if (Math.hypot(ent.cx - pt.x, ent.cy - pt.y) <= matchTol && ent.r > 0.5) {
          const span = ent.r + 6 / safeK;
          armX = Math.max(armX, span);
          armY = Math.max(armY, span);
          adapted = true;
        }
      } else if (ent.type === "ellipse") {
        if (Math.hypot(ent.cx - pt.x, ent.cy - pt.y) <= matchTol) {
          armX = Math.max(armX, ent.rx + 6 / safeK);
          armY = Math.max(armY, ent.ry + 6 / safeK);
          adapted = true;
        }
      } else if (ent.type === "polyline" && ent.closed && ent.pts.length >= 3) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const p of ent.pts) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        if (Math.hypot(cx - pt.x, cy - pt.y) <= matchTol) {
          armX = Math.max(armX, (maxX - minX) / 2 + 6 / safeK);
          armY = Math.max(armY, (maxY - minY) / 2 + 6 / safeK);
          adapted = true;
        }
      }
    }
  }

  return { armX, armY, isAdaptedToShape: adapted };
}

export function ChamferLiveDimensionsOverlay({
  temporaryOrigin,
  activeEdge,
  activeEdgeSide,
  liveDimensions,
  viewK,
  isDark = true,
  cursor = null,
  activeStartPoint = null,
  interactionGuideMode = "blue_line",
  lockedConstraints = {},
  isMultitouchNavigating = false,
  pinnedMeetingPoints = [],
  entities = [],
  pendingShape = null,
  onDimensionClick,
  onInvertEdgeSide,
  onEditMeasure,
  onConfirmReferenceAction,
  onCancelReferenceAction,
  onEditDelta,
}: ChamferLiveDimensionsOverlayProps) {
  const safeK = Number.isFinite(viewK) && viewK > 0 ? viewK : 1;

  // Paleta técnica CAD de alto contraste
  const crimsonMain = CRIMSON_RED_CENTER; // #DC143C (Vermelho Carmesim Clássico)
  const purpleStroke = "#A855F7";
  const blueMain = isDark ? "#38BDF8" : "#0EA5E9";
  const blueProj = isDark ? "rgba(56, 189, 248, 0.72)" : "rgba(14, 165, 233, 0.68)";
  const amber = isDark ? "#FBBF24" : "#D97706";
  const bgBadge = isDark ? "rgba(11, 16, 23, 0.94)" : "rgba(255, 255, 255, 0.96)";

  const refPt = temporaryOrigin?.p ?? null;
  const curPt = cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y) ? cursor : null;
  const startPt =
    activeStartPoint && Number.isFinite(activeStartPoint.x) && Number.isFinite(activeStartPoint.y)
      ? activeStartPoint
      : null;

  // Tanto "Referência de Criação de Linha" (Azul) quanto "Referência de Ponto de Encontro" (Roxa)
  // partem do Centro de Referência Vermelho Carmesim (X0, Y0) até a posição atual (X, Y)
  const effectiveOriginPt = showOriginForMode(interactionGuideMode, startPt, refPt);

  const showPurpleGuides =
    interactionGuideMode === "purple_ref" && effectiveOriginPt !== null && curPt !== null;
  const showBlueGuides =
    interactionGuideMode === "blue_line" && effectiveOriginPt !== null && curPt !== null;

  // Estado da Barra Flutuante de Confirmação ao clicar no Centro de Referência Vermelho Carmesim
  const [confirmBarOpen, setConfirmBarOpen] = useState(false);

  useEffect(() => {
    if (interactionGuideMode === "off" || !effectiveOriginPt) {
      setConfirmBarOpen(false);
    }
  }, [interactionGuideMode, effectiveOriginPt]);

  // Loop controlado de animação de fluxo direcional (marching ants de X0,Y0 -> X,Y)
  const [flowOffsetPx, setFlowOffsetPx] = useState<number>(0);
  const isAnyGuideActive = Boolean(
    (showPurpleGuides || showBlueGuides) && !isMultitouchNavigating,
  );

  useEffect(() => {
    if (!isAnyGuideActive) {
      setFlowOffsetPx(0);
      return;
    }
    let rafId = 0;
    let active = true;
    const step = (now: number) => {
      if (!active) return;
      setFlowOffsetPx(computeFlowDashOffset(now, 16, 0.035));
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => {
      active = false;
      cancelAnimationFrame(rafId);
    };
  }, [isAnyGuideActive]);

  const flowDashOffsetWorld = flowOffsetPx / safeK;

  // Cálculo de geometria e bolhas anti-colisão para o modo ativo
  const activeGuideData = useMemo(() => {
    const basePt = effectiveOriginPt;
    if (!basePt || !curPt || (!showBlueGuides && !showPurpleGuides)) return null;

    const dx = curPt.x - basePt.x;
    const dy = curPt.y - basePt.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const totalLen = Math.hypot(dx, dy);
    const angleDeg = computeGuideAngleDeg(basePt, curPt);

    if (totalLen < 0.25 / safeK) return null;

    const minX = Math.min(basePt.x, curPt.x);
    const maxX = Math.max(basePt.x, curPt.x);
    const minY = Math.min(basePt.y, curPt.y);
    const maxY = Math.max(basePt.y, curPt.y);

    // Canto ortogonal da projeção: (curPt.x, basePt.y)
    const cornerPt: Vec2 = { x: curPt.x, y: basePt.y };

    // Vetor normal da hipotenusa apontando para o lado EXTERNO (oposto ao cornerPt)
    const ux = dx / totalLen;
    const uy = dy / totalLen;
    let nx = -uy;
    let ny = ux;
    const midDiag: Vec2 = { x: (basePt.x + curPt.x) / 2, y: (basePt.y + curPt.y) / 2 };
    const toCornerX = cornerPt.x - midDiag.x;
    const toCornerY = cornerPt.y - midDiag.y;
    if (nx * toCornerX + ny * toCornerY > 0) {
      nx = -nx;
      ny = -ny;
    }

    const rawBubbles: GuideBubble[] = [];
    const pillH = 18 / safeK;

    // 1. Bolha principal da hipotenusa: "L" (Modo Azul) ou "d" (Modo Roxo)
    const mainKind: ConstrainableMeasureKind = showBlueGuides ? "L" : "d";
    const isMainLocked = showBlueGuides
      ? typeof lockedConstraints.lockedL === "number"
      : typeof lockedConstraints.lockedDist === "number";
    const mainText = `${isMainLocked ? "🔒 " : ""}${mainKind} ${totalLen.toFixed(1)} mm`;
    const mainW = Math.max(68, mainText.length * 5.6 + 12) / safeK;
    const diagOffset = 16 / safeK;

    rawBubbles.push({
      id: `bubble-${mainKind}`,
      kind: mainKind,
      text: mainText,
      value: Number(totalLen.toFixed(2)),
      locked: isMainLocked,
      anchor: midDiag,
      pos: {
        x: midDiag.x + nx * diagOffset,
        y: midDiag.y + ny * diagOffset,
      },
      normal: { x: nx, y: ny },
      widthWorld: mainW,
      heightWorld: pillH,
    });

    // 2. Bolha de Ângulo Livre "∠ (°)" (Exclusiva para Referência de Criação de Linha Azul)
    if (showBlueGuides) {
      const isAngleLocked = typeof lockedConstraints.lockedAngle === "number";
      const angleText = `${isAngleLocked ? "🔒 " : ""}∠ ${angleDeg.toFixed(1)}°`;
      const angleW = Math.max(60, angleText.length * 5.6 + 12) / safeK;
      const arcRadius = Math.min(Math.max(24 / safeK, totalLen * 0.25), 42 / safeK);
      const halfRad = ((angleDeg / 2) * Math.PI) / 180;
      const anchorAngle: Vec2 = {
        x: basePt.x + arcRadius * Math.cos(halfRad),
        y: basePt.y - arcRadius * Math.sin(halfRad),
      };
      rawBubbles.push({
        id: "bubble-angle",
        kind: "angle",
        text: angleText,
        value: Number(angleDeg.toFixed(2)),
        locked: isAngleLocked,
        anchor: anchorAngle,
        pos: {
          x: basePt.x + (arcRadius + 16 / safeK) * Math.cos(halfRad),
          y: basePt.y - (arcRadius + 16 / safeK) * Math.sin(halfRad),
        },
        normal: { x: Math.cos(halfRad), y: -Math.sin(halfRad) },
        widthWorld: angleW,
        heightWorld: pillH,
      });
    }

    // 3. Bolha Horizontal: ΔX
    if (absDx > 2 / safeK || lockedConstraints.lockedDx != null) {
      const isDxLocked = typeof lockedConstraints.lockedDx === "number";
      const dxText = `${isDxLocked ? "🔒 " : ""}ΔX ${absDx.toFixed(1)} mm`;
      const dxW = Math.max(68, dxText.length * 5.6 + 12) / safeK;
      const anchorDx: Vec2 = { x: (basePt.x + curPt.x) / 2, y: basePt.y };
      const normalY = dy >= 0 ? -1 : 1;
      rawBubbles.push({
        id: "bubble-dx",
        kind: "dx",
        text: dxText,
        value: Number(absDx.toFixed(2)),
        locked: isDxLocked,
        anchor: anchorDx,
        pos: {
          x: anchorDx.x,
          y: anchorDx.y + normalY * (15 / safeK),
        },
        normal: { x: 0, y: normalY },
        widthWorld: dxW,
        heightWorld: pillH,
      });
    }

    // 4. Bolha Vertical: ΔY
    if (absDy > 2 / safeK || lockedConstraints.lockedDy != null) {
      const isDyLocked = typeof lockedConstraints.lockedDy === "number";
      const dyText = `${isDyLocked ? "🔒 " : ""}ΔY ${absDy.toFixed(1)} mm`;
      const dyW = Math.max(68, dyText.length * 5.6 + 12) / safeK;
      const anchorDy: Vec2 = { x: curPt.x, y: (basePt.y + curPt.y) / 2 };
      const normalX = dx >= 0 ? 1 : -1;
      rawBubbles.push({
        id: "bubble-dy",
        kind: "dy",
        text: dyText,
        value: Number(absDy.toFixed(2)),
        locked: isDyLocked,
        anchor: anchorDy,
        pos: {
          x: anchorDy.x + normalX * dxWOffset(dyW, safeK),
          y: anchorDy.y,
        },
        normal: { x: normalX, y: 0 },
        widthWorld: dyW,
        heightWorld: pillH,
      });
    }

    const resolvedBubbles = resolveBubbleCollisions(rawBubbles, safeK);

    return {
      basePt,
      curPt,
      cornerPt,
      minX,
      maxX,
      minY,
      maxY,
      absDx,
      absDy,
      totalLen,
      angleDeg,
      bubbles: resolvedBubbles,
    };
  }, [showBlueGuides, showPurpleGuides, effectiveOriginPt, curPt, safeK, lockedConstraints]);

  const handleBubbleTap = (b: GuideBubble, e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    if (isMultitouchNavigating) return;
    const screenPos = { x: e.clientX, y: e.clientY };
    if (onEditMeasure) {
      onEditMeasure(b.kind, b.value, screenPos, b.locked);
    } else if ((b.kind === "dx" || b.kind === "dy") && onEditDelta) {
      onEditDelta(b.kind, b.value, screenPos);
    }
  };

  // Braços adaptativos da Cruz (+) Roxa Pontilhada no ponto de encontro ativo
  const activeMeetingCross = useMemo(() => {
    if (!showPurpleGuides || !activeGuideData) return null;
    return computeAdaptiveCrossArms(activeGuideData.curPt, safeK, pendingShape, entities);
  }, [showPurpleGuides, activeGuideData, safeK, pendingShape, entities]);

  return (
    <g className="select-none pointer-events-none">
      {/* =====================================================================
          0. PONTOS DE ENCONTRO ROXOS (+) CONFIRMADOS / FIXADOS NO CANVAS
             Adaptam-se automaticamente ponta a ponta a círculos/formas!
          ===================================================================== */}
      {pinnedMeetingPoints.map((pt, idx) => {
        const arms = computeAdaptiveCrossArms(pt, safeK, pendingShape, entities);
        return (
          <g key={`pinned-meeting-${idx}`} aria-label="Cruz Roxa Pontilhada de Ponto de Encontro Confirmado">
            <line
              x1={pt.x - arms.armX}
              y1={pt.y}
              x2={pt.x + arms.armX}
              y2={pt.y}
              stroke={purpleStroke}
              strokeWidth={1.5 / safeK}
              strokeDasharray={`${4 / safeK},${3 / safeK}`}
              strokeDashoffset={flowDashOffsetWorld}
            />
            <line
              x1={pt.x}
              y1={pt.y - arms.armY}
              x2={pt.x}
              y2={pt.y + arms.armY}
              stroke={purpleStroke}
              strokeWidth={1.5 / safeK}
              strokeDasharray={`${4 / safeK},${3 / safeK}`}
              strokeDashoffset={flowDashOffsetWorld}
            />
            <circle
              cx={pt.x}
              cy={pt.y}
              r={2.2 / safeK}
              fill={purpleStroke}
            />
          </g>
        );
      })}

      {/* =====================================================================
          1. MODO ROXO EXCLUSIVO ("purple_ref"): REFERÊNCIA DE PONTO DE ENCONTRO
          ===================================================================== */}
      {showPurpleGuides && activeGuideData && (
        <g aria-label="Referência de Ponto de Encontro Roxa">
          {/* Preenchimento auxiliar discreto na área retangular */}
          {activeGuideData.absDx > 1 / safeK && activeGuideData.absDy > 1 / safeK && (
            <rect
              x={activeGuideData.minX}
              y={activeGuideData.minY}
              width={activeGuideData.absDx}
              height={activeGuideData.absDy}
              fill={isDark ? "rgba(168, 85, 247, 0.04)" : "rgba(147, 51, 234, 0.03)"}
              stroke="none"
            />
          )}

          {/* Projeções auxiliares ortogonais roxas orientadas de (X0,Y0) -> (X,Y) com fluxo contínuo */}
          {activeGuideData.absDx > 0.5 / safeK && activeGuideData.absDy > 0.5 / safeK && (
            <>
              {/* Cateto Horizontal ΔX: (X0, Y0) -> (X, Y0) */}
              <line
                x1={activeGuideData.basePt.x}
                y1={activeGuideData.basePt.y}
                x2={activeGuideData.cornerPt.x}
                y2={activeGuideData.cornerPt.y}
                stroke={purpleStroke}
                strokeWidth={1.25 / safeK}
                strokeDasharray={`${5 / safeK},${3 / safeK}`}
                strokeDashoffset={flowDashOffsetWorld}
                strokeOpacity={0.82}
              />
              {/* Cateto Vertical ΔY: (X, Y0) -> (X, Y) */}
              <line
                x1={activeGuideData.cornerPt.x}
                y1={activeGuideData.cornerPt.y}
                x2={activeGuideData.curPt.x}
                y2={activeGuideData.curPt.y}
                stroke={purpleStroke}
                strokeWidth={1.25 / safeK}
                strokeDasharray={`${5 / safeK},${3 / safeK}`}
                strokeDashoffset={flowDashOffsetWorld}
                strokeOpacity={0.82}
              />
              {/* Lados complementares orientados de (X0, Y0) -> (X0, Y) -> (X, Y) */}
              <line
                x1={activeGuideData.basePt.x}
                y1={activeGuideData.basePt.y}
                x2={activeGuideData.basePt.x}
                y2={activeGuideData.curPt.y}
                stroke={purpleStroke}
                strokeWidth={1.05 / safeK}
                strokeDasharray={`${5 / safeK},${3 / safeK}`}
                strokeDashoffset={flowDashOffsetWorld}
                strokeOpacity={0.45}
              />
              <line
                x1={activeGuideData.basePt.x}
                y1={activeGuideData.curPt.y}
                x2={activeGuideData.curPt.x}
                y2={activeGuideData.curPt.y}
                stroke={purpleStroke}
                strokeWidth={1.05 / safeK}
                strokeDasharray={`${5 / safeK},${3 / safeK}`}
                strokeDashoffset={flowDashOffsetWorld}
                strokeOpacity={0.45}
              />
            </>
          )}

          {/* Diagonal principal roxa de (X0, Y0) -> (X, Y) com fluxo contínuo */}
          <line
            x1={activeGuideData.basePt.x}
            y1={activeGuideData.basePt.y}
            x2={activeGuideData.curPt.x}
            y2={activeGuideData.curPt.y}
            stroke={purpleStroke}
            strokeWidth={1.35 / safeK}
            strokeDasharray={`${5 / safeK},${3 / safeK}`}
            strokeDashoffset={flowDashOffsetWorld}
            strokeOpacity={0.95}
          />

          {/* CRUZ TÉCNICA EM FORMATO DE MAIS (+) ROXA PONTILHADA NO PONTO DIAGONAL DE ENCONTRO (X, Y) */}
          {activeMeetingCross && (
            <g aria-label="Cruz Roxa Pontilhada no Ponto de Encontro">
              <line
                x1={activeGuideData.curPt.x - activeMeetingCross.armX}
                y1={activeGuideData.curPt.y}
                x2={activeGuideData.curPt.x + activeMeetingCross.armX}
                y2={activeGuideData.curPt.y}
                stroke={purpleStroke}
                strokeWidth={1.6 / safeK}
                strokeDasharray={`${4 / safeK},${3 / safeK}`}
                strokeDashoffset={flowDashOffsetWorld}
              />
              <line
                x1={activeGuideData.curPt.x}
                y1={activeGuideData.curPt.y - activeMeetingCross.armY}
                x2={activeGuideData.curPt.x}
                y2={activeGuideData.curPt.y + activeMeetingCross.armY}
                stroke={purpleStroke}
                strokeWidth={1.6 / safeK}
                strokeDasharray={`${4 / safeK},${3 / safeK}`}
                strokeDashoffset={flowDashOffsetWorld}
              />
              <circle
                cx={activeGuideData.curPt.x}
                cy={activeGuideData.curPt.y}
                r={2.2 / safeK}
                fill={purpleStroke}
              />
            </g>
          )}
        </g>
      )}

      {/* =====================================================================
          2. MODO AZUL EXCLUSIVO ("blue_line"): REFERÊNCIA DE CRIAÇÃO DE LINHA
             Funciona imediatamente em qualquer ângulo livre (0° a 360°)
          ===================================================================== */}
      {showBlueGuides && activeGuideData && (
        <g aria-label="Referência de Criação de Linha Azul">
          {/* Linhas auxiliares de cateto (ΔX horizontal e ΔY vertical) com fluxo direcional */}
          {(activeGuideData.absDx > 0.5 / safeK || activeGuideData.absDy > 0.5 / safeK) && (
            <>
              {/* Cateto Horizontal ΔX: (X0, Y0) -> (X, Y0) */}
              <line
                x1={activeGuideData.basePt.x}
                y1={activeGuideData.basePt.y}
                x2={activeGuideData.cornerPt.x}
                y2={activeGuideData.cornerPt.y}
                stroke={blueProj}
                strokeWidth={1.2 / safeK}
                strokeDasharray={`${5 / safeK},${3 / safeK}`}
                strokeDashoffset={flowDashOffsetWorld}
              />
              {/* Cateto Vertical ΔY: (X, Y0) -> (X, Y) */}
              <line
                x1={activeGuideData.cornerPt.x}
                y1={activeGuideData.cornerPt.y}
                x2={activeGuideData.curPt.x}
                y2={activeGuideData.curPt.y}
                stroke={blueProj}
                strokeWidth={1.2 / safeK}
                strokeDasharray={`${5 / safeK},${3 / safeK}`}
                strokeDashoffset={flowDashOffsetWorld}
              />
              {/* Indicador técnico de ângulo reto (90°) entre ΔX e ΔY */}
              {activeGuideData.absDx > 10 / safeK && activeGuideData.absDy > 10 / safeK && (
                <polyline
                  points={`${
                    activeGuideData.cornerPt.x -
                    Math.sign(activeGuideData.curPt.x - activeGuideData.basePt.x) * (5.5 / safeK)
                  },${activeGuideData.cornerPt.y} ${
                    activeGuideData.cornerPt.x -
                    Math.sign(activeGuideData.curPt.x - activeGuideData.basePt.x) * (5.5 / safeK)
                  },${
                    activeGuideData.cornerPt.y +
                    Math.sign(activeGuideData.curPt.y - activeGuideData.basePt.y) * (5.5 / safeK)
                  } ${activeGuideData.cornerPt.x},${
                    activeGuideData.cornerPt.y +
                    Math.sign(activeGuideData.curPt.y - activeGuideData.basePt.y) * (5.5 / safeK)
                  }`}
                  fill="none"
                  stroke={blueProj}
                  strokeWidth={1.0 / safeK}
                />
              )}
            </>
          )}

          {/* Arco indicador de ângulo livre ∠ (°) partindo de (X0, Y0) */}
          {activeGuideData.totalLen > 18 / safeK && (
            <path
              d={describeAngleArc(
                activeGuideData.basePt,
                Math.min(Math.max(22 / safeK, activeGuideData.totalLen * 0.22), 38 / safeK),
                activeGuideData.angleDeg,
              )}
              fill="none"
              stroke={blueMain}
              strokeWidth={1.1 / safeK}
              strokeDasharray={`${3 / safeK},${2.5 / safeK}`}
              strokeOpacity={0.75}
            />
          )}

          {/* Linha principal inclinada (hipotenusa) ligando (X0, Y0) -> (X, Y) em qualquer ângulo livre com fluxo direcional */}
          <line
            x1={activeGuideData.basePt.x}
            y1={activeGuideData.basePt.y}
            x2={activeGuideData.curPt.x}
            y2={activeGuideData.curPt.y}
            stroke={blueMain}
            strokeWidth={1.65 / safeK}
            strokeDasharray={`${6 / safeK},${3.5 / safeK}`}
            strokeDashoffset={flowDashOffsetWorld}
            strokeOpacity={0.98}
          />

          {/* Marcador técnico no Ponto Final (X, Y) da linha inclinada */}
          <circle
            cx={activeGuideData.curPt.x}
            cy={activeGuideData.curPt.y}
            r={3.5 / safeK}
            fill={isDark ? "#090D16" : "#FFFFFF"}
            stroke={blueMain}
            strokeWidth={1.6 / safeK}
          />
          <circle
            cx={activeGuideData.curPt.x}
            cy={activeGuideData.curPt.y}
            r={1.5 / safeK}
            fill={blueMain}
          />
        </g>
      )}

      {/* =====================================================================
          3. BOLHAS DE MEDIDA ORGANIZADAS E LIVRES DE COLISÃO (MODO ATIVO)
          ===================================================================== */}
      {(showPurpleGuides || showBlueGuides) &&
        activeGuideData &&
        activeGuideData.bubbles.map((b) => {
          const isPurple = showPurpleGuides;
          const borderColor = b.locked
            ? "#F59E0B"
            : isPurple
              ? purpleStroke
              : blueMain;
          const textColor = b.locked
            ? isDark
              ? "#FDE68A"
              : "#B45309"
            : isPurple
              ? isDark
                ? "#E9D5FF"
                : "#6B21A8"
              : isDark
                ? "#7DD3FC"
                : "#0369A1";

          return (
            <g key={b.id}>
              {/* Linha de chamada discreta ligando a âncora à bolha deslocada */}
              <line
                x1={b.anchor.x}
                y1={b.anchor.y}
                x2={b.pos.x}
                y2={b.pos.y}
                stroke={borderColor}
                strokeWidth={0.85 / safeK}
                strokeOpacity={0.45}
                strokeDasharray={`${2 / safeK},${2 / safeK}`}
              />
              <g
                transform={`translate(${b.pos.x}, ${b.pos.y})`}
                className={
                  isMultitouchNavigating
                    ? "pointer-events-none"
                    : "pointer-events-auto cursor-pointer"
                }
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => handleBubbleTap(b, e)}
              >
                <rect
                  x={-b.widthWorld / 2}
                  y={-b.heightWorld / 2}
                  width={b.widthWorld}
                  height={b.heightWorld}
                  rx={b.heightWorld / 2}
                  fill={bgBadge}
                  stroke={borderColor}
                  strokeWidth={(b.locked ? 1.55 : 1.25) / safeK}
                />
                <text
                  x={0}
                  y={3.2 / safeK}
                  fill={textColor}
                  fontSize={8.5 / safeK}
                  fontWeight="bold"
                  fontFamily="ui-monospace, monospace"
                  textAnchor="middle"
                >
                  {b.text}
                </text>
              </g>
            </g>
          );
        })}

      {/* =====================================================================
          4. CENTRO DE REFERÊNCIA CLÁSSICO EM VERMELHO CARMESIM (#DC143C)
             - Ponto central sólido preenchido (r = 4px)
             - Círculo interno contínuo (r = 7px, strokeWidth: 1.8px)
             - Anel externo tracejado amplo (r = 18px, stroke-dasharray: 4, 3, strokeWidth: 1.5px)
             - Toque no centro (44x44px) abre a barra [ ✓ Confirmar ] [ ✕ Cancelar ]
          ===================================================================== */}
      {effectiveOriginPt && interactionGuideMode !== "off" && (
        <g aria-label="Centro de Referência Clássico em Vermelho Carmesim">
          {/* Anel externo tracejado amplo (r = 18px, stroke-dasharray: 4, 3, strokeWidth: 1.5px, #DC143C) */}
          <circle
            cx={effectiveOriginPt.x}
            cy={effectiveOriginPt.y}
            r={18 / safeK}
            fill="none"
            stroke={crimsonMain}
            strokeWidth={1.5 / safeK}
            strokeDasharray={`${4 / safeK},${3 / safeK}`}
            strokeDashoffset={flowDashOffsetWorld}
          />
          {/* Círculo interno contínuo (r = 7px, strokeWidth: 1.8px, #DC143C) */}
          <circle
            cx={effectiveOriginPt.x}
            cy={effectiveOriginPt.y}
            r={7 / safeK}
            fill="none"
            stroke={crimsonMain}
            strokeWidth={1.8 / safeK}
          />
          {/* Ponto central sólido preenchido (r = 4px) com fino anel de contraste */}
          <circle
            cx={effectiveOriginPt.x}
            cy={effectiveOriginPt.y}
            r={4 / safeK}
            fill={crimsonMain}
            stroke={isDark ? "#FFFFFF" : "#0F172A"}
            strokeWidth={1.0 / safeK}
          />

          {/* Gatilho de Toque Confortável (44 × 44 px => r = 22px) no Centro de Referência */}
          <circle
            cx={effectiveOriginPt.x}
            cy={effectiveOriginPt.y}
            r={22 / safeK}
            fill="transparent"
            className={
              isMultitouchNavigating
                ? "pointer-events-none"
                : "pointer-events-auto cursor-pointer"
            }
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (!isMultitouchNavigating) {
                setConfirmBarOpen((prev) => !prev);
              }
            }}
          />

          {/* BARRA FLUTUANTE COMPACTA DE CONFIRMAÇÃO: [ ✓ Confirmar ]  [ ✕ Cancelar ] */}
          {confirmBarOpen && curPt && (
            <g
              transform={`translate(${effectiveOriginPt.x}, ${
                effectiveOriginPt.y - 36 / safeK
              })`}
              className="pointer-events-auto"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {/* Fundo da barra flutuante */}
              <rect
                x={-86 / safeK}
                y={-14 / safeK}
                width={172 / safeK}
                height={28 / safeK}
                rx={8 / safeK}
                fill={isDark ? "rgba(9, 13, 22, 0.96)" : "rgba(255, 255, 255, 0.98)"}
                stroke={crimsonMain}
                strokeWidth={1.4 / safeK}
              />

              {/* Botão [ ✓ Confirmar ] */}
              <g
                transform={`translate(${-42 / safeK}, 0)`}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmBarOpen(false);
                  onConfirmReferenceAction?.(
                    effectiveOriginPt,
                    curPt,
                    interactionGuideMode,
                  );
                }}
              >
                <rect
                  x={-39 / safeK}
                  y={-10 / safeK}
                  width={78 / safeK}
                  height={20 / safeK}
                  rx={5 / safeK}
                  fill="#059669"
                />
                <text
                  x={0}
                  y={3.3 / safeK}
                  fill="#FFFFFF"
                  fontSize={8.5 / safeK}
                  fontWeight="bold"
                  fontFamily="ui-monospace, monospace"
                  textAnchor="middle"
                >
                  ✓ Confirmar
                </text>
              </g>

              {/* Botão [ ✕ Cancelar ] */}
              <g
                transform={`translate(${42 / safeK}, 0)`}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmBarOpen(false);
                  onCancelReferenceAction?.();
                }}
              >
                <rect
                  x={-39 / safeK}
                  y={-10 / safeK}
                  width={78 / safeK}
                  height={20 / safeK}
                  rx={5 / safeK}
                  fill={isDark ? "#334155" : "#E2E8F0"}
                />
                <text
                  x={0}
                  y={3.3 / safeK}
                  fill={isDark ? "#F8FAFC" : "#1E293B"}
                  fontSize={8.5 / safeK}
                  fontWeight="bold"
                  fontFamily="ui-monospace, monospace"
                  textAnchor="middle"
                >
                  ✕ Cancelar
                </text>
              </g>
            </g>
          )}
        </g>
      )}

      {/* =====================================================================
          5. DESTAQUE DA BORDA DE REFERÊNCIA ATIVA E COTAS DE AFASTAMENTO (SE ATIVA)
          ===================================================================== */}
      {activeEdge && (
        <g>
          <line
            x1={activeEdge.p1.x}
            y1={activeEdge.p1.y}
            x2={activeEdge.p2.x}
            y2={activeEdge.p2.y}
            stroke={blueMain}
            strokeWidth={2.6 / safeK}
            strokeLinecap="round"
          />
          <line
            x1={activeEdge.p1.x}
            y1={activeEdge.p1.y}
            x2={activeEdge.p2.x}
            y2={activeEdge.p2.y}
            stroke="#ffffff"
            strokeWidth={1.1 / safeK}
            strokeDasharray={`${4 / safeK},${4 / safeK}`}
          />

          <g transform={`translate(${activeEdge.midpoint.x}, ${activeEdge.midpoint.y})`}>
            <line
              x1={0}
              y1={0}
              x2={activeEdge.normal.x * (28 / safeK) * activeEdgeSide}
              y2={activeEdge.normal.y * (28 / safeK) * activeEdgeSide}
              stroke={blueMain}
              strokeWidth={1.8 / safeK}
            />
          </g>

          <g
            transform={`translate(${activeEdge.midpoint.x + activeEdge.normal.x * (38 / safeK) * activeEdgeSide}, ${
              activeEdge.midpoint.y + activeEdge.normal.y * (38 / safeK) * activeEdgeSide
            })`}
            className={
              isMultitouchNavigating
                ? "pointer-events-none"
                : "pointer-events-auto cursor-pointer"
            }
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (!isMultitouchNavigating) onInvertEdgeSide?.();
            }}
          >
            <rect
              x={-48 / safeK}
              y={-9 / safeK}
              width={96 / safeK}
              height={18 / safeK}
              rx={5 / safeK}
              fill={bgBadge}
              stroke={blueMain}
              strokeWidth={1.2 / safeK}
            />
            <text
              x={0}
              y={3.2 / safeK}
              fill={blueMain}
              fontSize={8.2 / safeK}
              fontWeight="bold"
              fontFamily="ui-monospace, monospace"
              textAnchor="middle"
            >
              BORDA {activeEdge.length.toFixed(1)} mm
            </text>
          </g>
        </g>
      )}

      {/* Cotas vivas de Borda Ativa */}
      {activeEdge &&
        liveDimensions.map((dim) => {
          const dx = dim.endPoint.x - dim.startPoint.x;
          const dy = dim.endPoint.y - dim.startPoint.y;
          const len = Math.hypot(dx, dy);
          if (len < 0.5) return null;

          const isOffset = dim.kind === "offset";
          const strokeColor = isOffset ? amber : blueMain;

          return (
            <g key={dim.id}>
              <line
                x1={dim.startPoint.x}
                y1={dim.startPoint.y}
                x2={dim.endPoint.x}
                y2={dim.endPoint.y}
                stroke={strokeColor}
                strokeWidth={1.25 / safeK}
                strokeDasharray={`${4 / safeK},${3 / safeK}`}
              />
              <circle cx={dim.startPoint.x} cy={dim.startPoint.y} r={2.2 / safeK} fill={strokeColor} />
              <circle cx={dim.endPoint.x} cy={dim.endPoint.y} r={2.2 / safeK} fill={strokeColor} />

              <g
                transform={`translate(${dim.midPoint.x}, ${dim.midPoint.y})`}
                className={
                  isMultitouchNavigating
                    ? "pointer-events-none"
                    : "pointer-events-auto cursor-pointer"
                }
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isMultitouchNavigating && dim.isEditable && onDimensionClick) {
                    onDimensionClick(dim, { x: e.clientX, y: e.clientY });
                  }
                }}
              >
                <rect
                  x={-34 / safeK}
                  y={-9 / safeK}
                  width={68 / safeK}
                  height={18 / safeK}
                  rx={9 / safeK}
                  fill={bgBadge}
                  stroke={strokeColor}
                  strokeWidth={1.3 / safeK}
                />
                <text
                  x={0}
                  y={3.2 / safeK}
                  fill={strokeColor}
                  fontSize={8.5 / safeK}
                  fontWeight="bold"
                  fontFamily="ui-monospace, monospace"
                  textAnchor="middle"
                >
                  {dim.label}
                </text>
              </g>
            </g>
          );
        })}
    </g>
  );
}

function showOriginForMode(
  mode: InteractionGuideMode,
  startPt: Vec2 | null,
  refPt: Vec2 | null,
): Vec2 | null {
  if (mode === "off") return null;
  if (mode === "blue_line") {
    return startPt ?? refPt;
  }
  return refPt ?? startPt;
}

function describeAngleArc(center: Vec2, radius: number, angleDeg: number): string {
  const clampedAngle = Math.max(1, Math.min(359, angleDeg));
  const endRad = (clampedAngle * Math.PI) / 180;
  const startX = center.x + radius;
  const startY = center.y;
  const endX = center.x + radius * Math.cos(endRad);
  const endY = center.y - radius * Math.sin(endRad);
  const largeArcFlag = clampedAngle > 180 ? 1 : 0;
  return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${endX} ${endY}`;
}

function dxWOffset(widthWorld: number, safeK: number): number {
  return widthWorld / 2 + 8 / safeK;
}
