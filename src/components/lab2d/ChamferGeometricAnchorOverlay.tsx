/**
 * CALDRA CHAMFER — OVERLAY VETORIAL LIMPO DA ÂNCORA LOCAL (X', Y') E DOS MARCOS GEOMÉTRICOS (A–E)
 *
 * Regras de Limpeza Visual (Zero Poluição sobre a Peça):
 *  - NENHUMA caixa retangular de texto flutuando sobre as linhas ou vértices da peça!
 *  - Exibe exclusivamente:
 *      1. Cruz fina e elegante dos eixos X', Y' na `⚓ Âncora Local` (com núcleo invariante ao zoom);
 *      2. Micro-pílula identificadora discreta (`18px × 18px`) com `⚓` ou `A, B, C, D, E` deslocada `14px` na diagonal (`+10px, -10px`) para nunca tapar o vértice;
 *      3. Nós luminosos de divisão (`÷N`) em losango/círculo ciano e Ponto Médio (`A–B`);
 *      4. Linhas finas tracejadas de Guia Infinita e marcadores de Encontro (`✕`);
 *      5. Prévia em tempo real do modo `Eco` (`Espelho X'`, `Y'`, `X'+Y'`, `Radial N`).
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
  isValidFiniteVec2,
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
          r={4.8 / safeK}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1.4 / safeK}
        />
      );
    case "midpoint":
      return (
        <polygon
          points={`${pt.x},${pt.y - 5 / safeK} ${pt.x - 4.4 / safeK},${pt.y + 3.6 / safeK} ${pt.x + 4.4 / safeK},${pt.y + 3.6 / safeK}`}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1.35 / safeK}
        />
      );
    case "intersection":
      return (
        <>
          <line
            x1={pt.x - 4.4 / safeK}
            y1={pt.y - 4.4 / safeK}
            x2={pt.x + 4.4 / safeK}
            y2={pt.y + 4.4 / safeK}
            stroke={strokeColor}
            strokeWidth={1.4 / safeK}
          />
          <line
            x1={pt.x + 4.4 / safeK}
            y1={pt.y - 4.4 / safeK}
            x2={pt.x - 4.4 / safeK}
            y2={pt.y + 4.4 / safeK}
            stroke={strokeColor}
            strokeWidth={1.4 / safeK}
          />
        </>
      );
    case "tangent":
    case "quadrant":
      return (
        <polygon
          points={`${pt.x},${pt.y - 4.8 / safeK} ${pt.x + 4.8 / safeK},${pt.y} ${pt.x},${pt.y + 4.8 / safeK} ${pt.x - 4.8 / safeK},${pt.y}`}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1.35 / safeK}
        />
      );
    case "vertex":
    default:
      return (
        <polygon
          points={`${pt.x},${pt.y - 4.8 / safeK} ${pt.x + 4.8 / safeK},${pt.y} ${pt.x},${pt.y + 4.8 / safeK} ${pt.x - 4.8 / safeK},${pt.y}`}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1.35 / safeK}
        />
      );
  }
}

export const ChamferGeometricAnchorOverlay: React.FC<ChamferGeometricAnchorOverlayProps> = ({
  referenceState,
  entities,
  draft,
  viewK,
  isAnchorToolActive,
  smartPickPreview,
  workspaceBounds,
  onSelectAnchor,
}) => {
  const safeK = Number.isFinite(viewK) && viewK > 0 ? viewK : 1;

  const localAnchor = useMemo(
    () =>
      referenceState.localAnchor && isValidFiniteVec2(referenceState.localAnchor.origin)
        ? referenceState.localAnchor
        : null,
    [referenceState.localAnchor],
  );

  const validLandmarks = useMemo(
    () =>
      (referenceState.landmarks ?? []).filter((lm) => lm && isValidFiniteVec2(lm.origin)),
    [referenceState.landmarks],
  );

  const activeAnchorForOps = useMemo(
    () =>
      localAnchor ??
      validLandmarks.find((a) => a.id === referenceState.activeLandmarkId) ??
      validLandmarks[validLandmarks.length - 1] ??
      null,
    [localAnchor, validLandmarks, referenceState.activeLandmarkId],
  );

  const pairMetrics = useMemo(() => {
    if (validLandmarks.length < 2) return null;
    return ReferenceService.computeAnchorPairMetrics();
  }, [validLandmarks]);

  const radarData = useMemo(() => {
    if (!referenceState.radarEnabled || !activeAnchorForOps) return null;
    return ReferenceService.computeEdgeRadar(entities, workspaceBounds, activeAnchorForOps);
  }, [referenceState.radarEnabled, activeAnchorForOps, entities, workspaceBounds]);

  const echoPreviewEntities = useMemo(() => {
    if (!activeAnchorForOps || referenceState.echo.mode === "off") return [];
    const sources = draft ? [draft] : entities.slice(-1);
    return ReferenceService.computeEchoEntities(sources, activeAnchorForOps, referenceState.echo);
  }, [activeAnchorForOps, referenceState.echo, draft, entities]);

  // Offset de 14px na diagonal (~10px em X e -10px em Y no espaço de tela) para a micro-pílula 18x18px
  const diagOffsetWorld = 10 / safeK;
  const pillSizeWorld = 18 / safeK;
  const halfPillWorld = 9 / safeK;

  return (
    <g
      className="select-none pointer-events-none"
      data-testid="chamfer-geometric-anchor-overlay"
      aria-label="Overlay Marco Geométrico e Âncora A–E"
    >
      {/* =====================================================================
          1. GUIAS INFINITAS DE CONSTRUÇÃO + ENCONTROS AUTOMÁTICOS (✕)
          ===================================================================== */}
      {referenceState.guides.map((guide) => {
        if (!isValidFiniteVec2(guide.origin)) return null;
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
              strokeOpacity={0.78}
            />
          </g>
        );
      })}

      {/* Encontros Automáticos (Guia × Guia e Guia × Entidade) */}
      {referenceState.meetings.map((meet) => {
        if (!isValidFiniteVec2(meet.point)) return null;
        return (
          <g
            key={meet.id}
            data-testid={`anchor-meeting-${meet.id}`}
            aria-label={`Encontro Magnético: ${meet.label}`}
          >
            <circle
              cx={meet.point.x}
              cy={meet.point.y}
              r={5.5 / safeK}
              fill="rgba(6, 182, 212, 0.16)"
              stroke={ANCHOR_CYAN_PRIMARY}
              strokeWidth={1.25 / safeK}
            />
            <line
              x1={meet.point.x - 3.6 / safeK}
              y1={meet.point.y - 3.6 / safeK}
              x2={meet.point.x + 3.6 / safeK}
              y2={meet.point.y + 3.6 / safeK}
              stroke={ANCHOR_VIOLET_ACCENT}
              strokeWidth={1.35 / safeK}
            />
            <line
              x1={meet.point.x + 3.6 / safeK}
              y1={meet.point.y - 3.6 / safeK}
              x2={meet.point.x - 3.6 / safeK}
              y2={meet.point.y + 3.6 / safeK}
              stroke={ANCHOR_VIOLET_ACCENT}
              strokeWidth={1.35 / safeK}
            />
          </g>
        );
      })}

      {/* =====================================================================
          2. PRÉVIA EM TEMPO REAL DO MODO ECO (ESPELHO X'/Y', X'+Y', RADIAL N)
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
              strokeWidth={1.5 / safeK}
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
              strokeWidth={1.5 / safeK}
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
              strokeWidth={1.5 / safeK}
              strokeDasharray={`${5 / safeK},${3 / safeK}`}
              strokeOpacity={0.85}
            />
          ) : (
            <polyline
              key={ent.id}
              points={ptsStr}
              fill="none"
              stroke={ANCHOR_CYAN_PRIMARY}
              strokeWidth={1.5 / safeK}
              strokeDasharray={`${5 / safeK},${3 / safeK}`}
              strokeOpacity={0.85}
            />
          );
        }
        return null;
      })}

      {/* =====================================================================
          3. LINHA DE RELAÇÃO ENTRE MARCOS (A -> B), PONTO MÉDIO E DIVISOR (÷N)
             (Sem caixas retangulares de texto sobre a peça!)
          ===================================================================== */}
      {pairMetrics && (
        <g data-testid="anchor-pair-relation">
          <line
            x1={pairMetrics.fromAnchor.origin.x}
            y1={pairMetrics.fromAnchor.origin.y}
            x2={pairMetrics.toAnchor.origin.x}
            y2={pairMetrics.toAnchor.origin.y}
            stroke={ANCHOR_VIOLET_ACCENT}
            strokeWidth={1.2 / safeK}
            strokeDasharray={`${5 / safeK},${3.5 / safeK}`}
            strokeOpacity={0.75}
          />
        </g>
      )}

      {/* Marcador discreto do Ponto Médio A–B */}
      {referenceState.midpointAB && isValidFiniteVec2(referenceState.midpointAB.point) && (
        <g
          data-testid="anchor-midpoint-ab-marker"
          aria-label={`Ponto Médio ${referenceState.midpointAB.fromAnchor}–${referenceState.midpointAB.toAnchor}`}
        >
          <polygon
            points={`${referenceState.midpointAB.point.x},${referenceState.midpointAB.point.y - 6 / safeK} ${referenceState.midpointAB.point.x + 6 / safeK},${referenceState.midpointAB.point.y} ${referenceState.midpointAB.point.x},${referenceState.midpointAB.point.y + 6 / safeK} ${referenceState.midpointAB.point.x - 6 / safeK},${referenceState.midpointAB.point.y}`}
            fill="rgba(6, 182, 212, 0.22)"
            stroke={ANCHOR_CYAN_PRIMARY}
            strokeWidth={1.4 / safeK}
          />
          <circle
            cx={referenceState.midpointAB.point.x}
            cy={referenceState.midpointAB.point.y}
            r={2 / safeK}
            fill="#FFFFFF"
          />
        </g>
      )}

      {/* Nós luminosos de divisão em tempo real (÷N) */}
      {referenceState.spanDivision &&
        referenceState.spanDivision.points.map((pt, idx) => {
          if (!isValidFiniteVec2(pt)) return null;
          const dR = 5.2 / safeK;
          return (
            <g
              key={`span-div-${idx}`}
              data-testid={`anchor-span-point-${idx + 1}`}
              aria-label={`Ponto de Divisão ${idx + 1}/${referenceState.spanDivision!.divisionsN}`}
            >
              <polygon
                points={`${pt.x},${pt.y - dR} ${pt.x + dR},${pt.y} ${pt.x},${pt.y + dR} ${pt.x - dR},${pt.y}`}
                fill="rgba(6, 182, 212, 0.24)"
                stroke={ANCHOR_CYAN_PRIMARY}
                strokeWidth={1.35 / safeK}
              />
              <circle cx={pt.x} cy={pt.y} r={1.8 / safeK} fill="#FFFFFF" />
            </g>
          );
        })}

      {/* =====================================================================
          4. LINHAS TRACEJADAS FINAS DO RADAR (SEM CAIXAS SOBRE O DESENHO)
          ===================================================================== */}
      {radarData &&
        radarData.workspaceChips.map((chip) => (
          <g key={chip.id} data-testid={`radar-line-${chip.id}`}>
            <line
              x1={chip.fromPoint.x}
              y1={chip.fromPoint.y}
              x2={chip.toPoint.x}
              y2={chip.toPoint.y}
              stroke={ANCHOR_CYAN_PRIMARY}
              strokeWidth={0.95 / safeK}
              strokeDasharray={`${3.5 / safeK},${3 / safeK}`}
              strokeOpacity={0.55}
            />
            <circle cx={chip.toPoint.x} cy={chip.toPoint.y} r={2.4 / safeK} fill={ANCHOR_CYAN_PRIMARY} />
          </g>
        ))}

      {/* =====================================================================
          5. MODO 1: ⚓ ÂNCORA LOCAL (X', Y') — CRUZ FINA E ELEGANTE + MICRO-PÍLULA 18×18px
          ===================================================================== */}
      {localAnchor &&
        (() => {
          const pt = localAnchor.origin;
          const armLen = 38 / safeK;
          const xMinusPt = anchorLocalToWorld({ x: -armLen, y: 0 }, pt, localAnchor.thetaDeg);
          const xPlusPt = anchorLocalToWorld({ x: armLen, y: 0 }, pt, localAnchor.thetaDeg);
          const yMinusPt = anchorLocalToWorld({ x: 0, y: -armLen }, pt, localAnchor.thetaDeg);
          const yPlusPt = anchorLocalToWorld({ x: 0, y: armLen }, pt, localAnchor.thetaDeg);

          const ticks: { p1: Vec2; p2: Vec2; axis: "x" | "y" }[] = [];
          for (let t = 1; t <= 3; t++) {
            const stepWorld = (t * 10) / safeK;
            const halfTick = (t % 2 === 0 ? 3.5 : 2.2) / safeK;
            ticks.push(
              {
                p1: anchorLocalToWorld({ x: stepWorld, y: -halfTick }, pt, localAnchor.thetaDeg),
                p2: anchorLocalToWorld({ x: stepWorld, y: halfTick }, pt, localAnchor.thetaDeg),
                axis: "x",
              },
              {
                p1: anchorLocalToWorld({ x: -stepWorld, y: -halfTick }, pt, localAnchor.thetaDeg),
                p2: anchorLocalToWorld({ x: -stepWorld, y: halfTick }, pt, localAnchor.thetaDeg),
                axis: "x",
              },
              {
                p1: anchorLocalToWorld({ x: -halfTick, y: stepWorld }, pt, localAnchor.thetaDeg),
                p2: anchorLocalToWorld({ x: halfTick, y: stepWorld }, pt, localAnchor.thetaDeg),
                axis: "y",
              },
              {
                p1: anchorLocalToWorld({ x: -halfTick, y: -stepWorld }, pt, localAnchor.thetaDeg),
                p2: anchorLocalToWorld({ x: halfTick, y: -stepWorld }, pt, localAnchor.thetaDeg),
                axis: "y",
              },
            );
          }

          return (
            <g
              data-testid="geometric-local-anchor"
              aria-label={`Âncora Local X', Y' (${localAnchor.badgeLabel})`}
            >
              {/* Eixo X' (Ciano Técnico fino) */}
              <line
                x1={xMinusPt.x}
                y1={xMinusPt.y}
                x2={xPlusPt.x}
                y2={xPlusPt.y}
                stroke={ANCHOR_CYAN_PRIMARY}
                strokeWidth={1.65 / safeK}
                strokeLinecap="round"
              />
              {/* Eixo Y' (Violeta Técnico fino) */}
              <line
                x1={yMinusPt.x}
                y1={yMinusPt.y}
                x2={yPlusPt.x}
                y2={yPlusPt.y}
                stroke={ANCHOR_VIOLET_PRIMARY}
                strokeWidth={1.65 / safeK}
                strokeLinecap="round"
              />
              {ticks.map((tk, idx) => (
                <line
                  key={`local-tick-${idx}`}
                  x1={tk.p1.x}
                  y1={tk.p1.y}
                  x2={tk.p2.x}
                  y2={tk.p2.y}
                  stroke={tk.axis === "x" ? ANCHOR_CYAN_PRIMARY : ANCHOR_VIOLET_ACCENT}
                  strokeWidth={1 / safeK}
                />
              ))}
              <text
                x={xPlusPt.x + 5 / safeK}
                y={xPlusPt.y + 3 / safeK}
                fill={ANCHOR_CYAN_PRIMARY}
                fontSize={8 / safeK}
                fontWeight="bold"
                fontFamily="ui-monospace, monospace"
              >
                X&apos;
              </text>
              <text
                x={yPlusPt.x + 5 / safeK}
                y={yPlusPt.y + 3 / safeK}
                fill={ANCHOR_VIOLET_ACCENT}
                fontSize={8 / safeK}
                fontWeight="bold"
                fontFamily="ui-monospace, monospace"
              >
                Y&apos;
              </text>

              {renderAnchorSymbol(localAnchor.symbolKind, pt, safeK, ANCHOR_CYAN_PRIMARY)}
              <circle cx={pt.x} cy={pt.y} r={2.2 / safeK} fill="#22D3EE" />

              {/* Micro-pílula 18px × 18px deslocada 14px na diagonal (+10px, -10px) */}
              <g
                transform={`translate(${pt.x + diagOffsetWorld}, ${pt.y - diagOffsetWorld})`}
                data-testid="local-anchor-badge"
              >
                <rect
                  x={-halfPillWorld}
                  y={-halfPillWorld}
                  width={pillSizeWorld}
                  height={pillSizeWorld}
                  rx={4.5 / safeK}
                  fill={ANCHOR_CYAN_PRIMARY}
                  stroke="#FFFFFF"
                  strokeWidth={0.9 / safeK}
                />
                <text
                  x={0}
                  y={3.1 / safeK}
                  fill="#082F49"
                  fontSize={8.5 / safeK}
                  fontWeight="900"
                  fontFamily="ui-monospace, monospace"
                  textAnchor="middle"
                >
                  ⚓
                </text>
              </g>
            </g>
          );
        })()}

      {/* =====================================================================
          6. MODO 2: 📍 MARCOS GEOMÉTRICOS (A–E) — RETÍCULA FINA + MICRO-PÍLULA 18×18px
          ===================================================================== */}
      {validLandmarks.map((anchor) => {
        const isActive = referenceState.activeLandmarkId === anchor.id;
        const pt = anchor.origin;
        const crossArm = 11 / safeK;
        const isSameAsLocalAnchor =
          localAnchor &&
          Math.hypot(localAnchor.origin.x - pt.x, localAnchor.origin.y - pt.y) < 1e-3;

        return (
          <g
            key={`anchor-node-${anchor.id}`}
            data-testid={`geometric-anchor-${anchor.id}`}
            aria-label={`Marco Geométrico ${anchor.id} (${anchor.badgeLabel})`}
          >
            {!isSameAsLocalAnchor && (
              <>
                <line
                  x1={pt.x - crossArm}
                  y1={pt.y}
                  x2={pt.x + crossArm}
                  y2={pt.y}
                  stroke={isActive ? ANCHOR_CYAN_PRIMARY : ANCHOR_VIOLET_PRIMARY}
                  strokeWidth={1.4 / safeK}
                  strokeLinecap="round"
                />
                <line
                  x1={pt.x}
                  y1={pt.y - crossArm}
                  x2={pt.x}
                  y2={pt.y + crossArm}
                  stroke={isActive ? ANCHOR_CYAN_PRIMARY : ANCHOR_VIOLET_PRIMARY}
                  strokeWidth={1.4 / safeK}
                  strokeLinecap="round"
                />
                {renderAnchorSymbol(
                  anchor.symbolKind,
                  pt,
                  safeK,
                  isActive ? ANCHOR_CYAN_PRIMARY : ANCHOR_VIOLET_ACCENT,
                )}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={2 / safeK}
                  fill={isActive ? "#22D3EE" : "#E879F9"}
                />
              </>
            )}

            {/* Micro-pílula 18px × 18px deslocada 14px na diagonal para não tapar o vértice */}
            <g
              transform={`translate(${pt.x + (isSameAsLocalAnchor ? -diagOffsetWorld : diagOffsetWorld)}, ${pt.y - diagOffsetWorld})`}
              className="pointer-events-auto cursor-pointer"
              data-testid={`anchor-badge-${anchor.id}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onSelectAnchor?.(anchor.id);
              }}
            >
              <rect
                x={-halfPillWorld}
                y={-halfPillWorld}
                width={pillSizeWorld}
                height={pillSizeWorld}
                rx={4.5 / safeK}
                fill={isActive ? ANCHOR_CYAN_PRIMARY : "#7E22CE"}
                stroke="#FFFFFF"
                strokeWidth={0.9 / safeK}
              />
              <text
                x={0}
                y={3.1 / safeK}
                fill={isActive ? "#082F49" : "#FFFFFF"}
                fontSize={8.5 / safeK}
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
          7. PRÉVIA DO CANDIDATO SMART PICK (APENAS ANEL E SÍMBOLO, SEM CAIXA DE TEXTO)
          ===================================================================== */}
      {isAnchorToolActive && smartPickPreview?.point && isValidFiniteVec2(smartPickPreview.point) && (
        <g
          data-testid="smart-pick-candidate-preview"
          aria-label={`Candidato Smart Pick: ${smartPickPreview.label}`}
        >
          <circle
            cx={smartPickPreview.point.x}
            cy={smartPickPreview.point.y}
            r={11 / safeK}
            fill="rgba(6, 182, 212, 0.14)"
            stroke={ANCHOR_CYAN_PRIMARY}
            strokeWidth={1.5 / safeK}
            strokeDasharray={`${4 / safeK},${2.5 / safeK}`}
          />
          {renderAnchorSymbol(
            smartPickPreview.symbolKind,
            smartPickPreview.point,
            safeK,
            "#22D3EE",
          )}
        </g>
      )}
    </g>
  );
};
