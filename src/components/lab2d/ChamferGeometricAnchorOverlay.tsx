/**
 * CALDRA CHAMFER — OVERLAY VETORIAL DO MARCO GEOMÉTRICO / ÂNCORA (A–E)
 *
 * Renderiza no SVG do Canvas 2D:
 *  - 4.1 Cruz Adaptativa Graduada em Ciano/Violeta Técnico + Núcleo Invariante ao Zoom (44px touch ring)
 *        + Rótulos interativos A–E + Eixos rotacionáveis X'/Y' + HUD Compacto (ΔX', ΔY', d, θ)
 *  - 4.2 Candidato destacado do Smart Pick (<= 24px) antes de confirmar
 *  - 4.4 Vetor relacional A -> B (ΔX, ΔY, d, ∠) e pontos de snap equidistantes do Divisor de Vão (÷N)
 *  - 4.5.1 Guias Infinitas de Construção (até 8) + Encontros Automáticos (Guia × Guia e Guia × Entidade)
 *  - 4.5.2 Radar de Bordas (chips interativos até as 4 bordas da Área de Trabalho e entidades em X'/Y')
 *  - 4.5.3 Prévia em Tempo Real do Eco (Espelho X', Y', X'+Y', Radial N=6 e Linear)
 */

import React, { useMemo } from "react";
import type { Vec2 } from "@/lib/geometry/types";
import type { Entity } from "@/lib/lab2d/core";
import {
  type AnchorLabel,
  type AnchorPointSymbolKind,
  type EdgeRadarChip,
  type GeometricAnchor,
  type ReferenceServiceState,
  type SmartPickCandidate,
  ANCHOR_CYAN_PRIMARY,
  ANCHOR_VIOLET_PRIMARY,
  ANCHOR_VIOLET_ACCENT,
  ReferenceService,
  anchorLocalToWorld,
  anchorWorldToLocal,
} from "@/lib/lab2d/referenceService";

export interface ChamferGeometricAnchorOverlayProps {
  referenceState: ReferenceServiceState;
  entities: Entity[];
  draft: Entity | null;
  cursor: Vec2;
  viewK: number;
  isDark: boolean;
  isAnchorToolActive: boolean;
  smartPickPreview: SmartPickCandidate | null;
  workspaceBounds: { x: number; y: number; w: number; h: number };
  onSelectAnchor?: (id: AnchorLabel) => void;
  onCaptureExtremity?: (pt: Vec2, anchor: GeometricAnchor) => void;
  onRadarChipAction?: (chip: EdgeRadarChip, createDimension: boolean) => void;
}

function renderAnchorSymbol(
  symbolKind: AnchorPointSymbolKind,
  pt: Vec2,
  safeK: number,
  strokeColor: string,
) {
  switch (symbolKind) {
    case "center":
    case "centroid":
      return (
        <circle
          cx={pt.x}
          cy={pt.y}
          r={5.2 / safeK}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1.5 / safeK}
        />
      );
    case "midpoint":
      return (
        <polygon
          points={`${pt.x},${pt.y - 5.5 / safeK} ${pt.x - 4.8 / safeK},${pt.y + 4 / safeK} ${pt.x + 4.8 / safeK},${pt.y + 4 / safeK}`}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1.4 / safeK}
        />
      );
    case "intersection":
      return (
        <>
          <line
            x1={pt.x - 4.8 / safeK}
            y1={pt.y - 4.8 / safeK}
            x2={pt.x + 4.8 / safeK}
            y2={pt.y + 4.8 / safeK}
            stroke={strokeColor}
            strokeWidth={1.5 / safeK}
          />
          <line
            x1={pt.x + 4.8 / safeK}
            y1={pt.y - 4.8 / safeK}
            x2={pt.x - 4.8 / safeK}
            y2={pt.y + 4.8 / safeK}
            stroke={strokeColor}
            strokeWidth={1.5 / safeK}
          />
        </>
      );
    case "tangent":
    case "quadrant":
      return (
        <>
          <circle
            cx={pt.x}
            cy={pt.y + 1.8 / safeK}
            r={3.8 / safeK}
            fill="none"
            stroke={strokeColor}
            strokeWidth={1.3 / safeK}
          />
          <line
            x1={pt.x - 6 / safeK}
            y1={pt.y - 2.2 / safeK}
            x2={pt.x + 6 / safeK}
            y2={pt.y - 2.2 / safeK}
            stroke={ANCHOR_CYAN_PRIMARY}
            strokeWidth={1.4 / safeK}
          />
        </>
      );
    case "vertex":
    default:
      return (
        <polygon
          points={`${pt.x},${pt.y - 5.2 / safeK} ${pt.x + 5.2 / safeK},${pt.y} ${pt.x},${pt.y + 5.2 / safeK} ${pt.x - 5.2 / safeK},${pt.y}`}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1.4 / safeK}
        />
      );
  }
}

export const ChamferGeometricAnchorOverlay: React.FC<ChamferGeometricAnchorOverlayProps> = ({
  referenceState,
  entities,
  draft,
  cursor,
  viewK,
  isDark,
  isAnchorToolActive,
  smartPickPreview,
  workspaceBounds,
  onSelectAnchor,
  onCaptureExtremity,
  onRadarChipAction,
}) => {
  const safeK = Number.isFinite(viewK) && viewK > 0 ? viewK : 1;
  const activeAnchor = useMemo(
    () =>
      referenceState.anchors.find((a) => a.id === referenceState.activeAnchorId) ??
      referenceState.anchors[referenceState.anchors.length - 1] ??
      null,
    [referenceState.anchors, referenceState.activeAnchorId],
  );

  const pairMetrics = useMemo(() => {
    if (referenceState.anchors.length < 2) return null;
    return ReferenceService.computeAnchorPairMetrics();
  }, [referenceState.anchors]);

  const radarData = useMemo(() => {
    if (!referenceState.radarEnabled || !activeAnchor) return null;
    return ReferenceService.computeEdgeRadar(entities, workspaceBounds, activeAnchor);
  }, [referenceState.radarEnabled, activeAnchor, entities, workspaceBounds]);

  const echoPreviewEntities = useMemo(() => {
    if (!activeAnchor || referenceState.echo.mode === "off") return [];
    const sources = draft ? [draft] : entities.slice(-1);
    return ReferenceService.computeEchoEntities(sources, activeAnchor, referenceState.echo);
  }, [activeAnchor, referenceState.echo, draft, entities]);

  const bgBadge = isDark ? "rgba(8, 12, 22, 0.94)" : "rgba(255, 255, 255, 0.96)";

  return (
    <g
      className="select-none pointer-events-none"
      data-testid="chamfer-geometric-anchor-overlay"
      aria-label="Overlay Marco Geométrico e Âncora A–E"
    >
      {/* =====================================================================
          1. GUIAS INFINITAS DE CONSTRUÇÃO (ATÉ 8) + ENCONTROS AUTOMÁTICOS
          ===================================================================== */}
      {referenceState.guides.map((guide) => {
        const span = 12000 / safeK;
        const x1 = guide.origin.x - guide.direction.x * span;
        const y1 = guide.origin.y - guide.direction.y * span;
        const x2 = guide.origin.x + guide.direction.x * span;
        const y2 = guide.origin.y + guide.direction.y * span;
        const isAxisX = guide.kind === "axis_x" || guide.kind === "parallel_offset";
        return (
          <g key={guide.id} data-testid={`anchor-guide-${guide.id}`}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={isAxisX ? ANCHOR_CYAN_PRIMARY : ANCHOR_VIOLET_PRIMARY}
              strokeWidth={1.15 / safeK}
              strokeDasharray={`${6 / safeK},${4 / safeK}`}
              strokeOpacity={0.75}
            />
          </g>
        );
      })}

      {/* Encontros Automáticos (Guia × Guia e Guia × Entidade) */}
      {referenceState.meetings.map((meet) => (
        <g
          key={meet.id}
          data-testid={`anchor-meeting-${meet.id}`}
          aria-label={`Encontro Magnético: ${meet.label}`}
        >
          <circle
            cx={meet.point.x}
            cy={meet.point.y}
            r={6 / safeK}
            fill="rgba(6, 182, 212, 0.16)"
            stroke={ANCHOR_CYAN_PRIMARY}
            strokeWidth={1.3 / safeK}
          />
          <line
            x1={meet.point.x - 4 / safeK}
            y1={meet.point.y - 4 / safeK}
            x2={meet.point.x + 4 / safeK}
            y2={meet.point.y + 4 / safeK}
            stroke={ANCHOR_VIOLET_ACCENT}
            strokeWidth={1.4 / safeK}
          />
          <line
            x1={meet.point.x + 4 / safeK}
            y1={meet.point.y - 4 / safeK}
            x2={meet.point.x - 4 / safeK}
            y2={meet.point.y + 4 / safeK}
            stroke={ANCHOR_VIOLET_ACCENT}
            strokeWidth={1.4 / safeK}
          />
        </g>
      ))}

      {/* =====================================================================
          2. PRÉVIA VIVA DO MODO ECO (ESPELHO X'/Y', RADIAL N=6, LINEAR)
          ===================================================================== */}
      {echoPreviewEntities.map((ent) => {
        if (ent.type === "line") {
          return (
            <line
              key={ent.id}
              x1={ent.x1}
              y1={ent.y1}
              x2={ent.x2}
              y2={ent.y2}
              stroke={ANCHOR_CYAN_PRIMARY}
              strokeWidth={1.6 / safeK}
              strokeDasharray={`${5 / safeK},${3 / safeK}`}
              strokeOpacity={0.85}
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
              fill="rgba(6, 182, 212, 0.08)"
              stroke={ANCHOR_CYAN_PRIMARY}
              strokeWidth={1.6 / safeK}
              strokeDasharray={`${5 / safeK},${3 / safeK}`}
              strokeOpacity={0.85}
            />
          );
        }
        if (ent.type === "polyline" && ent.pts.length > 1) {
          const ptsStr = ent.pts.map((p) => `${p.x},${p.y}`).join(" ");
          return ent.closed ? (
            <polygon
              key={ent.id}
              points={ptsStr}
              fill="rgba(168, 85, 247, 0.06)"
              stroke={ANCHOR_CYAN_PRIMARY}
              strokeWidth={1.6 / safeK}
              strokeDasharray={`${5 / safeK},${3 / safeK}`}
              strokeOpacity={0.85}
            />
          ) : (
            <polyline
              key={ent.id}
              points={ptsStr}
              fill="none"
              stroke={ANCHOR_CYAN_PRIMARY}
              strokeWidth={1.6 / safeK}
              strokeDasharray={`${5 / safeK},${3 / safeK}`}
              strokeOpacity={0.85}
            />
          );
        }
        return null;
      })}

      {/* =====================================================================
          3. RELAÇÃO ENTRE MARCOS (A -> B) E DIVISOR DE VÃO (÷N)
          ===================================================================== */}
      {pairMetrics && (
        <g data-testid="anchor-pair-relation">
          <line
            x1={pairMetrics.fromAnchor.origin.x}
            y1={pairMetrics.fromAnchor.origin.y}
            x2={pairMetrics.toAnchor.origin.x}
            y2={pairMetrics.toAnchor.origin.y}
            stroke={ANCHOR_VIOLET_ACCENT}
            strokeWidth={1.3 / safeK}
            strokeDasharray={`${5 / safeK},${3.5 / safeK}`}
            strokeOpacity={0.8}
          />
          <g
            transform={`translate(${pairMetrics.midpoint.x}, ${pairMetrics.midpoint.y - 12 / safeK})`}
          >
            <rect
              x={-72 / safeK}
              y={-8 / safeK}
              width={144 / safeK}
              height={16 / safeK}
              rx={5 / safeK}
              fill={bgBadge}
              stroke={ANCHOR_VIOLET_PRIMARY}
              strokeWidth={1 / safeK}
            />
            <text
              x={0}
              y={3 / safeK}
              fill={isDark ? "#E9D5FF" : "#6B21A8"}
              fontSize={7.4 / safeK}
              fontWeight="bold"
              fontFamily="ui-monospace, monospace"
              textAnchor="middle"
            >
              {pairMetrics.fromAnchor.id}→{pairMetrics.toAnchor.id}: d={pairMetrics.distance.toFixed(1)} · ∠{pairMetrics.angleDeg.toFixed(1)}°
            </text>
          </g>
        </g>
      )}

      {referenceState.spanDivision &&
        referenceState.spanDivision.points.map((pt, idx) => (
          <g
            key={`span-div-${idx}`}
            data-testid={`anchor-span-point-${idx + 1}`}
            aria-label={`Ponto de Divisão ${idx + 1}/${referenceState.spanDivision!.divisionsN}`}
          >
            <circle
              cx={pt.x}
              cy={pt.y}
              r={6.5 / safeK}
              fill="rgba(168, 85, 247, 0.22)"
              stroke={ANCHOR_CYAN_PRIMARY}
              strokeWidth={1.4 / safeK}
            />
            <circle cx={pt.x} cy={pt.y} r={2 / safeK} fill="#FFFFFF" />
            <text
              x={pt.x}
              y={pt.y - 9 / safeK}
              fill={ANCHOR_CYAN_PRIMARY}
              fontSize={7.2 / safeK}
              fontWeight="bold"
              fontFamily="ui-monospace, monospace"
              textAnchor="middle"
            >
              {idx + 1}/{referenceState.spanDivision!.divisionsN}
            </text>
          </g>
        ))}

      {/* =====================================================================
          4. RADAR DE BORDAS (CHIPS INTERATIVOS ATÉ AS 4 BORDAS E PEÇAS)
          ===================================================================== */}
      {radarData &&
        [...radarData.workspaceChips, ...radarData.entityChips].map((chip) => {
          const midX = (chip.fromPoint.x + chip.toPoint.x) * 0.5;
          const midY = (chip.fromPoint.y + chip.toPoint.y) * 0.5;
          const isEntity = chip.kind === "entity_edge";
          const color = isEntity ? ANCHOR_CYAN_PRIMARY : ANCHOR_VIOLET_ACCENT;
          return (
            <g key={chip.id} data-testid={`radar-chip-${chip.id}`}>
              <line
                x1={chip.fromPoint.x}
                y1={chip.fromPoint.y}
                x2={chip.toPoint.x}
                y2={chip.toPoint.y}
                stroke={color}
                strokeWidth={1.1 / safeK}
                strokeDasharray={`${3.5 / safeK},${3 / safeK}`}
                strokeOpacity={0.75}
              />
              <circle cx={chip.toPoint.x} cy={chip.toPoint.y} r={3 / safeK} fill={color} />
              <g
                transform={`translate(${midX}, ${midY})`}
                className="pointer-events-auto cursor-pointer"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onRadarChipAction?.(chip, e.shiftKey || isEntity);
                }}
              >
                <rect
                  x={-48 / safeK}
                  y={-7.5 / safeK}
                  width={96 / safeK}
                  height={15 / safeK}
                  rx={4 / safeK}
                  fill={bgBadge}
                  stroke={color}
                  strokeWidth={1.1 / safeK}
                />
                <text
                  x={0}
                  y={2.8 / safeK}
                  fill={isDark ? (isEntity ? "#67E8F9" : "#E9D5FF") : isEntity ? "#0E7490" : "#6B21A8"}
                  fontSize={7.2 / safeK}
                  fontWeight="bold"
                  fontFamily="ui-monospace, monospace"
                  textAnchor="middle"
                >
                  {chip.directionLabel}: {chip.distanceMm.toFixed(1)}
                </text>
              </g>
            </g>
          );
        })}

      {/* =====================================================================
          5. PILHA DE MARCOS / ÂNCORAS (A–E): CRUZ ADAPTATIVA GRADUADA + NÚCLEO INVARIANTE
          ===================================================================== */}
      {referenceState.anchors.map((anchor) => {
        const isActive = activeAnchor?.id === anchor.id;
        const pt = anchor.origin;
        const armPxWorld = (isActive ? 42 : 26) / safeK;
        const minusXLen = Math.max(armPxWorld, Math.min(180 / safeK, anchor.adaptiveArms?.minusX ?? armPxWorld));
        const plusXLen = Math.max(armPxWorld, Math.min(180 / safeK, anchor.adaptiveArms?.plusX ?? armPxWorld));
        const minusYLen = Math.max(armPxWorld, Math.min(180 / safeK, anchor.adaptiveArms?.minusY ?? armPxWorld));
        const plusYLen = Math.max(armPxWorld, Math.min(180 / safeK, anchor.adaptiveArms?.plusY ?? armPxWorld));

        const xMinusPt = anchorLocalToWorld({ x: -minusXLen, y: 0 }, pt, anchor.thetaDeg);
        const xPlusPt = anchorLocalToWorld({ x: plusXLen, y: 0 }, pt, anchor.thetaDeg);
        const yMinusPt = anchorLocalToWorld({ x: 0, y: -minusYLen }, pt, anchor.thetaDeg);
        const yPlusPt = anchorLocalToWorld({ x: 0, y: plusYLen }, pt, anchor.thetaDeg);

        // Graduações da régua adaptativa em espaço de tela constante
        const tickCount = isActive ? 4 : 2;
        const ticks: { p1: Vec2; p2: Vec2; axis: "x" | "y" }[] = [];
        for (let t = 1; t <= tickCount; t++) {
          const stepWorld = (t * 10) / safeK;
          const halfTick = (t % 2 === 0 ? 4.2 : 2.6) / safeK;
          ticks.push(
            {
              p1: anchorLocalToWorld({ x: stepWorld, y: -halfTick }, pt, anchor.thetaDeg),
              p2: anchorLocalToWorld({ x: stepWorld, y: halfTick }, pt, anchor.thetaDeg),
              axis: "x",
            },
            {
              p1: anchorLocalToWorld({ x: -stepWorld, y: -halfTick }, pt, anchor.thetaDeg),
              p2: anchorLocalToWorld({ x: -stepWorld, y: halfTick }, pt, anchor.thetaDeg),
              axis: "x",
            },
            {
              p1: anchorLocalToWorld({ x: -halfTick, y: stepWorld }, pt, anchor.thetaDeg),
              p2: anchorLocalToWorld({ x: halfTick, y: stepWorld }, pt, anchor.thetaDeg),
              axis: "y",
            },
            {
              p1: anchorLocalToWorld({ x: -halfTick, y: -stepWorld }, pt, anchor.thetaDeg),
              p2: anchorLocalToWorld({ x: halfTick, y: -stepWorld }, pt, anchor.thetaDeg),
              axis: "y",
            },
          );
        }

        return (
          <g
            key={`anchor-node-${anchor.id}`}
            data-testid={`geometric-anchor-${anchor.id}`}
            aria-label={`Marco Geométrico Âncora ${anchor.id} (${anchor.badgeLabel})`}
          >
            {/* Anel de captura invariante ao zoom (44px de diâmetro -> r = 22 / safeK) */}
            <circle
              cx={pt.x}
              cy={pt.y}
              r={22 / safeK}
              fill={isActive ? "rgba(6, 182, 212, 0.09)" : "rgba(168, 85, 247, 0.05)"}
              stroke={isActive ? ANCHOR_CYAN_PRIMARY : ANCHOR_VIOLET_PRIMARY}
              strokeWidth={(isActive ? 1.4 : 1) / safeK}
              strokeDasharray={`${4 / safeK},${3 / safeK}`}
              className="pointer-events-auto cursor-pointer"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onSelectAnchor?.(anchor.id);
              }}
            />

            {/* Braço graduado do Eixo Local X' (Ciano Técnico) */}
            <line
              x1={xMinusPt.x}
              y1={xMinusPt.y}
              x2={xPlusPt.x}
              y2={xPlusPt.y}
              stroke={ANCHOR_CYAN_PRIMARY}
              strokeWidth={(isActive ? 2 : 1.4) / safeK}
              strokeLinecap="round"
            />

            {/* Braço graduado do Eixo Local Y' (Violeta Técnico) */}
            <line
              x1={yMinusPt.x}
              y1={yMinusPt.y}
              x2={yPlusPt.x}
              y2={yPlusPt.y}
              stroke={ANCHOR_VIOLET_PRIMARY}
              strokeWidth={(isActive ? 2 : 1.4) / safeK}
              strokeLinecap="round"
            />

            {/* Marcas de graduação da régua nos braços */}
            {ticks.map((tk, idx) => (
              <line
                key={`tick-${anchor.id}-${idx}`}
                x1={tk.p1.x}
                y1={tk.p1.y}
                x2={tk.p2.x}
                y2={tk.p2.y}
                stroke={tk.axis === "x" ? ANCHOR_CYAN_PRIMARY : ANCHOR_VIOLET_ACCENT}
                strokeWidth={1.15 / safeK}
              />
            ))}

            {/* Rótulos X' e Y' nas pontas da cruz ativa */}
            {isActive && (
              <>
                <text
                  x={xPlusPt.x + 7 / safeK}
                  y={xPlusPt.y + 3 / safeK}
                  fill={ANCHOR_CYAN_PRIMARY}
                  fontSize={8.5 / safeK}
                  fontWeight="bold"
                  fontFamily="ui-monospace, monospace"
                >
                  X&apos;{Math.abs(anchor.thetaDeg) > 0.05 ? ` (${anchor.thetaDeg.toFixed(0)}°)` : ""}
                </text>
                <text
                  x={yPlusPt.x + 6 / safeK}
                  y={yPlusPt.y + 3 / safeK}
                  fill={ANCHOR_VIOLET_ACCENT}
                  fontSize={8.5 / safeK}
                  fontWeight="bold"
                  fontFamily="ui-monospace, monospace"
                >
                  Y&apos;
                </text>
              </>
            )}

            {/* Pontas de captura rápida nos extremos da entidade */}
            {isActive &&
              (anchor.adaptiveArms?.extremities ?? []).slice(0, 4).map((extPt, i) => (
                <circle
                  key={`ext-${anchor.id}-${i}`}
                  cx={extPt.x}
                  cy={extPt.y}
                  r={4.2 / safeK}
                  fill={bgBadge}
                  stroke={ANCHOR_CYAN_PRIMARY}
                  strokeWidth={1.3 / safeK}
                  className="pointer-events-auto cursor-pointer"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCaptureExtremity?.(extPt, anchor);
                  }}
                />
              ))}

            {/* Símbolo central contextual conforme o ponto capturado (Vértice, Centro, Ponto Médio, Interseção, Tangência) */}
            {renderAnchorSymbol(
              anchor.symbolKind,
              pt,
              safeK,
              isActive ? ANCHOR_CYAN_PRIMARY : ANCHOR_VIOLET_ACCENT,
            )}

            {/* Núcleo central invariante ao zoom */}
            <circle
              cx={pt.x}
              cy={pt.y}
              r={2.5 / safeK}
              fill={isActive ? "#22D3EE" : "#E879F9"}
            />

            {/* Pílula Identificadora A, B, C, D, E */}
            <g
              transform={`translate(${pt.x + 15 / safeK}, ${pt.y - 15 / safeK})`}
              className="pointer-events-auto cursor-pointer"
              data-testid={`anchor-badge-${anchor.id}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onSelectAnchor?.(anchor.id);
              }}
            >
              <rect
                x={-11 / safeK}
                y={-8.5 / safeK}
                width={22 / safeK}
                height={17 / safeK}
                rx={5 / safeK}
                fill={isActive ? ANCHOR_CYAN_PRIMARY : "#7E22CE"}
                stroke="#FFFFFF"
                strokeWidth={1 / safeK}
              />
              <text
                x={0}
                y={3.2 / safeK}
                fill={isActive ? "#082F49" : "#FFFFFF"}
                fontSize={9 / safeK}
                fontWeight="900"
                fontFamily="ui-monospace, monospace"
                textAnchor="middle"
              >
                {anchor.id}
              </text>
            </g>
          </g>
        );
      })}

      {/* =====================================================================
          6. HUD COMPACTO DO MARCO ATIVO (ΔX', ΔY', d, θ DO CURSOR ATÉ A ÂNCORA)
          ===================================================================== */}
      {activeAnchor?.origin && cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y) && (
        (() => {
          const localCur = anchorWorldToLocal(cursor, activeAnchor.origin, activeAnchor.thetaDeg);
          const d = Math.hypot(localCur.x, localCur.y);
          const thetaLocal =
            d > 1e-4 ? (((Math.atan2(localCur.y, localCur.x) * 180) / Math.PI) + 360) % 360 : 0;

          if (d < 0.5 / safeK) return null;

          return (
            <g data-testid="active-anchor-live-hud">
              {/* Linha guia pontilhada da Âncora ativa até o cursor */}
              <line
                x1={activeAnchor.origin.x}
                y1={activeAnchor.origin.y}
                x2={cursor.x}
                y2={cursor.y}
                stroke={ANCHOR_CYAN_PRIMARY}
                strokeWidth={1.15 / safeK}
                strokeDasharray={`${4 / safeK},${3 / safeK}`}
                strokeOpacity={0.75}
              />
              <g
                transform={`translate(${activeAnchor.origin.x}, ${activeAnchor.origin.y + 30 / safeK})`}
              >
                <rect
                  x={-105 / safeK}
                  y={-8.5 / safeK}
                  width={210 / safeK}
                  height={17 / safeK}
                  rx={5 / safeK}
                  fill={bgBadge}
                  stroke={ANCHOR_CYAN_PRIMARY}
                  strokeWidth={1.1 / safeK}
                />
                <text
                  x={0}
                  y={3 / safeK}
                  fill={isDark ? "#67E8F9" : "#0E7490"}
                  fontSize={7.4 / safeK}
                  fontWeight="bold"
                  fontFamily="ui-monospace, monospace"
                  textAnchor="middle"
                >
                  [{activeAnchor.id}] ΔX&apos;:{localCur.x.toFixed(1)} ΔY&apos;:{localCur.y.toFixed(1)} d:{d.toFixed(1)} θ:{thetaLocal.toFixed(0)}°
                </text>
              </g>
            </g>
          );
        })()
      )}

      {/* =====================================================================
          7. PRÉVIA DO CANDIDATO SMART PICK (ANTES DE CONFIRMAR O TOQUE)
          ===================================================================== */}
      {isAnchorToolActive && smartPickPreview?.point && (
        <g
          data-testid="smart-pick-candidate-preview"
          aria-label={`Candidato Smart Pick: ${smartPickPreview.label}`}
        >
          <circle
            cx={smartPickPreview.point.x}
            cy={smartPickPreview.point.y}
            r={14 / safeK}
            fill="rgba(6, 182, 212, 0.16)"
            stroke={ANCHOR_CYAN_PRIMARY}
            strokeWidth={1.6 / safeK}
            strokeDasharray={`${4 / safeK},${2.5 / safeK}`}
          />
          {renderAnchorSymbol(
            smartPickPreview.symbolKind,
            smartPickPreview.point,
            safeK,
            "#22D3EE",
          )}
          <g
            transform={`translate(${smartPickPreview.point.x}, ${smartPickPreview.point.y - 20 / safeK})`}
          >
            <rect
              x={-56 / safeK}
              y={-8 / safeK}
              width={112 / safeK}
              height={16 / safeK}
              rx={4 / safeK}
              fill={bgBadge}
              stroke={ANCHOR_CYAN_PRIMARY}
              strokeWidth={1.1 / safeK}
            />
            <text
              x={0}
              y={3 / safeK}
              fill={isDark ? "#A5F3FC" : "#0E7490"}
              fontSize={7.5 / safeK}
              fontWeight="bold"
              fontFamily="ui-monospace, monospace"
              textAnchor="middle"
            >
              ⌖ {smartPickPreview.label}
            </text>
          </g>
        </g>
      )}
    </g>
  );
};
