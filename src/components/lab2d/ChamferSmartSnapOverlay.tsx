/**
 * CALDRA CHAMFER — OVERLAY DE MARCADORES GEOMÉTRICOS E TOOLTIPS CAD DE PRECISÃO (SVG)
 *
 * Renderiza os glifos canônicos de snapping e referências inteligentes:
 *  - Endpoint: Quadrado □
 *  - Midpoint: Triângulo △
 *  - Center: Círculo com mira central ⊕
 *  - Quadrant: Losango ◇
 *  - Intersection: Cruz em X ✕
 *  - Projected Intersection: Cruz em X tracejada ✕
 *  - Tangent: Círculo com barra tangente ⊚
 *  - Perpendicular: Esquadro ortogonal ⟂
 *  - Geratriz: Círculo com raio radial de divisão ⊞
 *  - Construction: Ponto estelar / centro de montagem ✦
 *  - Badge flutuante com coordenadas mundiais e tipo de referência.
 */

import React from "react";
import type { Vec2 } from "@/lib/geometry/types";
import type { SmartReferencePoint, SmartSnapKind } from "@/lib/lab2d/cadReferenceSnaps";

interface ChamferSmartSnapOverlayProps {
  activeSnap: SmartReferencePoint | null;
  referencePoints?: SmartReferencePoint[];
  viewK: number;
  unit?: string;
  isDark?: boolean;
}

export function ChamferSmartSnapOverlay({
  activeSnap,
  referencePoints = [],
  viewK,
  unit = "mm",
  isDark = true,
}: ChamferSmartSnapOverlayProps) {
  const markerSize = Math.max(10, 14 / viewK);
  const half = markerSize / 2;

  // Cor característica de snap CAD profissional (verde-esmeralda vibrante ou amarelo técnico)
  const snapColor = isDark ? "#10b981" : "#059669"; // Emerald 500/600
  const activeColor = isDark ? "#38bdf8" : "#0284c7"; // Sky 400/600
  const geratrizColor = isDark ? "#f59e0b" : "#d97706"; // Amber 500/600

  const renderGlyph = (kind: SmartSnapKind, p: Vec2, size: number, color: string, isActive: boolean) => {
    const h = size / 2;
    switch (kind) {
      case "end":
        // Quadrado canônico de extremidade
        return (
          <rect
            x={p.x - h}
            y={p.y - h}
            width={size}
            height={size}
            fill="none"
            stroke={color}
            strokeWidth={isActive ? 2.2 / viewK : 1.5 / viewK}
          />
        );

      case "mid":
        // Triângulo de ponto médio
        return (
          <polygon
            points={`${p.x},${p.y - h} ${p.x + h},${p.y + h} ${p.x - h},${p.y + h}`}
            fill="none"
            stroke={color}
            strokeWidth={isActive ? 2.2 / viewK : 1.5 / viewK}
          />
        );

      case "center":
        // Círculo com cruz interna (mira central)
        return (
          <g>
            <circle
              cx={p.x}
              cy={p.y}
              r={h}
              fill="none"
              stroke={color}
              strokeWidth={isActive ? 2.2 / viewK : 1.5 / viewK}
            />
            <line
              x1={p.x - h * 1.3}
              y1={p.y}
              x2={p.x + h * 1.3}
              y2={p.y}
              stroke={color}
              strokeWidth={1.2 / viewK}
            />
            <line
              x1={p.x}
              y1={p.y - h * 1.3}
              x2={p.x}
              y2={p.y + h * 1.3}
              stroke={color}
              strokeWidth={1.2 / viewK}
            />
          </g>
        );

      case "quadrant":
        // Losango de quadrante
        return (
          <polygon
            points={`${p.x},${p.y - h} ${p.x + h},${p.y} ${p.x},${p.y + h} ${p.x - h},${p.y}`}
            fill="none"
            stroke={color}
            strokeWidth={isActive ? 2.2 / viewK : 1.5 / viewK}
          />
        );

      case "intersection":
      case "proj_inter":
        // Cruz em X de interseção
        return (
          <g>
            <line
              x1={p.x - h}
              y1={p.y - h}
              x2={p.x + h}
              y2={p.y + h}
              stroke={color}
              strokeWidth={isActive ? 2.2 / viewK : 1.5 / viewK}
              strokeDasharray={kind === "proj_inter" ? `${2 / viewK},${2 / viewK}` : undefined}
            />
            <line
              x1={p.x + h}
              y1={p.y - h}
              x2={p.x - h}
              y2={p.y + h}
              stroke={color}
              strokeWidth={isActive ? 2.2 / viewK : 1.5 / viewK}
              strokeDasharray={kind === "proj_inter" ? `${2 / viewK},${2 / viewK}` : undefined}
            />
          </g>
        );

      case "tangent":
        // Círculo com tangente superior
        return (
          <g>
            <circle
              cx={p.x}
              cy={p.y + h * 0.2}
              r={h * 0.8}
              fill="none"
              stroke={color}
              strokeWidth={isActive ? 2.2 / viewK : 1.5 / viewK}
            />
            <line
              x1={p.x - h}
              y1={p.y - h * 0.6}
              x2={p.x + h}
              y2={p.y - h * 0.6}
              stroke={color}
              strokeWidth={1.8 / viewK}
            />
          </g>
        );

      case "perp":
        // Símbolo de esquadro perpendicular
        return (
          <g>
            <line x1={p.x - h} y1={p.y} x2={p.x} y2={p.y} stroke={color} strokeWidth={1.8 / viewK} />
            <line x1={p.x} y1={p.y} x2={p.x} y2={p.y - h} stroke={color} strokeWidth={1.8 / viewK} />
            <rect
              x={p.x - h * 0.45}
              y={p.y - h * 0.45}
              width={h * 0.45}
              height={h * 0.45}
              fill="none"
              stroke={color}
              strokeWidth={1.2 / viewK}
            />
          </g>
        );

      case "geratriz":
        // Círculo com ponto e raio para caldeiraria
        return (
          <g>
            <circle
              cx={p.x}
              cy={p.y}
              r={h * 0.7}
              fill="none"
              stroke={geratrizColor}
              strokeWidth={1.5 / viewK}
            />
            <circle cx={p.x} cy={p.y} r={1.5 / viewK} fill={geratrizColor} />
          </g>
        );

      case "construction":
      case "origin":
      default:
        // Círculo com mira discreta
        return (
          <g>
            <circle
              cx={p.x}
              cy={p.y}
              r={h * 0.6}
              fill="none"
              stroke={color}
              strokeWidth={1.5 / viewK}
            />
            <circle cx={p.x} cy={p.y} r={1.8 / viewK} fill={color} />
          </g>
        );
    }
  };

  return (
    <g className="pointer-events-none select-none">
      {/* 1. Pontos de referência contextuais passivos (visíveis durante comandos para orientação) */}
      {referencePoints.map((ref, idx) => {
        const isCurrentlyActive =
          activeSnap && Math.hypot(activeSnap.p.x - ref.p.x, activeSnap.p.y - ref.p.y) < 1e-3;
        if (isCurrentlyActive) return null; // Será renderizado pelo activeSnap

        const color = ref.kind === "geratriz" ? geratrizColor : isDark ? "#64748b" : "#94a3b8";
        return (
          <g key={`ref-${idx}`} opacity={0.65}>
            {renderGlyph(ref.kind, ref.p, markerSize * 0.8, color, false)}
          </g>
        );
      })}

      {/* 2. Ponto de Snap Ativo sob o cursor com Glifo Destacado e Tooltip */}
      {activeSnap && (
        <g>
          {/* Halo de destaque pulsante */}
          <circle
            cx={activeSnap.p.x}
            cy={activeSnap.p.y}
            r={markerSize * 0.9}
            fill={activeColor}
            fillOpacity={0.15}
            stroke={activeColor}
            strokeWidth={1 / viewK}
            strokeDasharray={`${3 / viewK},${3 / viewK}`}
          />

          {/* Glifo principal com cor de precisão */}
          {renderGlyph(activeSnap.kind, activeSnap.p, markerSize, snapColor, true)}

          {/* Tooltip flutuante CAD */}
          <g transform={`translate(${activeSnap.p.x + markerSize * 0.9}, ${activeSnap.p.y - markerSize * 0.8})`}>
            {/* Fundo do Tooltip */}
            <rect
              x={0}
              y={-14 / viewK}
              width={Math.max(80, 110 / viewK)}
              height={20 / viewK}
              rx={4 / viewK}
              fill={isDark ? "rgba(2, 6, 23, 0.92)" : "rgba(255, 255, 255, 0.95)"}
              stroke={snapColor}
              strokeWidth={1 / viewK}
              filter="drop-shadow(0px 2px 4px rgba(0,0,0,0.5))"
            />
            {/* Texto do Tooltip */}
            <text
              x={5 / viewK}
              y={-1 / viewK}
              fill={isDark ? "#f8fafc" : "#0f172a"}
              fontSize={8.5 / viewK}
              fontFamily="ui-monospace, monospace"
              fontWeight="bold"
            >
              {activeSnap.label}
            </text>
            <text
              x={60 / viewK}
              y={-1 / viewK}
              fill={snapColor}
              fontSize={7.5 / viewK}
              fontFamily="ui-monospace, monospace"
              fontWeight="normal"
            >
              {activeSnap.p.x.toFixed(1)}, {activeSnap.p.y.toFixed(1)} {unit}
            </text>
          </g>
        </g>
      )}
    </g>
  );
}
