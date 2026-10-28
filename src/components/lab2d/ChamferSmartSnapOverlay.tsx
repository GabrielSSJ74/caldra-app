/**
 * CALDRA CHAMFER — OVERLAY DE MARCADORES GEOMÉTRICOS E TOOLTIPS CAD DE PRECISÃO (SVG)
 *
 * Renderiza retículas técnicas e glifos canônicos de snapping óptico de alta clareza:
 *  - Endpoint (□): Quadrado técnico vazado com cantos precisos e micro-ponto central
 *  - Midpoint (△): Triângulo equilátero técnico vazado, perfeitamente baricêntrico
 *  - Center (⊕): Círculo técnico fino com retícula em cruz discreta e vão central aberto
 *  - Quadrant (◇): Losango simétrico (45°) com centro vazado e micro-ponto central
 *  - Intersection (✕): Cruz em X com vão central aberto de 2.5 px para manter linhas visíveis
 *  - Projected Intersection (✕): Cruz em X com traço projetado
 *  - Tangent (⌒): Círculo com barra tangente superior
 *  - Perpendicular (⊥): Símbolo técnico ortogonal compacto
 *  - Division: Micro-diamante técnico para subdivisão virtual de formas (N partes)
 *  - Geratriz: Ponto técnico com anel discreto (exibido apenas em divisões de caldeiraria)
 *  - Suporte ao modo "Mostrar Todos os Snaps" (showAllSnaps) de todas as formas
 *  - Badge flutuante com cálculo dinâmico de largura, vão de 16 px e divisor sutil (|) sem colisão
 */

import React, { useMemo } from "react";
import type { Vec2 } from "@/lib/geometry/types";
import type { SmartReferencePoint, SmartSnapKind } from "@/lib/lab2d/cadReferenceSnaps";

export interface ChamferSmartSnapOverlayProps {
  activeSnap: SmartReferencePoint | null;
  referencePoints?: SmartReferencePoint[];
  cursor?: Vec2 | null;
  viewK: number;
  unit?: string;
  isDark?: boolean;
  showAllSnaps?: boolean;
}

export function ChamferSmartSnapOverlay({
  activeSnap,
  referencePoints = [],
  cursor = null,
  viewK,
  unit = "mm",
  isDark = true,
  showAllSnaps = false,
}: ChamferSmartSnapOverlayProps) {
  const safeK = Number.isFinite(viewK) && viewK > 0 ? viewK : 1;

  // Dimensões em pixels de tela constantes (independente do nível de zoom)
  const candidateScreenSize = 9.5;   // 8px - 11px
  const activeScreenSize = 13.5;     // 12px - 15px
  const haloScreenRadius = 10.0;     // 18px - 22px de diâmetro (raio 10px = 20px)

  const candidateWorldSize = candidateScreenSize / safeK;
  const activeWorldSize = activeScreenSize / safeK;
  const haloWorldRadius = haloScreenRadius / safeK;

  const candidateStroke = 1.3 / safeK;
  const activeStroke = 1.85 / safeK;
  const outlineStroke = activeStroke + 1.2 / safeK;
  const microDotRadius = 0.9 / safeK; // ~1.8px de diâmetro de tela
  const openGap = 2.5 / safeK;        // Vão central aberto de 2.5px para cruz de interseção

  // Cores de snap CAD industrial de alta precisão
  const snapColor = isDark ? "#10b981" : "#059669";     // Emerald 500/600 (padrão AutoCAD/SolidWorks)
  const neutralColor = isDark ? "#94a3b8" : "#64748b";  // Slate neutro para candidatos passivos
  const outlineBg = isDark ? "#020617" : "#ffffff";     // Halo contrastante para visualização perfeita
  const geratrizColor = isDark ? "#f59e0b" : "#d97706"; // Âmbar técnico
  const divisionColor = isDark ? "#38bdf8" : "#0284c7"; // Sky para divisões virtuais de snap

  /**
   * Filtragem e deduplicação espacial de candidatos:
   * 1. Elimina pontos inválidos
   * 2. Remove candidatos coincidentes com o snap ativo (< 6px tela)
   * 3. Se showAllSnaps estiver ativo: exibe todos os snaps de todas as formas sem limite
   *    Se showAllSnaps estiver desligado: restringe a um raio de 75px e limita aos 3-4 mais próximos
   * 4. Deduplica espacialmente candidatos a < 6px entre si, mantendo o de maior prioridade
   */
  const visibleCandidates = useMemo(() => {
    if (!referencePoints || referencePoints.length === 0) return [];

    const dedupDistWorld = 6 / safeK;
    const maxCursorDistWorld = 75 / safeK;

    // 1. Filtra válidos
    const valid = referencePoints.filter(
      (ref) => ref && ref.p && Number.isFinite(ref.p.x) && Number.isFinite(ref.p.y),
    );

    // 2. Remove coincidentes com activeSnap
    const withoutActive = valid.filter((ref) => {
      if (!activeSnap || !activeSnap.p) return true;
      const d = Math.hypot(ref.p.x - activeSnap.p.x, ref.p.y - activeSnap.p.y);
      return d > dedupDistWorld;
    });

    // 3. Proximidade com cursor quando showAllSnaps for falso
    let pool = withoutActive;
    if (!showAllSnaps && cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y)) {
      pool = withoutActive
        .map((ref) => ({ ref, distToCursor: Math.hypot(ref.p.x - cursor.x, ref.p.y - cursor.y) }))
        .filter((item) => item.distToCursor <= maxCursorDistWorld)
        .sort((a, b) => a.distToCursor - b.distToCursor)
        .map((item) => item.ref);
    }

    // 4. Ordena por prioridade intrínseca (1=Extremidade/Centro/Interseção, 2=Quadrante/Meio, 3=Divisão, etc.)
    pool.sort((a, b) => a.priority - b.priority);

    // 5. Deduplicação espacial (< 6px de tela): apenas 1 símbolo por coordenada
    const accepted: SmartReferencePoint[] = [];
    for (const cand of pool) {
      const isCoincident = accepted.some(
        (acc) => Math.hypot(acc.p.x - cand.p.x, acc.p.y - cand.p.y) <= dedupDistWorld,
      );
      if (!isCoincident) {
        accepted.push(cand);
        // Limita a no máximo 4 candidatos próximos quando showAllSnaps estiver OFF
        if (!showAllSnaps && accepted.length >= 4) break;
      }
    }

    return accepted;
  }, [referencePoints, activeSnap, cursor, safeK, showAllSnaps]);

  /**
   * Renderizador vetorial de retícula técnica com centro aberto
   */
  const renderGlyph = (
    kind: SmartSnapKind,
    p: Vec2,
    size: number,
    color: string,
    isActive: boolean,
  ) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    const h = size / 2;
    const strokeW = isActive ? activeStroke : candidateStroke;

    switch (kind) {
      case "end": {
        // □ Extremidade: Quadrado técnico vazado com micro-ponto central
        return (
          <g>
            {isActive && (
              <rect
                x={p.x - h}
                y={p.y - h}
                width={size}
                height={size}
                fill="none"
                stroke={outlineBg}
                strokeWidth={outlineStroke}
              />
            )}
            <rect
              x={p.x - h}
              y={p.y - h}
              width={size}
              height={size}
              fill="none"
              stroke={color}
              strokeWidth={strokeW}
            />
            <circle cx={p.x} cy={p.y} r={microDotRadius} fill={color} />
          </g>
        );
      }

      case "mid": {
        // △ Ponto Médio: Triângulo equilátero perfeitamente baricêntrico com centro vazado
        const hTop = 0.577 * size;
        const hBot = 0.289 * size;
        const wHalf = 0.5 * size;
        const pts = `${p.x},${p.y - hTop} ${p.x + wHalf},${p.y + hBot} ${p.x - wHalf},${p.y + hBot}`;

        return (
          <g>
            {isActive && (
              <polygon
                points={pts}
                fill="none"
                stroke={outlineBg}
                strokeWidth={outlineStroke}
              />
            )}
            <polygon
              points={pts}
              fill="none"
              stroke={color}
              strokeWidth={strokeW}
            />
            <circle cx={p.x} cy={p.y} r={microDotRadius} fill={color} />
          </g>
        );
      }

      case "center": {
        // ⊕ Centro: Círculo fino com retícula em cruz discreta e vão central aberto
        const r = size * 0.44;
        const innerGap = size * 0.22;
        const outerExt = size * 0.58;

        return (
          <g>
            {isActive && (
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill="none"
                stroke={outlineBg}
                strokeWidth={outlineStroke}
              />
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={strokeW}
            />
            {/* Retícula em cruz com vão central aberto */}
            <line x1={p.x - outerExt} y1={p.y} x2={p.x - innerGap} y2={p.y} stroke={color} strokeWidth={strokeW * 0.8} />
            <line x1={p.x + innerGap} y1={p.y} x2={p.x + outerExt} y2={p.y} stroke={color} strokeWidth={strokeW * 0.8} />
            <line x1={p.x} y1={p.y - outerExt} x2={p.x} y2={p.y - innerGap} stroke={color} strokeWidth={strokeW * 0.8} />
            <line x1={p.x} y1={p.y + innerGap} x2={p.x} y2={p.y + outerExt} stroke={color} strokeWidth={strokeW * 0.8} />
            <circle cx={p.x} cy={p.y} r={microDotRadius} fill={color} />
          </g>
        );
      }

      case "quadrant": {
        // ◇ Quadrante: Losango simétrico (45°) com centro vazado
        const pts = `${p.x},${p.y - h} ${p.x + h},${p.y} ${p.x},${p.y + h} ${p.x - h},${p.y}`;
        return (
          <g>
            {isActive && (
              <polygon
                points={pts}
                fill="none"
                stroke={outlineBg}
                strokeWidth={outlineStroke}
              />
            )}
            <polygon
              points={pts}
              fill="none"
              stroke={color}
              strokeWidth={strokeW}
            />
            <circle cx={p.x} cy={p.y} r={microDotRadius} fill={color} />
          </g>
        );
      }

      case "intersection":
      case "proj_inter": {
        // ✕ Interseção: Cruz em X com vão central aberto de 2.5px deixando o cruzamento visível
        const gapH = openGap * 0.5;
        const isProj = kind === "proj_inter";
        const dash = isProj ? `${2.5 / safeK},${2 / safeK}` : undefined;

        return (
          <g>
            {/* Linha diagonal 1 com corte central */}
            <line x1={p.x - h} y1={p.y - h} x2={p.x - gapH} y2={p.y - gapH} stroke={color} strokeWidth={strokeW} strokeDasharray={dash} />
            <line x1={p.x + gapH} y1={p.y + gapH} x2={p.x + h} y2={p.y + h} stroke={color} strokeWidth={strokeW} strokeDasharray={dash} />
            {/* Linha diagonal 2 com corte central */}
            <line x1={p.x + h} y1={p.y - h} x2={p.x + gapH} y2={p.y - gapH} stroke={color} strokeWidth={strokeW} strokeDasharray={dash} />
            <line x1={p.x - gapH} y1={p.y + gapH} x2={p.x - h} y2={p.y + h} stroke={color} strokeWidth={strokeW} strokeDasharray={dash} />
            <circle cx={p.x} cy={p.y} r={microDotRadius * 0.8} fill={color} />
          </g>
        );
      }

      case "division": {
        // Divisão Virtual de Snap: micro-diamante / graduador técnico vazado
        const dh = h * 0.75;
        const pts = `${p.x},${p.y - dh} ${p.x + dh},${p.y} ${p.x},${p.y + dh} ${p.x - dh},${p.y}`;
        const strokeColor = isActive ? snapColor : divisionColor;
        return (
          <g>
            {isActive && (
              <polygon
                points={pts}
                fill="none"
                stroke={outlineBg}
                strokeWidth={outlineStroke}
              />
            )}
            <polygon
              points={pts}
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeW}
            />
            <circle cx={p.x} cy={p.y} r={microDotRadius * 0.8} fill={strokeColor} />
          </g>
        );
      }

      case "perp": {
        // ⊥ Perpendicular: Símbolo ortogonal compacto
        return (
          <g>
            <line x1={p.x - h * 0.8} y1={p.y} x2={p.x + h * 0.8} y2={p.y} stroke={color} strokeWidth={strokeW} />
            <line x1={p.x} y1={p.y} x2={p.x} y2={p.y - h * 0.85} stroke={color} strokeWidth={strokeW} />
            <path
              d={`M ${p.x} ${p.y - h * 0.4} L ${p.x + h * 0.4} ${p.y - h * 0.4} L ${p.x + h * 0.4} ${p.y}`}
              fill="none"
              stroke={color}
              strokeWidth={strokeW * 0.8}
            />
          </g>
        );
      }

      case "tangent": {
        // ⌒ Tangência: Círculo com barra tangente superior
        return (
          <g>
            <circle
              cx={p.x}
              cy={p.y + h * 0.25}
              r={h * 0.65}
              fill="none"
              stroke={color}
              strokeWidth={strokeW}
            />
            <line
              x1={p.x - h * 0.8}
              y1={p.y - h * 0.4}
              x2={p.x + h * 0.8}
              y2={p.y - h * 0.4}
              stroke={color}
              strokeWidth={strokeW}
            />
          </g>
        );
      }

      case "geratriz": {
        // Geratriz de caldeiraria
        return (
          <g>
            <circle
              cx={p.x}
              cy={p.y}
              r={h * 0.65}
              fill="none"
              stroke={geratrizColor}
              strokeWidth={strokeW * 0.9}
            />
            <circle cx={p.x} cy={p.y} r={microDotRadius} fill={geratrizColor} />
          </g>
        );
      }

      case "construction":
      case "origin":
      case "near":
      default: {
        return (
          <g>
            <circle
              cx={p.x}
              cy={p.y}
              r={h * 0.6}
              fill="none"
              stroke={color}
              strokeWidth={strokeW * 0.9}
            />
            <circle cx={p.x} cy={p.y} r={microDotRadius} fill={color} />
          </g>
        );
      }
    }
  };

  /**
   * Layout proporcional do Tooltip HUD (sem colisão de texto e com vão garantido de 16px)
   */
  const tooltipData = useMemo(() => {
    if (!activeSnap || !activeSnap.p || !Number.isFinite(activeSnap.p.x) || !Number.isFinite(activeSnap.p.y)) {
      return null;
    }

    const labelText = activeSnap.label || "Snap";
    const coordsText = `${activeSnap.p.x.toFixed(1)}, ${activeSnap.p.y.toFixed(1)} ${unit}`;

    // Largura proporcional de fonte monospace (~6.8px por caractere na tela)
    const charW = 6.8 / safeK;
    const wLabel = Math.max(1, labelText.length) * charW;
    const wCoords = Math.max(1, coordsText.length) * charW;

    const pad = 10 / safeK;
    const gap = 16 / safeK; // Folga obrigatória de 14–18px entre label e coordenadas
    const totalW = pad + wLabel + gap + wCoords + pad;
    const badgeH = 20 / safeK;
    const rx = 4 / safeK;

    const dividerX = pad + wLabel + gap / 2;
    const coordsStartX = pad + wLabel + gap;

    // Posicionamento inteligente (offset suave acima e à direita do ponto)
    const offsetX = 12 / safeK;
    const offsetY = -20 / safeK;

    return {
      labelText,
      coordsText,
      totalW,
      badgeH,
      rx,
      pad,
      dividerX,
      coordsStartX,
      offsetX,
      offsetY,
    };
  }, [activeSnap, unit, safeK]);

  return (
    <g className="pointer-events-none select-none">
      {/* 1. CANDIDATOS PASSIVOS OU TODOS OS SNAPS (ESTADO PASSIVO: 8px - 11px, OPACIDADE 0.42 A 0.55) */}
      {visibleCandidates.map((ref, idx) => {
        const color = ref.kind === "geratriz" ? geratrizColor : ref.kind === "division" ? divisionColor : neutralColor;
        return (
          <g
            key={`snap-cand-${idx}-${ref.kind}-${ref.p.x.toFixed(2)}-${ref.p.y.toFixed(2)}`}
            opacity={showAllSnaps ? 0.6 : 0.42}
          >
            {renderGlyph(ref.kind, ref.p, candidateWorldSize, color, false)}
          </g>
        );
      })}

      {/* 2. PONTO DE SNAP ATIVO CAPTURADO (ESTADO DESTACADO: 12px - 15px, ANEL DE HALO 20px, TOOLTIP ZERO-COLLISION) */}
      {activeSnap && activeSnap.p && Number.isFinite(activeSnap.p.x) && Number.isFinite(activeSnap.p.y) && (
        <g>
          {/* Halo fino de destaque circular (18px - 22px de diâmetro, discreto com strokeWidth 1px) */}
          <circle
            cx={activeSnap.p.x}
            cy={activeSnap.p.y}
            r={haloWorldRadius}
            fill={snapColor}
            fillOpacity={0.06}
            stroke={snapColor}
            strokeOpacity={0.28}
            strokeWidth={1 / safeK}
          />

          {/* Glifo principal técnico com centro aberto e micro-ponto */}
          {renderGlyph(activeSnap.kind, activeSnap.p, activeWorldSize, snapColor, true)}

          {/* Tooltip HUD flutuante com cálculo de largura dinâmico e folga de 16px */}
          {tooltipData && (
            <g transform={`translate(${activeSnap.p.x + tooltipData.offsetX}, ${activeSnap.p.y + tooltipData.offsetY})`}>
              {/* Placa de fundo do badge */}
              <rect
                x={0}
                y={-tooltipData.badgeH}
                width={tooltipData.totalW}
                height={tooltipData.badgeH}
                rx={tooltipData.rx}
                fill={isDark ? "rgba(2, 6, 23, 0.94)" : "rgba(255, 255, 255, 0.96)"}
                stroke={snapColor}
                strokeWidth={1 / safeK}
                filter="drop-shadow(0px 2px 4px rgba(0,0,0,0.45))"
              />

              {/* Rótulo descritivo do SNAP */}
              <text
                x={tooltipData.pad}
                y={-tooltipData.badgeH * 0.32}
                fill={isDark ? "#f8fafc" : "#0f172a"}
                fontSize={8.5 / safeK}
                fontFamily="ui-monospace, monospace"
                fontWeight="bold"
              >
                {tooltipData.labelText}
              </text>

              {/* Divisor vertical sutil entre rótulo e coordenadas */}
              <line
                x1={tooltipData.dividerX}
                y1={-tooltipData.badgeH * 0.78}
                x2={tooltipData.dividerX}
                y2={tooltipData.badgeH * -0.22}
                stroke={isDark ? "rgba(148, 163, 184, 0.35)" : "rgba(100, 116, 139, 0.35)"}
                strokeWidth={1 / safeK}
              />

              {/* Coordenadas canônicas X, Y com unidade */}
              <text
                x={tooltipData.coordsStartX}
                y={-tooltipData.badgeH * 0.32}
                fill={snapColor}
                fontSize={8.0 / safeK}
                fontFamily="ui-monospace, monospace"
                fontWeight="500"
              >
                {tooltipData.coordsText}
              </text>
            </g>
          )}
        </g>
      )}
    </g>
  );
}
