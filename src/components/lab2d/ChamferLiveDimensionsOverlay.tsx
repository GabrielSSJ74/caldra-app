/**
 * CALDRA CHAMFER — OVERLAY PROFISSIONAL DE GUIAS DE INTERAÇÃO EXCLUSIVAS
 * (MODO AZUL DE CRIAÇÃO DE LINHA vs. MODO ROXO DE PONTO DE REFERÊNCIA REF)
 *
 * Especificação Técnica:
 *  1. Exclusividade estrita entre Guias Azuis ("blue_line"), Guias Roxas ("purple_ref") e Desativadas ("off");
 *  2. Remoção total do cartão flutuante "REF (0,0)" sobre o canvas;
 *  3. Centro do Ponto de Referência em Vermelho Carmesim Técnico (#DC143C / #E11D48) com anel fino e centro nítido;
 *  4. Hierarquia visual limpa (guias roxas 1.25px tracejadas 5,4; guias azuis uniformes com projeções discretas);
 *  5. Posicionamento externo inteligente das bolhas (L, d, ΔX, ΔY) com prevenção matemática de colisões (>= 8px);
 *  6. Exibição do ícone de cadeado (🔒) nas medidas fixadas por restrição dimensional real;
 *  7. Bloqueio de eventos de toque nas bolhas durante navegação multitouch (zoom/pan).
 */

import React, { useMemo } from "react";
import type { Vec2 } from "@/lib/geometry/types";
import type { TemporaryOrigin } from "@/lib/lab2d/cadCoordinateFrames";
import type { EdgeReference } from "@/lib/lab2d/cadGeometricReferences";
import type { LiveDimension } from "@/lib/lab2d/cadDynamicDimensions";
import {
  resolveBubbleCollisions,
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
  /** Ponto inicial ativo da operação de criação (ex: início da linha em CRI) */
  activeStartPoint?: Vec2 | null;
  /** Modo exclusivo de guias de interação selecionado em PRE */
  interactionGuideMode?: InteractionGuideMode;
  /** Restrições dimensionais reais ativas (L, ΔX, ΔY, d) */
  lockedConstraints?: DimensionalConstraints;
  /** Bloqueio de eventos durante gestos multitouch (zoom/pan) */
  isMultitouchNavigating?: boolean;
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
  /** Mantido para compatibilidade com chamadas legadas */
  onEditDelta?: (axis: "dx" | "dy", currentVal: number, screenPos: Vec2) => void;
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
  onDimensionClick,
  onInvertEdgeSide,
  onEditMeasure,
  onEditDelta,
}: ChamferLiveDimensionsOverlayProps) {
  const safeK = Number.isFinite(viewK) && viewK > 0 ? viewK : 1;

  // Paleta técnica CAD de alto contraste
  const crimsonMain = "#DC143C"; // Vermelho carmesim técnico principal
  const crimsonContrast = isDark ? "#E11D48" : "#DC143C"; // Alternativa acessível para contraste
  const purpleStroke = isDark ? "#A855F7" : "#9333EA";
  const blueMain = isDark ? "#38BDF8" : "#0284C7";
  const blueProj = isDark ? "rgba(56, 189, 248, 0.52)" : "rgba(2, 132, 199, 0.48)";
  const amber = isDark ? "#FBBF24" : "#D97706";
  const bgBadge = isDark ? "rgba(11, 16, 23, 0.94)" : "rgba(255, 255, 255, 0.96)";

  const refPt = temporaryOrigin?.p ?? null;
  const curPt = cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y) ? cursor : null;
  const startPt =
    activeStartPoint && Number.isFinite(activeStartPoint.x) && Number.isFinite(activeStartPoint.y)
      ? activeStartPoint
      : null;

  // Regras de exclusividade estrita (Seção 1.3)
  const showPurpleGuides =
    interactionGuideMode === "purple_ref" && refPt !== null && curPt !== null;
  const showBlueGuides =
    interactionGuideMode === "blue_line" && startPt !== null && curPt !== null;

  // Cálculo de geometria e bolhas anti-colisão para o modo ativo (ÚNICA FONTE ATIVA POR VEZ)
  const activeGuideData = useMemo(() => {
    const basePt = showBlueGuides ? startPt : showPurpleGuides ? refPt : null;
    if (!basePt || !curPt) return null;

    const dx = curPt.x - basePt.x;
    const dy = curPt.y - basePt.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const totalLen = Math.hypot(dx, dy);

    if (totalLen < 0.5 / safeK) return null;

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

    // 1. Bolha principal: "L" (Modo Azul) ou "d" (Modo Roxo)
    const mainKind: ConstrainableMeasureKind = showBlueGuides ? "L" : "d";
    const isMainLocked = showBlueGuides
      ? typeof lockedConstraints.lockedL === "number"
      : typeof lockedConstraints.lockedDist === "number";
    const mainText = `${isMainLocked ? "🔒 " : ""}${mainKind} ${totalLen.toFixed(1)} mm`;
    const mainW = Math.max(66, mainText.length * 5.6 + 12) / safeK;
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

    // 2. Bolha Horizontal: ΔX (exibida quando houver projeção horizontal relevante)
    if (absDx > 6 / safeK && (absDy > 2 / safeK || isMainLocked || lockedConstraints.lockedDx != null)) {
      const isDxLocked = typeof lockedConstraints.lockedDx === "number";
      const dxText = `${isDxLocked ? "🔒 " : ""}ΔX ${absDx.toFixed(1)} mm`;
      const dxW = Math.max(68, dxText.length * 5.6 + 12) / safeK;
      const anchorDx: Vec2 = { x: (basePt.x + curPt.x) / 2, y: basePt.y };
      // Posiciona para fora do triângulo de projeção
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
          y: anchorDx.y + normalY * (14 / safeK),
        },
        normal: { x: 0, y: normalY },
        widthWorld: dxW,
        heightWorld: pillH,
      });
    }

    // 3. Bolha Vertical: ΔY (exibida quando houver projeção vertical relevante)
    if (absDy > 6 / safeK && (absDx > 2 / safeK || isMainLocked || lockedConstraints.lockedDy != null)) {
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
          x: anchorDy.x + normalX * (dxWOffset(dyW, safeK)),
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
      bubbles: resolvedBubbles,
    };
  }, [showBlueGuides, showPurpleGuides, startPt, refPt, curPt, safeK, lockedConstraints]);

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

  return (
    <g className="select-none pointer-events-none">
      {/* =====================================================================
          1. MODO ROXO EXCLUSIVO ("purple_ref"): GUIAS ROXAS DO PONTO DE REFERÊNCIA
          ===================================================================== */}
      {showPurpleGuides && activeGuideData && (
        <g aria-label="Guias Roxas do Ponto de Referência REF">
          {/* Preenchimento auxiliar muito discreto quando há área retangular */}
          {activeGuideData.absDx > 2 / safeK && activeGuideData.absDy > 2 / safeK && (
            <rect
              x={activeGuideData.minX}
              y={activeGuideData.minY}
              width={activeGuideData.absDx}
              height={activeGuideData.absDy}
              fill={isDark ? "rgba(168, 85, 247, 0.035)" : "rgba(147, 51, 234, 0.03)"}
              stroke="none"
            />
          )}

          {/* Projeções auxiliares ortogonais roxas (1.25px, dasharray 5,4, intensidade secundária) */}
          {activeGuideData.absDx > 1 / safeK && activeGuideData.absDy > 1 / safeK && (
            <>
              {/* Projeção Horizontal ΔX */}
              <line
                x1={activeGuideData.basePt.x}
                y1={activeGuideData.basePt.y}
                x2={activeGuideData.cornerPt.x}
                y2={activeGuideData.cornerPt.y}
                stroke={purpleStroke}
                strokeWidth={1.15 / safeK}
                strokeDasharray={`${5 / safeK},${4 / safeK}`}
                strokeOpacity={0.68}
              />
              {/* Projeção Vertical ΔY */}
              <line
                x1={activeGuideData.cornerPt.x}
                y1={activeGuideData.cornerPt.y}
                x2={activeGuideData.curPt.x}
                y2={activeGuideData.curPt.y}
                stroke={purpleStroke}
                strokeWidth={1.15 / safeK}
                strokeDasharray={`${5 / safeK},${4 / safeK}`}
                strokeOpacity={0.68}
              />
              {/* Lados complementares discretos do quadro adaptável */}
              <line
                x1={activeGuideData.basePt.x}
                y1={activeGuideData.basePt.y}
                x2={activeGuideData.basePt.x}
                y2={activeGuideData.curPt.y}
                stroke={purpleStroke}
                strokeWidth={0.95 / safeK}
                strokeDasharray={`${5 / safeK},${4 / safeK}`}
                strokeOpacity={0.32}
              />
              <line
                x1={activeGuideData.basePt.x}
                y1={activeGuideData.curPt.y}
                x2={activeGuideData.curPt.x}
                y2={activeGuideData.curPt.y}
                stroke={purpleStroke}
                strokeWidth={0.95 / safeK}
                strokeDasharray={`${5 / safeK},${4 / safeK}`}
                strokeOpacity={0.32}
              />
            </>
          )}

          {/* Ligação principal roxa entre a referência e o ponto atual (1.25px, stroke-dasharray: 5,4) */}
          <line
            x1={activeGuideData.basePt.x}
            y1={activeGuideData.basePt.y}
            x2={activeGuideData.curPt.x}
            y2={activeGuideData.curPt.y}
            stroke={purpleStroke}
            strokeWidth={1.25 / safeK}
            strokeDasharray={`${5 / safeK},${4 / safeK}`}
            strokeOpacity={0.92}
          />

          {/* Marcador quadrado móvel do ponteiro no modo REF */}
          <rect
            x={activeGuideData.curPt.x - 3.2 / safeK}
            y={activeGuideData.curPt.y - 3.2 / safeK}
            width={6.4 / safeK}
            height={6.4 / safeK}
            fill={isDark ? "rgba(15, 23, 42, 0.85)" : "rgba(255, 255, 255, 0.9)"}
            stroke={purpleStroke}
            strokeWidth={1.3 / safeK}
          />
        </g>
      )}

      {/* =====================================================================
          2. MODO AZUL EXCLUSIVO ("blue_line"): GUIAS AZUIS DE CRIAÇÃO DE LINHA
          ===================================================================== */}
      {showBlueGuides && activeGuideData && (
        <g aria-label="Guias Azuis de Criação de Linha">
          {/* Projeções ortogonais horizontais e verticais com menor intensidade */}
          {activeGuideData.absDx > 2 / safeK && activeGuideData.absDy > 2 / safeK && (
            <>
              <line
                x1={activeGuideData.basePt.x}
                y1={activeGuideData.basePt.y}
                x2={activeGuideData.cornerPt.x}
                y2={activeGuideData.cornerPt.y}
                stroke={blueProj}
                strokeWidth={1.05 / safeK}
                strokeDasharray={`${4 / safeK},${3 / safeK}`}
              />
              <line
                x1={activeGuideData.cornerPt.x}
                y1={activeGuideData.cornerPt.y}
                x2={activeGuideData.curPt.x}
                y2={activeGuideData.curPt.y}
                stroke={blueProj}
                strokeWidth={1.05 / safeK}
                strokeDasharray={`${4 / safeK},${3 / safeK}`}
              />
              {/* Indicador técnico de ângulo reto no vértice de projeção */}
              {activeGuideData.absDx > 12 / safeK && activeGuideData.absDy > 12 / safeK && (
                <polyline
                  points={`${
                    activeGuideData.cornerPt.x - Math.sign(activeGuideData.curPt.x - activeGuideData.basePt.x) * (5 / safeK)
                  },${activeGuideData.cornerPt.y} ${
                    activeGuideData.cornerPt.x - Math.sign(activeGuideData.curPt.x - activeGuideData.basePt.x) * (5 / safeK)
                  },${
                    activeGuideData.cornerPt.y + Math.sign(activeGuideData.curPt.y - activeGuideData.basePt.y) * (5 / safeK)
                  } ${activeGuideData.cornerPt.x},${
                    activeGuideData.cornerPt.y + Math.sign(activeGuideData.curPt.y - activeGuideData.basePt.y) * (5 / safeK)
                  }`}
                  fill="none"
                  stroke={blueProj}
                  strokeWidth={0.9 / safeK}
                />
              )}
            </>
          )}

          {/* Guia principal acompanhando o segmento provisório */}
          <line
            x1={activeGuideData.basePt.x}
            y1={activeGuideData.basePt.y}
            x2={activeGuideData.curPt.x}
            y2={activeGuideData.curPt.y}
            stroke={blueMain}
            strokeWidth={1.4 / safeK}
            strokeOpacity={0.9}
          />

          {/* Marcadores de Ponto Inicial e Ponto Final */}
          <circle
            cx={activeGuideData.basePt.x}
            cy={activeGuideData.basePt.y}
            r={2.8 / safeK}
            fill={isDark ? "#090D16" : "#FFFFFF"}
            stroke={blueMain}
            strokeWidth={1.35 / safeK}
          />
          <circle
            cx={activeGuideData.curPt.x}
            cy={activeGuideData.curPt.y}
            r={2.8 / safeK}
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
                className={isMultitouchNavigating ? "pointer-events-none" : "pointer-events-auto cursor-pointer"}
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
          4. CENTRO DO PONTO DE REFERÊNCIA EM VERMELHO CARMESIM (#DC143C)
             Sem cartão flutuante "REF (0,0)", nítido nos temas claro e escuro
          ===================================================================== */}
      {refPt && (
        <g aria-label="Marcador Central do Ponto de Referência em Vermelho Carmesim">
          {/* Halo sutil de contraste para visibilidade sobre qualquer fundo ou grade */}
          <circle
            cx={refPt.x}
            cy={refPt.y}
            r={6.5 / safeK}
            fill="none"
            stroke={isDark ? "rgba(9, 13, 22, 0.85)" : "rgba(255, 255, 255, 0.9)"}
            strokeWidth={2.6 / safeK}
          />
          {/* Anel técnico fino carmesim */}
          <circle
            cx={refPt.x}
            cy={refPt.y}
            r={6.5 / safeK}
            fill="none"
            stroke={crimsonContrast}
            strokeWidth={1.35 / safeK}
          />
          {/* Cruz carmesim de precisão do ponto fixo */}
          <line
            x1={refPt.x - 10.5 / safeK}
            y1={refPt.y}
            x2={refPt.x - 3.2 / safeK}
            y2={refPt.y}
            stroke={crimsonMain}
            strokeWidth={1.25 / safeK}
            strokeLinecap="round"
          />
          <line
            x1={refPt.x + 3.2 / safeK}
            y1={refPt.y}
            x2={refPt.x + 10.5 / safeK}
            y2={refPt.y}
            stroke={crimsonMain}
            strokeWidth={1.25 / safeK}
            strokeLinecap="round"
          />
          <line
            x1={refPt.x}
            y1={refPt.y - 10.5 / safeK}
            x2={refPt.x}
            y2={refPt.y - 3.2 / safeK}
            stroke={crimsonMain}
            strokeWidth={1.25 / safeK}
            strokeLinecap="round"
          />
          <line
            x1={refPt.x}
            y1={refPt.y + 3.2 / safeK}
            x2={refPt.x}
            y2={refPt.y + 10.5 / safeK}
            stroke={crimsonMain}
            strokeWidth={1.25 / safeK}
            strokeLinecap="round"
          />
          {/* Ponto central nítido carmesim */}
          <circle
            cx={refPt.x}
            cy={refPt.y}
            r={2.0 / safeK}
            fill={crimsonMain}
          />
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
            className={isMultitouchNavigating ? "pointer-events-none" : "pointer-events-auto cursor-pointer"}
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

      {/* Cotas vivas de Borda Ativa (somente quando activeEdge estiver presente para não duplicar guias de REF) */}
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
                className={isMultitouchNavigating ? "pointer-events-none" : "pointer-events-auto cursor-pointer"}
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

function dxWOffset(widthWorld: number, safeK: number): number {
  return widthWorld / 2 + 8 / safeK;
}
