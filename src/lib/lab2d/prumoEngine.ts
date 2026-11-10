/**
 * CALDRA — CHAMFER CAD (2D SKETCH & CAD 3D)
 * MOTOR MATEMÁTICO E DE ESTADO DA INTERFACE ESPACIAL "PRUMO"
 *
 * Implementa:
 *  1. Identidade canônica UI_NAME = "PRUMO" e migração silenciosa de "classic" -> "compact"
 *  2. Geometria trigonométrica do Leque Concêntrico de 2 Arcos (R1 = 112px, R2 = 182px)
 *     com passo angular Δ = (d + g) / R, capacidade N_vis = floor(Θ / Δ) + 1 e rolagem orbital φ
 *  3. Hit-test polar (r, θ) para o Gesto de Especialista (Pressionar, Deslizar em Arco e Soltar)
 *  4. Resolução de Menu de Contexto Inteligente por tipo de entidade e posicionamento anti-colisão
 */

import type { Entity } from "./core";

function computeEntitiesBounds(entities: Entity[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  if (entities.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const includePt = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const e of entities) {
    if (e.type === "line") {
      includePt(e.x1, e.y1);
      includePt(e.x2, e.y2);
    } else if (e.type === "polyline") {
      for (const p of e.pts) includePt(p.x, p.y);
    } else if (e.type === "circle" || e.type === "arc") {
      includePt(e.cx - e.r, e.cy - e.r);
      includePt(e.cx + e.r, e.cy + e.r);
    } else if (e.type === "ellipse") {
      includePt(e.cx - e.rx, e.cy - e.ry);
      includePt(e.cx + e.rx, e.cy + e.ry);
    } else if (e.type === "point" || e.type === "text") {
      includePt(e.x, e.y);
    } else if (e.type === "hatch") {
      for (const p of e.boundaryPts) includePt(p.x, p.y);
    } else if (e.type === "path") {
      includePt(e.start.x, e.start.y);
      for (const s of e.segs) includePt(s.p3.x, s.p3.y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { minX, minY, maxX, maxY };
}

export const UI_NAME = "PRUMO" as const;

export type ChamferUiShellMode = "compact" | "prumo";

export type PrumoHandSide = "left" | "right";

export const PRUMO_SHELL_STORAGE_KEY = "chamfer_ui_shell_mode";
export const PRUMO_HAND_STORAGE_KEY = "chamfer_prumo_hand_side";
export const PRUMO_FAVORITES_STORAGE_KEY = "chamfer_prumo_favorite_tools_v1";
export const PRUMO_RECENTS_STORAGE_KEY = "chamfer_prumo_recent_tools_v1";

/**
 * Migra silenciosamente qualquer preferência legada ("classic", "Clássica", etc.)
 * para "compact", mantendo apenas "compact" (padrão) ou "prumo".
 */
export function normalizeUiShellMode(raw: string | null | undefined): ChamferUiShellMode {
  if (raw === "prumo" || raw === "PRUMO") {
    return "prumo";
  }
  return "compact";
}

export function loadPersistedUiShellMode(): ChamferUiShellMode {
  if (typeof window === "undefined") return "compact";
  try {
    const raw = window.localStorage.getItem(PRUMO_SHELL_STORAGE_KEY);
    const normalized = normalizeUiShellMode(raw);
    if (raw !== normalized) {
      window.localStorage.setItem(PRUMO_SHELL_STORAGE_KEY, normalized);
    }
    return normalized;
  } catch {
    return "compact";
  }
}

export function savePersistedUiShellMode(mode: ChamferUiShellMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRUMO_SHELL_STORAGE_KEY, mode);
  } catch {
    // ignore storage errors
  }
}

/* ============================================================================
 * GEOMETRIA TRIGONOMÉTRICA DO LEQUE CONCÊNTRICO DE 2 ARCOS (ZERO COLISÃO)
 * ============================================================================ */

export interface ArcButtonPlacement {
  index: number;
  angleRad: number;
  angleDeg: number;
  x: number;
  y: number;
  labelX: number;
  labelY: number;
  visible: boolean;
  opacity: number;
}

export interface ConcentricArcLayout {
  radiusPx: number;
  diameterPx: number;
  gapPx: number;
  stepAngleRad: number;
  quadrantSpanRad: number;
  visibleCapacity: number;
  maxScrollAngleRad: number;
  clampedScrollAngleRad: number;
  canScrollPrev: boolean;
  canScrollNext: boolean;
  minChordDistancePx: number;
  hasZeroCollision: boolean;
  items: ArcButtonPlacement[];
}

export interface ComputeConcentricArcParams {
  centerX: number;
  centerY: number;
  handSide: PrumoHandSide;
  viewportWidth: number;
  viewportHeight: number;
  arcKind: "inner" | "outer";
  itemCount: number;
  scrollAngleRad: number;
}

/**
 * Calcula a geometria trigonométrica exata do Arco Interno (R1) ou Arco Externo (R2):
 *  - Passo angular: Δ = (d + g) / R
 *  - Capacidade visível no quadrante Θ = π/2: N_vis = floor(Θ / Δ) + 1
 *  - Posição de cada botão k: p_k = C + R * (s_x * cos(θ_k), -sin(θ_k)), onde θ_k = k * Δ - φ
 */
export function computeConcentricArcLayout(
  params: ComputeConcentricArcParams,
): ConcentricArcLayout {
  const safeW = Math.max(320, Number.isFinite(params.viewportWidth) ? params.viewportWidth : 800);
  const safeH = Math.max(320, Number.isFinite(params.viewportHeight) ? params.viewportHeight : 600);
  const minViewportDim = Math.min(safeW, safeH);

  const isInner = params.arcKind === "inner";
  const radiusPx = isInner
    ? Math.min(112, Math.max(82, Math.round(0.32 * minViewportDim)))
    : Math.min(182, Math.max(134, Math.round(0.52 * minViewportDim)));

  const diameterPx = isInner ? 42 : 46;
  const gapPx = 4;

  // Fórmula obrigatória de passo angular: Δ = (d + g) / R
  const stepAngleRad = (diameterPx + gapPx) / radiusPx;
  const quadrantSpanRad = Math.PI / 2; // Θ = 90° (π/2 rad)

  // Capacidade visível simultânea no quadrante: N_vis = floor(Θ / Δ) + 1
  const visibleCapacity = Math.floor(quadrantSpanRad / stepAngleRad) + 1;

  const totalSpanRad = Math.max(0, (params.itemCount - 1) * stepAngleRad);
  const maxScrollAngleRad = Math.max(0, totalSpanRad - quadrantSpanRad);
  const clampedScrollAngleRad = Math.max(
    0,
    Math.min(maxScrollAngleRad, Number.isFinite(params.scrollAngleRad) ? params.scrollAngleRad : 0),
  );

  const sx = params.handSide === "left" ? 1 : -1;
  const labelRadiusPx = radiusPx + diameterPx / 2 + 12;

  const items: ArcButtonPlacement[] = [];
  for (let k = 0; k < params.itemCount; k++) {
    const thetaK = k * stepAngleRad - clampedScrollAngleRad;
    const cosT = Math.cos(thetaK);
    const sinT = Math.sin(thetaK);

    const x = Number((params.centerX + radiusPx * sx * cosT).toFixed(2));
    const y = Number((params.centerY - radiusPx * sinT).toFixed(2));

    const labelX = Number((params.centerX + labelRadiusPx * sx * cosT).toFixed(2));
    const labelY = Number((params.centerY - labelRadiusPx * sinT).toFixed(2));

    const marginRad = stepAngleRad * 0.32;
    const visible = thetaK >= -marginRad && thetaK <= quadrantSpanRad + marginRad;

    let opacity = 0;
    if (visible) {
      if (thetaK < 0) {
        opacity = Math.max(0.25, 1 + thetaK / marginRad);
      } else if (thetaK > quadrantSpanRad) {
        opacity = Math.max(0.25, 1 - (thetaK - quadrantSpanRad) / marginRad);
      } else {
        opacity = 1;
      }
    }

    items.push({
      index: k,
      angleRad: thetaK,
      angleDeg: Number(((thetaK * 180) / Math.PI).toFixed(1)),
      x,
      y,
      labelX,
      labelY,
      visible,
      opacity: Number(opacity.toFixed(2)),
    });
  }

  // Distância cordal entre centros adjacentes: 2 * R * sin(Δ / 2)
  const minChordDistancePx =
    params.itemCount >= 2 ? Number((2 * radiusPx * Math.sin(stepAngleRad / 2)).toFixed(2)) : 999;

  return {
    radiusPx,
    diameterPx,
    gapPx,
    stepAngleRad,
    quadrantSpanRad,
    visibleCapacity,
    maxScrollAngleRad,
    clampedScrollAngleRad,
    canScrollPrev: clampedScrollAngleRad > 0.02,
    canScrollNext: clampedScrollAngleRad < maxScrollAngleRad - 0.02,
    minChordDistancePx,
    hasZeroCollision: minChordDistancePx >= diameterPx + 1,
    items,
  };
}

/**
 * Calcula a posição segura do centro C do Núcleo garantindo margem >= 20px das bordas.
 */
export function computePrumoCoreCenter(params: {
  viewportWidth: number;
  viewportHeight: number;
  handSide: PrumoHandSide;
  coreSizePx?: number;
  marginPx?: number;
}): { x: number; y: number } {
  const coreSize = params.coreSizePx ?? 56;
  const margin = Math.max(20, params.marginPx ?? 20);
  const half = coreSize / 2;

  const x =
    params.handSide === "left"
      ? margin + half
      : Math.max(margin + half, params.viewportWidth - margin - half);
  const y = Math.max(margin + half, params.viewportHeight - margin - half);

  return { x, y };
}

/* ============================================================================
 * HIT-TEST POLAR PARA O GESTO DE ESPECIALISTA (PRESSIONAR, DESLIZAR E SOLTAR)
 * ============================================================================ */

export interface PolarFanHitResult {
  zone: "core" | "inner_arc" | "outer_arc" | "outside";
  radiusPx: number;
  angleRad: number;
  matchedIndex: number | null;
}

export function resolvePolarFanHit(params: {
  centerX: number;
  centerY: number;
  pointerX: number;
  pointerY: number;
  handSide: PrumoHandSide;
  innerArc: ConcentricArcLayout;
  outerArc: ConcentricArcLayout;
}): PolarFanHitResult {
  const sx = params.handSide === "left" ? 1 : -1;
  const dx = (params.pointerX - params.centerX) * sx;
  const dy = params.centerY - params.pointerY;
  const r = Math.hypot(dx, dy);
  const angleRad = Math.atan2(dy, dx);

  if (r < params.innerArc.radiusPx - params.innerArc.diameterPx * 0.7) {
    return {
      zone: "core",
      radiusPx: r,
      angleRad,
      matchedIndex: null,
    };
  }

  const midBoundary = (params.innerArc.radiusPx + params.outerArc.radiusPx) / 2;
  const outerMax = params.outerArc.radiusPx + params.outerArc.diameterPx * 0.95;

  if (r < midBoundary) {
    // Busca o botão visível mais próximo no Arco Interno
    let bestIdx: number | null = null;
    let bestDist = Infinity;
    for (const item of params.innerArc.items) {
      if (!item.visible) continue;
      const d = Math.hypot(params.pointerX - item.x, params.pointerY - item.y);
      if (d < bestDist && d <= params.innerArc.diameterPx * 0.85) {
        bestDist = d;
        bestIdx = item.index;
      }
    }
    return {
      zone: "inner_arc",
      radiusPx: r,
      angleRad,
      matchedIndex: bestIdx,
    };
  }

  if (r <= outerMax) {
    // Busca o botão visível mais próximo no Arco Externo
    let bestIdx: number | null = null;
    let bestDist = Infinity;
    for (const item of params.outerArc.items) {
      if (!item.visible) continue;
      const d = Math.hypot(params.pointerX - item.x, params.pointerY - item.y);
      if (d < bestDist && d <= params.outerArc.diameterPx * 0.85) {
        bestDist = d;
        bestIdx = item.index;
      }
    }
    return {
      zone: "outer_arc",
      radiusPx: r,
      angleRad,
      matchedIndex: bestIdx,
    };
  }

  return {
    zone: "outside",
    radiusPx: r,
    angleRad,
    matchedIndex: null,
  };
}

/* ============================================================================
 * MENU DE CONTEXTO INTELIGENTE POR TIPO DE PEÇA E POSICIONAMENTO ANTI-COLISÃO
 * ============================================================================ */

export type PrumoSelectionGeometryKind =
  | "circle_arc"
  | "rect_poly"
  | "line_segment"
  | "multi_or_other";

export interface PrumoContextActionItem {
  id:
    | "edit_dim"
    | "move"
    | "copy"
    | "rotate"
    | "mirror"
    | "trim"
    | "offset"
    | "array"
    | "prop"
    | "delete"
    | "clear";
  label: string;
  shortLabel: string;
}

export function classifySelectedEntitiesForContext(
  selectedEntities: Entity[],
): PrumoSelectionGeometryKind {
  if (selectedEntities.length === 1) {
    const t = selectedEntities[0]!.type;
    if (t === "circle" || t === "arc") return "circle_arc";
    if (t === "line") return "line_segment";
    if (t === "polyline" || t === "ellipse" || t === "path") {
      return "rect_poly";
    }
  }
  return "multi_or_other";
}

export function resolvePrumoSelectionContextActions(
  selectedEntities: Entity[],
): {
  geometryKind: PrumoSelectionGeometryKind;
  actions: PrumoContextActionItem[];
} {
  const geometryKind = classifySelectedEntitiesForContext(selectedEntities);

  if (geometryKind === "circle_arc") {
    return {
      geometryKind,
      actions: [
        { id: "edit_dim", label: "Ø / R ✎", shortLabel: "Ø/R ✎" },
        { id: "move", label: "✥ Mover", shortLabel: "Mover" },
        { id: "copy", label: "⧉ Copiar", shortLabel: "Copiar" },
        { id: "array", label: "# Array", shortLabel: "Array" },
        { id: "prop", label: "🎚️ Prop", shortLabel: "Prop" },
        { id: "delete", label: "🗑️", shortLabel: "🗑️" },
        { id: "clear", label: "✕", shortLabel: "✕" },
      ],
    };
  }

  if (geometryKind === "line_segment") {
    return {
      geometryKind,
      actions: [
        { id: "edit_dim", label: "L / ∠ ✎", shortLabel: "L/∠ ✎" },
        { id: "move", label: "✥ Mover", shortLabel: "Mover" },
        { id: "copy", label: "⧉ Copiar", shortLabel: "Copiar" },
        { id: "trim", label: "✂️ Trim", shortLabel: "Trim" },
        { id: "offset", label: "∥ Offset", shortLabel: "Offset" },
        { id: "prop", label: "🎚️ Prop", shortLabel: "Prop" },
        { id: "delete", label: "🗑️", shortLabel: "🗑️" },
        { id: "clear", label: "✕", shortLabel: "✕" },
      ],
    };
  }

  // Retângulo / Polilinha / Múltiplos
  return {
    geometryKind,
    actions: [
      { id: "edit_dim", label: "L × A ✎", shortLabel: "L×A ✎" },
      { id: "move", label: "✥ Mover", shortLabel: "Mover" },
      { id: "copy", label: "⧉ Copiar", shortLabel: "Copiar" },
      { id: "rotate", label: "↻ Girar", shortLabel: "Girar" },
      { id: "mirror", label: "⇄ Espelhar", shortLabel: "Espelhar" },
      { id: "array", label: "# Array", shortLabel: "Array" },
      { id: "prop", label: "🎚️ Prop", shortLabel: "Prop" },
      { id: "delete", label: "🗑️", shortLabel: "🗑️" },
      { id: "clear", label: "✕", shortLabel: "✕" },
    ],
  };
}

/**
 * Calcula a posição de tela (x, y) da cápsula de contexto da seleção:
 *  - Fica fora da caixa delimitadora da peça selecionada (acima ou abaixo)
 *  - Respeita guarda de borda de 16px (nunca encosta na borda do sistema)
 *  - Evita colisão com a Ilha Superior (top < 54px) e com o Núcleo / Satélite inferior (bottom > H - 86px)
 */
export function computePrumoContextCapsulePosition(params: {
  selectedEntities: Entity[];
  view: { k: number; tx: number; ty: number };
  viewportWidth: number;
  viewportHeight: number;
  capsuleWidthPx?: number;
  capsuleHeightPx?: number;
}): { left: number; top: number } {
  const b = computeEntitiesBounds(params.selectedEntities);
  const w = Math.max(320, params.viewportWidth);
  const h = Math.max(320, params.viewportHeight);
  const capW = Math.min(w - 32, params.capsuleWidthPx ?? 340);
  const capH = params.capsuleHeightPx ?? 36;

  if (!b) {
    return {
      left: Math.max(16, Math.round((w - capW) / 2)),
      top: Math.max(54, h - 104),
    };
  }

  const screenMinX = b.minX * params.view.k + params.view.tx;
  const screenMaxX = b.maxX * params.view.k + params.view.tx;
  const screenMinY = b.minY * params.view.k + params.view.ty;
  const screenMaxY = b.maxY * params.view.k + params.view.ty;

  const centerX = (screenMinX + screenMaxX) / 2;
  const clampedLeft = Math.max(16, Math.min(w - capW - 16, Math.round(centerX - capW / 2)));

  // Tenta posicionar 14px acima da caixa delimitadora da peça; se colidir com o topo (< 54px), posiciona abaixo
  const candidateAbove = Math.round(screenMinY - capH - 14);
  const candidateBelow = Math.round(screenMaxY + 14);
  const safeBottomLimit = h - 88 - capH;

  let top = candidateAbove;
  if (top < 54) {
    if (candidateBelow <= safeBottomLimit) {
      top = candidateBelow;
    } else {
      top = Math.max(54, Math.min(safeBottomLimit, 58));
    }
  } else if (top > safeBottomLimit) {
    top = Math.max(54, safeBottomLimit);
  }

  return { left: clampedLeft, top };
}
