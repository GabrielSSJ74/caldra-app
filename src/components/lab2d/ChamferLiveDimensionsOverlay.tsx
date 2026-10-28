/**
 * CALDRA CHAMFER — OVERLAY DE COTAS VIVAS, ORIGEM TEMPORÁRIA (REF 0,0),
 * QUADRADO ADAPTÁVEL E CRUZ ROXA PONTILHADA DE PONTA A PONTA (SVG)
 *
 * Renderiza elementos gráficos de precisão milimétrica mobile-first:
 *  - Marcador pulsante de Origem Temporária (REF 0,0);
 *  - Cruz Roxa Pontilhada (#A855F7, stroke-dasharray 4, 4) adaptável de ponta a ponta (+6px além da forma);
 *  - Quadrado / Retângulo Guia Adaptável ao Dedo com pílulas ao vivo em mm (ΔX, ΔY e distância direta d);
 *  - Pílulas clicáveis para inserção direta de medidas a partir do ponto de referência;
 *  - Destaque da Borda de Referência Ativa com vetor normal e linha guia paralela;
 *  - Cotas Vivas ("Smart Dimensions") com linhas de chamada, setas e badges clicáveis.
 */

import React from "react";
import type { Vec2 } from "@/lib/geometry/types";
import type { TemporaryOrigin } from "@/lib/lab2d/cadCoordinateFrames";
import type { EdgeReference } from "@/lib/lab2d/cadGeometricReferences";
import type { LiveDimension } from "@/lib/lab2d/cadDynamicDimensions";

export interface ChamferLiveDimensionsOverlayProps {
  temporaryOrigin: TemporaryOrigin | null;
  activeEdge: EdgeReference | null;
  activeEdgeSide: 1 | -1;
  liveDimensions: LiveDimension[];
  viewK: number;
  isDark?: boolean;
  cursor?: Vec2 | null;
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
  pendingShape = null,
  onDimensionClick,
  onClearTemporaryOrigin,
  onInvertEdgeSide,
  onEditDelta,
}: ChamferLiveDimensionsOverlayProps) {
  const safeK = Number.isFinite(viewK) && viewK > 0 ? viewK : 1;

  const cyan = isDark ? "#00E5FF" : "#0284c7";
  const amber = isDark ? "#FBBF24" : "#D97706";
  const emerald = isDark ? "#10B981" : "#059669";
  const purple = isDark ? "#A855F7" : "#9333EA"; // Roxo vibrante técnico de engenharia
  const bgBadge = isDark ? "rgba(11, 16, 23, 0.94)" : "rgba(255, 255, 255, 0.96)";

  // Parâmetros do ponto de referência e cursor
  const refPt = temporaryOrigin?.p ?? null;
  const curPt = cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y) ? cursor : null;

  // Cálculo da Cruz Roxa Pontilhada Adaptável
  let crosshairExtX = 32 / safeK;
  let crosshairExtY = 32 / safeK;

  if (pendingShape) {
    if (pendingShape.r && pendingShape.r > 0) {
      // 100% do diâmetro + 6px de extensão técnica além das extremidades
      crosshairExtX = pendingShape.r + 6 / safeK;
      crosshairExtY = pendingShape.r + 6 / safeK;
    } else if (pendingShape.width && pendingShape.height) {
      crosshairExtX = pendingShape.width / 2 + 6 / safeK;
      crosshairExtY = pendingShape.height / 2 + 6 / safeK;
    }
  } else if (refPt && curPt) {
    const directD = Math.hypot(curPt.x - refPt.x, curPt.y - refPt.y);
    if (directD > 4) {
      crosshairExtX = Math.max(30 / safeK, Math.abs(curPt.x - refPt.x) + 6 / safeK);
      crosshairExtY = Math.max(30 / safeK, Math.abs(curPt.y - refPt.y) + 6 / safeK);
    }
  }

  // Cálculos do Quadrado / Retângulo Adaptável
  const showBox = refPt && curPt && (Math.abs(curPt.x - refPt.x) > 1 || Math.abs(curPt.y - refPt.y) > 1);
  const minX = refPt && curPt ? Math.min(refPt.x, curPt.x) : 0;
  const maxX = refPt && curPt ? Math.max(refPt.x, curPt.x) : 0;
  const minY = refPt && curPt ? Math.min(refPt.y, curPt.y) : 0;
  const maxY = refPt && curPt ? Math.max(refPt.y, curPt.y) : 0;
  const boxW = maxX - minX;
  const boxH = maxY - minY;
  const directDist = refPt && curPt ? Math.hypot(curPt.x - refPt.x, curPt.y - refPt.y) : 0;

  return (
    <g className="select-none pointer-events-none">
      {/* 1. CRUZ ROXA PONTILHADA ADAPTÁVEL DE PONTA A PONTA (#A855F7) */}
      {refPt && (
        <g>
          {/* Linha Horizontal da Cruz Roxa */}
          <line
            x1={refPt.x - crosshairExtX}
            y1={refPt.y}
            x2={refPt.x + crosshairExtX}
            y2={refPt.y}
            stroke={purple}
            strokeWidth={1.6 / safeK}
            strokeDasharray={`${4 / safeK},${4 / safeK}`}
            opacity={0.92}
          />
          {/* Linha Vertical da Cruz Roxa */}
          <line
            x1={refPt.x}
            y1={refPt.y - crosshairExtY}
            x2={refPt.x}
            y2={refPt.y + crosshairExtY}
            stroke={purple}
            strokeWidth={1.6 / safeK}
            strokeDasharray={`${4 / safeK},${4 / safeK}`}
            opacity={0.92}
          />
          {/* Micro-pontos técnicos nas 4 extremidades da cruz */}
          <circle cx={refPt.x - crosshairExtX} cy={refPt.y} r={1.8 / safeK} fill={purple} />
          <circle cx={refPt.x + crosshairExtX} cy={refPt.y} r={1.8 / safeK} fill={purple} />
          <circle cx={refPt.x} cy={refPt.y - crosshairExtY} r={1.8 / safeK} fill={purple} />
          <circle cx={refPt.x} cy={refPt.y + crosshairExtY} r={1.8 / safeK} fill={purple} />

          {/* Âncora Central */}
          <circle cx={refPt.x} cy={refPt.y} r={2.2 / safeK} fill={purple} />
        </g>
      )}

      {/* 2. QUADRADO / RETÂNGULO GUIA ADAPTÁVEL AO DEDO (DYNAMIC REFERENCE BOX) */}
      {showBox && refPt && curPt && (
        <g>
          {/* Preenchimento e borda do retângulo adaptável */}
          <rect
            x={minX}
            y={minY}
            width={boxW}
            height={boxH}
            fill={isDark ? "rgba(168, 85, 247, 0.08)" : "rgba(147, 51, 234, 0.06)"}
            stroke={purple}
            strokeWidth={1.2 / safeK}
            strokeDasharray={`${3.5 / safeK},${3.5 / safeK}`}
          />

          {/* Linha diagonal direta */}
          <line
            x1={refPt.x}
            y1={refPt.y}
            x2={curPt.x}
            y2={curPt.y}
            stroke={purple}
            strokeWidth={1 / safeK}
            strokeOpacity={0.4}
            strokeDasharray={`${2 / safeK},${2 / safeK}`}
          />

          {/* Pílula Horizontal: ΔX */}
          {boxW > 8 / safeK && (
            <g
              transform={`translate(${minX + boxW / 2}, ${curPt.y >= refPt.y ? minY - 10 / safeK : maxY + 14 / safeK})`}
              className="pointer-events-auto cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                if (onEditDelta) {
                  onEditDelta("dx", boxW, { x: e.clientX, y: e.clientY });
                }
              }}
            >
              <rect
                x={-32 / safeK}
                y={-8 / safeK}
                width={64 / safeK}
                height={16 / safeK}
                rx={8 / safeK}
                fill={bgBadge}
                stroke={purple}
                strokeWidth={1.2 / safeK}
                filter="drop-shadow(0 2px 4px rgba(0,0,0,0.6))"
              />
              <text
                x={0}
                y={3 / safeK}
                fill={purple}
                fontSize={8.5 / safeK}
                fontWeight="bold"
                fontFamily="monospace"
                textAnchor="middle"
              >
                ΔX {boxW.toFixed(1)}
              </text>
            </g>
          )}

          {/* Pílula Vertical: ΔY */}
          {boxH > 8 / safeK && (
            <g
              transform={`translate(${curPt.x >= refPt.x ? minX - 32 / safeK : maxX + 32 / safeK}, ${minY + boxH / 2})`}
              className="pointer-events-auto cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                if (onEditDelta) {
                  onEditDelta("dy", boxH, { x: e.clientX, y: e.clientY });
                }
              }}
            >
              <rect
                x={-30 / safeK}
                y={-8 / safeK}
                width={60 / safeK}
                height={16 / safeK}
                rx={8 / safeK}
                fill={bgBadge}
                stroke={purple}
                strokeWidth={1.2 / safeK}
                filter="drop-shadow(0 2px 4px rgba(0,0,0,0.6))"
              />
              <text
                x={0}
                y={3 / safeK}
                fill={purple}
                fontSize={8.5 / safeK}
                fontWeight="bold"
                fontFamily="monospace"
                textAnchor="middle"
              >
                ΔY {boxH.toFixed(1)}
              </text>
            </g>
          )}

          {/* Pílula de Distância Direta d (quando ambos os catetos forem significativos) */}
          {boxW > 24 / safeK && boxH > 24 / safeK && (
            <g transform={`translate(${(refPt.x + curPt.x) / 2}, ${(refPt.y + curPt.y) / 2})`}>
              <rect
                x={-28 / safeK}
                y={-7 / safeK}
                width={56 / safeK}
                height={14 / safeK}
                rx={7 / safeK}
                fill={bgBadge}
                stroke={isDark ? "#c084fc" : "#7e22ce"}
                strokeWidth={1 / safeK}
                opacity={0.9}
              />
              <text
                x={0}
                y={2.8 / safeK}
                fill={isDark ? "#e9d5ff" : "#581c87"}
                fontSize={7.5 / safeK}
                fontWeight="bold"
                fontFamily="monospace"
                textAnchor="middle"
              >
                d {directDist.toFixed(1)}
              </text>
            </g>
          )}
        </g>
      )}

      {/* 3. MARCADOR DE ORIGEM TEMPORÁRIA (REF 0,0) */}
      {temporaryOrigin && (
        <g>
          {/* Círculo pulsante e mira central */}
          <circle
            cx={temporaryOrigin.p.x}
            cy={temporaryOrigin.p.y}
            r={16 / safeK}
            fill="none"
            stroke={amber}
            strokeWidth={1.5 / safeK}
            strokeDasharray={`${3 / safeK},${3 / safeK}`}
            className="animate-spin"
            style={{ transformOrigin: `${temporaryOrigin.p.x}px ${temporaryOrigin.p.y}px`, animationDuration: "10s" }}
          />
          <circle
            cx={temporaryOrigin.p.x}
            cy={temporaryOrigin.p.y}
            r={5 / safeK}
            fill={amber}
            fillOpacity={0.4}
            stroke={amber}
            strokeWidth={2 / safeK}
          />
          {/* Eixos Ortogonais Locais do REF 0,0 */}
          <line
            x1={temporaryOrigin.p.x - 24 / safeK}
            y1={temporaryOrigin.p.y}
            x2={temporaryOrigin.p.x + 24 / safeK}
            y2={temporaryOrigin.p.y}
            stroke={amber}
            strokeWidth={1.2 / safeK}
          />
          <line
            x1={temporaryOrigin.p.x}
            y1={temporaryOrigin.p.y - 24 / safeK}
            x2={temporaryOrigin.p.x}
            y2={temporaryOrigin.p.y + 24 / safeK}
            stroke={amber}
            strokeWidth={1.2 / safeK}
          />
          {/* Badge flutuante de REF 0,0 */}
          <g
            transform={`translate(${temporaryOrigin.p.x + 14 / safeK}, ${temporaryOrigin.p.y - 24 / safeK})`}
            className="pointer-events-auto"
          >
            <rect
              x={0}
              y={0}
              width={86 / safeK}
              height={18 / safeK}
              rx={4 / safeK}
              fill={bgBadge}
              stroke={amber}
              strokeWidth={1.2 / safeK}
              filter="drop-shadow(0 2px 4px rgba(0,0,0,0.6))"
            />
            <text
              x={5 / safeK}
              y={12.5 / safeK}
              fill={amber}
              fontSize={9 / safeK}
              fontWeight="bold"
              fontFamily="monospace"
            >
              📍 REF (0,0)
            </text>
            <text
              x={64 / safeK}
              y={12 / safeK}
              fill={isDark ? "#94a3b8" : "#64748b"}
              fontSize={8 / safeK}
              fontWeight="bold"
              className="cursor-pointer hover:fill-red-400"
              onClick={(e) => {
                e.stopPropagation();
                onClearTemporaryOrigin?.();
              }}
            >
              ✕
            </text>
          </g>
        </g>
      )}

      {/* 4. DESTAQUE DA BORDA DE REFERÊNCIA ATIVA */}
      {activeEdge && (
        <g>
          {/* Linha guia destacada sobre a borda */}
          <line
            x1={activeEdge.p1.x}
            y1={activeEdge.p1.y}
            x2={activeEdge.p2.x}
            y2={activeEdge.p2.y}
            stroke={cyan}
            strokeWidth={3 / safeK}
            strokeLinecap="round"
          />
          <line
            x1={activeEdge.p1.x}
            y1={activeEdge.p1.y}
            x2={activeEdge.p2.x}
            y2={activeEdge.p2.y}
            stroke="#ffffff"
            strokeWidth={1.2 / safeK}
            strokeDasharray={`${4 / safeK},${4 / safeK}`}
          />

          {/* Vetor Normal indicador de lado (afastamento) */}
          <g transform={`translate(${activeEdge.midpoint.x}, ${activeEdge.midpoint.y})`}>
            <line
              x1={0}
              y1={0}
              x2={activeEdge.normal.x * (30 / safeK) * activeEdgeSide}
              y2={activeEdge.normal.y * (30 / safeK) * activeEdgeSide}
              stroke={cyan}
              strokeWidth={2 / safeK}
              markerEnd="url(#arrow-cyan)"
            />
          </g>

          {/* Badge da Borda com Comprimento e Botão de Inverter Lado */}
          <g
            transform={`translate(${activeEdge.midpoint.x + activeEdge.normal.x * (40 / safeK) * activeEdgeSide}, ${
              activeEdge.midpoint.y + activeEdge.normal.y * (40 / safeK) * activeEdgeSide
            })`}
            className="pointer-events-auto cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onInvertEdgeSide?.();
            }}
          >
            <rect
              x={-50 / safeK}
              y={-10 / safeK}
              width={100 / safeK}
              height={20 / safeK}
              rx={5 / safeK}
              fill={bgBadge}
              stroke={cyan}
              strokeWidth={1.2 / safeK}
              filter="drop-shadow(0 2px 6px rgba(0,0,0,0.7))"
            />
            <text
              x={0}
              y={3.5 / safeK}
              fill={cyan}
              fontSize={8.5 / safeK}
              fontWeight="bold"
              fontFamily="monospace"
              textAnchor="middle"
            >
              BORDA {activeEdge.length.toFixed(1)} mm
            </text>
          </g>
        </g>
      )}

      {/* 5. COTAS VIVAS DINÂMICAS (LIVE DIMENSIONS) */}
      {liveDimensions.map((dim) => {
        const dx = dim.endPoint.x - dim.startPoint.x;
        const dy = dim.endPoint.y - dim.startPoint.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.5) return null;

        const isOffset = dim.kind === "offset";
        const strokeColor = isOffset ? amber : cyan;

        return (
          <g key={dim.id}>
            {/* Linha da Cota */}
            <line
              x1={dim.startPoint.x}
              y1={dim.startPoint.y}
              x2={dim.endPoint.x}
              y2={dim.endPoint.y}
              stroke={strokeColor}
              strokeWidth={1.4 / safeK}
              strokeDasharray={`${3 / safeK},${2 / safeK}`}
            />

            {/* Marcadores de Extremidade */}
            <circle cx={dim.startPoint.x} cy={dim.startPoint.y} r={2.5 / safeK} fill={strokeColor} />
            <circle cx={dim.endPoint.x} cy={dim.endPoint.y} r={2.5 / safeK} fill={strokeColor} />

            {/* Pill Interativo com o Valor da Cota */}
            <g
              transform={`translate(${dim.midPoint.x}, ${dim.midPoint.y})`}
              className="pointer-events-auto cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                if (dim.isEditable && onDimensionClick) {
                  onDimensionClick(dim, { x: e.clientX, y: e.clientY });
                }
              }}
            >
              <rect
                x={-34 / safeK}
                y={-10 / safeK}
                width={68 / safeK}
                height={20 / safeK}
                rx={10 / safeK}
                fill={bgBadge}
                stroke={strokeColor}
                strokeWidth={1.5 / safeK}
                filter="drop-shadow(0 2px 6px rgba(0,0,0,0.8))"
              />
              <text
                x={0}
                y={3.5 / safeK}
                fill={strokeColor}
                fontSize={9 / safeK}
                fontWeight="bold"
                fontFamily="monospace"
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
