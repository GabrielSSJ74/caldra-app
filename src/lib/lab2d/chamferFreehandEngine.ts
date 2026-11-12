/**
 * CALDRA CHAMFER CAD 2D — MOTOR DE DESENHO LIVRE VETORIAL EM TEMPO REAL (`FREEHAND SKETCH`)
 *
 * Pipeline Matemático de 3 Estágios (Seção 4.2):
 *  1. Pré-Suavização de Tremor por Média Móvel Ponderada por Comprimento de Arco (janela 5..9,
 *     travando 100% o ponto inicial e o ponto final);
 *  2. Simplificação Ramer-Douglas-Peucker (`RDP`) convertendo a tolerância em pixels (0.5..6.0 px,
 *     padrão 1.5 px) uma única vez para milímetros reais do mundo (`epsilonMm = epsilonPx / k`),
 *     limitando a no máximo 400 vértices para performance contínua a 60 FPS;
 *  3. Modos de Saída Selecionáveis:
 *      • `fiel`: pré-suavização leve + RDP fiel ao contorno manual;
 *      • `suave`: arcos circulares tangentes (`bulges`) limitados por desvio <= epsilonMm sem encolher cantos vivos;
 *      • `poligonal`: simplificação mais forte + consolidação colinear em segmentos retos limpos.
 *  - Amortecimento Linear de Snap nos Últimos 10% do Comprimento do Traço (evita degrau brusco).
 *  - Projeção Ortogonal `ORTO: ON` em degraus de 0° / 90°.
 *  - Papel de Uso: `geometry` (Corte CNC / Extrusão 3D) vs. `markup` (Marcação/Rascunho excluído do DXF/BOM/3D).
 *  - Sugestão Inteligente Não-Intrusiva de Primitiva (Círculo Ø ou Retângulo L×A).
 */

import type { Vec2 } from "@/lib/geometry/types";
import { dist, uid, type Entity } from "@/lib/lab2d/core";

export type FreehandSmoothingMode = "fiel" | "suave" | "poligonal";
export type FreehandUsageRole = "geometry" | "markup";

export interface FreehandMetadata {
  smoothingMode: FreehandSmoothingMode;
  tolerancePx: number;
  epsilonMm: number;
  usageRole: FreehandUsageRole;
  rawPointCount: number;
}

export interface FreehandLiveMetrics {
  totalLengthMm: number;
  deltaXMm: number;
  deltaYMm: number;
  pointCount: number;
  canClose: boolean;
  startEndDistanceMm: number;
}

export type FreehandPrimitiveSuggestion =
  | {
      kind: "circle";
      cx: number;
      cy: number;
      r: number;
      diameterMm: number;
      label: string;
    }
  | {
      kind: "rect";
      x: number;
      y: number;
      widthMm: number;
      heightMm: number;
      label: string;
    };

export const FREEHAND_MAX_VERTICES = 400;

/* ============================================================================
 * 1. MÉTRICAS EM TEMPO REAL E AMOSTRAGEM INCREMENTAL DE PONTEIRO
 * ============================================================================ */

/** Filtra micro-ruído sub-pixel ao capturar eventos de ponteiro em alta frequência */
export function appendFreehandSample(
  existing: readonly Vec2[],
  candidate: Vec2,
  minStepMm = 0.08,
): Vec2[] {
  if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) {
    return [...existing];
  }
  if (existing.length === 0) {
    return [{ x: candidate.x, y: candidate.y }];
  }
  const last = existing[existing.length - 1]!;
  if (dist(last, candidate) < minStepMm) {
    return [...existing];
  }
  return [...existing, { x: candidate.x, y: candidate.y }];
}

export function computeCumulativeArcLengths(pts: readonly Vec2[]): number[] {
  if (pts.length === 0) return [];
  const lengths = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += dist(pts[i - 1]!, pts[i]!);
    lengths.push(total);
  }
  return lengths;
}

export function computeFreehandLiveMetrics(
  pts: readonly Vec2[],
  closeSnapRadiusMm = 8,
): FreehandLiveMetrics {
  if (pts.length === 0) {
    return {
      totalLengthMm: 0,
      deltaXMm: 0,
      deltaYMm: 0,
      pointCount: 0,
      canClose: false,
      startEndDistanceMm: 0,
    };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let totalLen = 0;

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (i > 0) totalLen += dist(pts[i - 1]!, p);
  }

  const startEndDist = pts.length >= 2 ? dist(pts[0]!, pts[pts.length - 1]!) : 0;
  const canClose = pts.length >= 3 && totalLen > closeSnapRadiusMm * 1.5;

  return {
    totalLengthMm: Number(totalLen.toFixed(2)),
    deltaXMm: Number((maxX - minX).toFixed(2)),
    deltaYMm: Number((maxY - minY).toFixed(2)),
    pointCount: pts.length,
    canClose,
    startEndDistanceMm: Number(startEndDist.toFixed(2)),
  };
}

/* ============================================================================
 * 2. ESTÁGIO 1 — PRÉ-SUAVIZAÇÃO POR COMPRIMENTO DE ARCO (PONTAS 100% TRAVADAS)
 * ============================================================================ */

function turnAngleRadians(a: Vec2, b: Vec2, c: Vec2): number {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  const lu = Math.hypot(ux, uy);
  const lv = Math.hypot(vx, vy);
  if (lu < 1e-9 || lv < 1e-9) return 0;
  const cosT = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)));
  return Math.acos(cosT);
}

/**
 * Média móvel ponderada por comprimento de arco com janela `windowSize` (5 a 9 amostras),
 * preservando 100% imóveis `pts[0]`, `pts[last]` e quinas intencionais agudas.
 */
export function smoothFreehandStrokeArcLength(
  pts: readonly Vec2[],
  windowSize = 7,
  protectSharpCornersRad = (68 * Math.PI) / 180,
): Vec2[] {
  if (pts.length <= 2) return pts.map((p) => ({ ...p }));

  const halfWin = Math.max(1, Math.floor(Math.min(9, Math.max(3, windowSize)) / 2));
  const arcLens = computeCumulativeArcLengths(pts);
  const totalLen = arcLens[arcLens.length - 1] ?? 0;
  if (totalLen < 1e-6) return pts.map((p) => ({ ...p }));

  const avgSeg = totalLen / Math.max(1, pts.length - 1);
  const sigmaArc = Math.max(1e-4, avgSeg * halfWin * 0.85);

  const out: Vec2[] = [{ ...pts[0]! }];

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    const next = pts[i + 1]!;

    // Protege cantos vivos intencionais (não achata nem arredonda quinas bruscas)
    if (turnAngleRadians(prev, cur, next) > protectSharpCornersRad) {
      out.push({ ...cur });
      continue;
    }

    const sCenter = arcLens[i]!;
    let sumW = 0;
    let sumX = 0;
    let sumY = 0;

    const jStart = Math.max(0, i - halfWin);
    const jEnd = Math.min(pts.length - 1, i + halfWin);
    for (let j = jStart; j <= jEnd; j++) {
      const ds = Math.abs(arcLens[j]! - sCenter);
      const w = Math.exp(-(ds * ds) / (2 * sigmaArc * sigmaArc));
      sumW += w;
      sumX += pts[j]!.x * w;
      sumY += pts[j]!.y * w;
    }

    out.push(
      sumW > 0
        ? { x: sumX / sumW, y: sumY / sumW }
        : { ...cur },
    );
  }

  out.push({ ...pts[pts.length - 1]! });
  return out;
}

/* ============================================================================
 * 3. ESTÁGIO 2 — SIMPLIFICAÇÃO RAMER-DOUGLAS-PEUCKER (`RDP`) COM TETO DE 400 VÉRTICES
 * ============================================================================ */

function perpendicularDistanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function rdpOnce(pts: readonly Vec2[], epsilonMm: number): Vec2[] {
  if (pts.length <= 2) return pts.map((p) => ({ ...p }));
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;

  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    if (end - start <= 1) continue;
    let maxDist = -1;
    let splitIdx = -1;
    const a = pts[start]!;
    const b = pts[end]!;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistanceToSegment(pts[i]!, a, b);
      if (d > maxDist) {
        maxDist = d;
        splitIdx = i;
      }
    }
    if (maxDist > epsilonMm && splitIdx !== -1) {
      keep[splitIdx] = 1;
      stack.push([start, splitIdx], [splitIdx, end]);
    }
  }

  const out: Vec2[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (keep[i]) out.push({ ...pts[i]! });
  }
  return out;
}

export function simplifyFreehandRDP(
  pts: readonly Vec2[],
  epsilonMm: number,
  maxVertices = FREEHAND_MAX_VERTICES,
): Vec2[] {
  if (pts.length <= 2) return pts.map((p) => ({ ...p }));
  let eps = Math.max(1e-3, epsilonMm);
  let simplified = rdpOnce(pts, eps);
  let guard = 0;
  while (simplified.length > maxVertices && guard < 14) {
    eps *= 1.35;
    simplified = rdpOnce(simplified, eps);
    guard++;
  }
  if (simplified.length > maxVertices) {
    // Fallback uniforme garantido <= maxVertices mantendo extremidades exatas
    const downsampled: Vec2[] = [{ ...simplified[0]! }];
    const step = (simplified.length - 1) / (maxVertices - 1);
    for (let k = 1; k < maxVertices - 1; k++) {
      downsampled.push({ ...simplified[Math.round(k * step)]! });
    }
    downsampled.push({ ...simplified[simplified.length - 1]! });
    return downsampled;
  }
  return simplified;
}

/* ============================================================================
 * 4. AMORTECIMENTO LINEAR NOS ÚLTIMOS 10% DO ARCO (SNAP DE PONTA SEM DEGRAU)
 * ============================================================================ */

/**
 * Conecta o início e/ou o fim do traço aos pontos magnéticos de Snap, distribuindo o
 * vetor de correção linearmente pelos 10% iniciais / finais do comprimento de arco
 * para eliminar qualquer "degrau" ou "dente" artificial na chegada ao Snap!
 */
export function applyEndpointSnapWithTailDamping(
  pts: readonly Vec2[],
  startSnapWorld: Vec2 | null,
  endSnapWorld: Vec2 | null,
  dampingFraction = 0.1,
): Vec2[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) {
    const single = endSnapWorld ?? startSnapWorld ?? pts[0]!;
    return [{ x: single.x, y: single.y }];
  }

  const adjusted = pts.map((p) => ({ ...p }));
  const arcLens = computeCumulativeArcLengths(adjusted);
  const totalLen = arcLens[arcLens.length - 1] ?? 0;
  const safeRatio = Math.max(0.02, Math.min(0.45, dampingFraction));

  if (startSnapWorld) {
    const dx0 = startSnapWorld.x - adjusted[0]!.x;
    const dy0 = startSnapWorld.y - adjusted[0]!.y;
    const headSpan = totalLen * safeRatio;
    adjusted[0] = { x: startSnapWorld.x, y: startSnapWorld.y };
    if (headSpan > 1e-6) {
      for (let i = 1; i < adjusted.length - 1; i++) {
        const s = arcLens[i]!;
        if (s >= headSpan) break;
        const w = 1 - s / headSpan;
        adjusted[i] = {
          x: adjusted[i]!.x + dx0 * w,
          y: adjusted[i]!.y + dy0 * w,
        };
      }
    }
  }

  if (endSnapWorld) {
    const lastIdx = adjusted.length - 1;
    const dxE = endSnapWorld.x - adjusted[lastIdx]!.x;
    const dyE = endSnapWorld.y - adjusted[lastIdx]!.y;
    const tailSpan = totalLen * safeRatio;
    const tailStartArc = totalLen - tailSpan;

    if (tailSpan > 1e-6) {
      for (let i = 1; i < lastIdx; i++) {
        const s = arcLens[i]!;
        if (s <= tailStartArc) continue;
        const w = Math.max(0, Math.min(1, (s - tailStartArc) / tailSpan));
        adjusted[i] = {
          x: adjusted[i]!.x + dxE * w,
          y: adjusted[i]!.y + dyE * w,
        };
      }
    }
    adjusted[lastIdx] = { x: endSnapWorld.x, y: endSnapWorld.y };
  }

  return adjusted;
}

/* ============================================================================
 * 5. PROJEÇÃO ORTOGONAL (`ORTO: ON`) E MODOS DE SAÍDA (`FIEL | SUAVE | POLIGONAL`)
 * ============================================================================ */

/** Projeta os segmentos simplificados em degraus ortogonais 0° / 90° quando `ORTO: ON` */
export function projectFreehandOrthoSteps(pts: readonly Vec2[], closed = false): Vec2[] {
  if (pts.length <= 1) return pts.map((p) => ({ ...p }));
  const out: Vec2[] = [{ ...pts[0]! }];

  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1]!;
    const target = pts[i]!;
    const dx = target.x - prev.x;
    const dy = target.y - prev.y;
    if (Math.abs(dx) < 1e-4 || Math.abs(dy) < 1e-4) {
      out.push({ ...target });
      continue;
    }
    if (Math.abs(dx) >= Math.abs(dy)) {
      // Degrau horizontal dominante; se for o último ponto, adiciona cotovelo para preservar a ponta exata
      if (i === pts.length - 1) {
        out.push({ x: target.x, y: prev.y }, { x: target.x, y: target.y });
      } else {
        out.push({ x: target.x, y: prev.y });
      }
    } else {
      if (i === pts.length - 1) {
        out.push({ x: prev.x, y: target.y }, { x: target.x, y: target.y });
      } else {
        out.push({ x: prev.x, y: target.y });
      }
    }
  }

  if (closed && out.length >= 3) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (Math.abs(first.x - last.x) > 1e-3 && Math.abs(first.y - last.y) > 1e-3) {
      out.push({ x: first.x, y: last.y });
    }
  }

  // Remove vértices colineares redundantes consecutivos
  const cleaned: Vec2[] = [out[0]!];
  for (let i = 1; i < out.length - 1; i++) {
    const a = cleaned[cleaned.length - 1]!;
    const b = out[i]!;
    const c = out[i + 1]!;
    if (dist(a, b) < 1e-4) continue;
    const sameX = Math.abs(a.x - b.x) < 1e-4 && Math.abs(b.x - c.x) < 1e-4;
    const sameY = Math.abs(a.y - b.y) < 1e-4 && Math.abs(b.y - c.y) < 1e-4;
    if (sameX || sameY) continue;
    cleaned.push(b);
  }
  const finalPt = out[out.length - 1]!;
  if (dist(cleaned[cleaned.length - 1]!, finalPt) >= 1e-4) {
    cleaned.push(finalPt);
  }
  return cleaned;
}

/** Consolida segmentos quase colineares no modo `poligonal` */
function mergeNearCollinearVertices(pts: readonly Vec2[], maxDeflectionDeg = 8.5): Vec2[] {
  if (pts.length <= 2) return pts.map((p) => ({ ...p }));
  const maxRad = (maxDeflectionDeg * Math.PI) / 180;
  const out: Vec2[] = [{ ...pts[0]! }];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    if (turnAngleRadians(a, b, c) <= maxRad) continue;
    out.push({ ...b });
  }
  out.push({ ...pts[pts.length - 1]! });
  return out;
}

/**
 * Calcula `bulges` analíticos de arcos circulares suaves (`bulge = tan(θ / 4)`) para o modo `suave`,
 * limitando estritamente a flecha máxima a `<= maxSagittaMm` para nunca deformar nem encolher cantos vivos!
 */
export function computeSmoothPolylineBulges(
  pts: readonly Vec2[],
  closed: boolean,
  maxSagittaMm: number,
): number[] | undefined {
  const n = pts.length;
  if (n < 3) return undefined;

  const segCount = closed ? n : n - 1;
  const bulges = new Array<number>(n).fill(0);
  const sharpLimitRad = (52 * Math.PI) / 180;
  let hasNonZero = false;

  for (let i = 0; i < segCount; i++) {
    const pA = pts[i]!;
    const pB = pts[(i + 1) % n]!;
    const chord = dist(pA, pB);
    if (chord < 1e-4) continue;

    const pPrev = i > 0 ? pts[i - 1]! : closed ? pts[(i - 1 + n) % n]! : null;
    const pNext = i + 2 < n ? pts[i + 2]! : closed ? pts[(i + 2) % n]! : null;

    // Estima curvatura suave assinada nos nós A e B usando produto vetorial unitário
    let signedTurnSum = 0;
    let count = 0;

    if (pPrev) {
      const ang = turnAngleRadians(pPrev, pA, pB);
      if (ang < sharpLimitRad) {
        const cross =
          (pA.x - pPrev.x) * (pB.y - pA.y) - (pA.y - pPrev.y) * (pB.x - pA.x);
        signedTurnSum += (cross >= 0 ? 1 : -1) * ang;
        count++;
      }
    }
    if (pNext) {
      const ang = turnAngleRadians(pA, pB, pNext);
      if (ang < sharpLimitRad) {
        const cross =
          (pB.x - pA.x) * (pNext.y - pB.y) - (pB.y - pA.y) * (pNext.x - pB.x);
        signedTurnSum += (cross >= 0 ? 1 : -1) * ang;
        count++;
      }
    }

    if (count === 0) continue;
    const avgTurn = signedTurnSum / count;
    // Bulge analítico: flecha s = (chord / 2) * |bulge|
    let rawBulge = Math.tan(avgTurn * 0.22);
    const maxAllowedBulge = Math.min(0.45, (2 * Math.max(0.05, maxSagittaMm)) / chord);
    if (Math.abs(rawBulge) > maxAllowedBulge) {
      rawBulge = Math.sign(rawBulge) * maxAllowedBulge;
    }

    if (Math.abs(rawBulge) > 1e-3) {
      bulges[i] = Number(rawBulge.toFixed(6));
      hasNonZero = true;
    }
  }

  return hasNonZero ? bulges : undefined;
}

export interface ProcessFreehandStrokeOptions {
  rawPointsWorld: readonly Vec2[];
  cameraZoomK: number;
  tolerancePx?: number;
  mode?: FreehandSmoothingMode;
  usageRole?: FreehandUsageRole;
  orthoOn?: boolean;
  startSnapWorld?: Vec2 | null;
  endSnapWorld?: Vec2 | null;
  forceClose?: boolean;
  closeSnapRadiusMm?: number;
  activeLayer?: string;
  strokeColor?: string | null;
}

export interface ProcessedFreehandResult {
  entity: Entity;
  suggestion: FreehandPrimitiveSuggestion | null;
  metrics: FreehandLiveMetrics;
}

/**
 * Executa o Pipeline Matemático Completo de 3 Estágios e constrói a entidade `polyline` nativa do CHAMFER.
 */
export function buildFreehandVectorEntity(
  opts: ProcessFreehandStrokeOptions,
): ProcessedFreehandResult | null {
  const {
    rawPointsWorld,
    cameraZoomK,
    tolerancePx = 1.5,
    mode = "suave",
    usageRole = "geometry",
    orthoOn = false,
    startSnapWorld = null,
    endSnapWorld = null,
    forceClose = false,
    closeSnapRadiusMm = 8,
    activeLayer = "corte",
    strokeColor = null,
  } = opts;

  if (rawPointsWorld.length < 2) return null;

  const safeK = Math.max(1e-4, Number.isFinite(cameraZoomK) ? cameraZoomK : 1);
  const clampedTolPx = Math.max(0.5, Math.min(6.0, tolerancePx));
  const baseEpsilonMm = clampedTolPx / safeK;

  // Verifica se o fim do traço enganchou no próprio ponto inicial (fechamento magnético explícito)
  const effectiveStart = startSnapWorld ?? rawPointsWorld[0]!;
  const rawLast = endSnapWorld ?? rawPointsWorld[rawPointsWorld.length - 1]!;
  const rawMetrics = computeFreehandLiveMetrics(rawPointsWorld, closeSnapRadiusMm);
  const snappedToOwnStart =
    rawMetrics.canClose && dist(effectiveStart, rawLast) <= closeSnapRadiusMm;
  const shouldClose = forceClose || snappedToOwnStart;
  const finalEndSnap = snappedToOwnStart ? effectiveStart : endSnapWorld;

  // 0. Amortecimento linear de 10% nas pontas com Snap ativo (zero degrau artificial)
  const dampedPts = applyEndpointSnapWithTailDamping(
    rawPointsWorld,
    startSnapWorld,
    finalEndSnap,
    0.1,
  );

  // 1. Pré-suavização por comprimento de arco (pontas 100% travadas)
  const windowSize = mode === "suave" ? 9 : 5;
  const smoothedPts = smoothFreehandStrokeArcLength(
    dampedPts,
    windowSize,
    mode === "poligonal" ? (50 * Math.PI) / 180 : (68 * Math.PI) / 180,
  );

  // 2. Simplificação RDP em milímetros reais com teto de 400 vértices
  const modeEpsilonMm =
    mode === "poligonal"
      ? baseEpsilonMm * 2.15
      : mode === "fiel"
        ? baseEpsilonMm * 0.85
        : baseEpsilonMm;

  let finalPts = simplifyFreehandRDP(smoothedPts, modeEpsilonMm, FREEHAND_MAX_VERTICES);

  if (mode === "poligonal") {
    finalPts = mergeNearCollinearVertices(finalPts, 8.5);
  }

  if (orthoOn) {
    finalPts = projectFreehandOrthoSteps(finalPts, shouldClose);
  }

  // 3. Fechamento explícito sem duplicar o último vértice sobre o primeiro
  let closed = false;
  if (shouldClose && finalPts.length >= 3) {
    if (dist(finalPts[0]!, finalPts[finalPts.length - 1]!) < Math.max(1e-2, closeSnapRadiusMm * 0.5)) {
      finalPts = finalPts.slice(0, -1);
    }
    if (finalPts.length >= 3) {
      closed = true;
    }
  }

  if (finalPts.length < 2) return null;

  const bulges =
    mode === "suave" && !orthoOn
      ? computeSmoothPolylineBulges(finalPts, closed, baseEpsilonMm * 1.2)
      : undefined;

  const isMarkup = usageRole === "markup";
  const resolvedLayer = isMarkup
    ? "referencia"
    : activeLayer === "anotacoes" || activeLayer === "referencia"
      ? "corte"
      : activeLayer;

  const freehandMeta: FreehandMetadata = {
    smoothingMode: mode,
    tolerancePx: clampedTolPx,
    epsilonMm: Number(modeEpsilonMm.toFixed(5)),
    usageRole,
    rawPointCount: rawPointsWorld.length,
  };

  const entity: Entity = {
    id: uid(),
    layer: resolvedLayer,
    type: "polyline",
    pts: finalPts.map((p) => ({
      x: Number(p.x.toFixed(4)),
      y: Number(p.y.toFixed(4)),
    })),
    closed,
    ...(bulges ? { bulges } : {}),
    ...(isMarkup ? { isConstruction: true } : {}),
    cnc: {
      role: isMarkup ? "REFERENCE" : "CUT",
    },
    params: {
      ...(isMarkup
        ? {
            excludeFrom3D: true,
            strokeColor: strokeColor || "#F59E0B",
            dash: [6, 4],
          }
        : strokeColor
          ? { strokeColor }
          : {}),
      freehand: freehandMeta,
    },
  };

  const suggestion =
    usageRole === "geometry" && !orthoOn
      ? detectFreehandPrimitiveSuggestion(rawPointsWorld)
      : null;

  return {
    entity,
    suggestion,
    metrics: computeFreehandLiveMetrics(entity.pts, closeSnapRadiusMm),
  };
}

/* ============================================================================
 * 6. SUGESTÃO INTELIGENTE NÃO-INTRUSIVA DE PRIMITIVA (CÍRCULO Ø / RETÂNGULO)
 * ============================================================================ */

export function detectFreehandPrimitiveSuggestion(
  pts: readonly Vec2[],
): FreehandPrimitiveSuggestion | null {
  if (pts.length < 10) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const w = maxX - minX;
  const h = maxY - minY;
  const diag = Math.hypot(w, h);
  if (diag < 6) return null;

  // Precisa ser um traço razoavelmente fechado pelo usuário
  const gap = dist(pts[0]!, pts[pts.length - 1]!);
  if (gap > diag * 0.34) return null;

  // 1. Teste de Circularidade (aspecto ~1:1 + erro radial RMS baixo)
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const aspect = Math.min(w, h) / Math.max(w, h);

  if (aspect >= 0.76) {
    let sumR = 0;
    for (const p of pts) sumR += Math.hypot(p.x - cx, p.y - cy);
    const meanR = sumR / pts.length;
    if (meanR >= 3) {
      let sqErr = 0;
      for (const p of pts) {
        const dr = Math.hypot(p.x - cx, p.y - cy) - meanR;
        sqErr += dr * dr;
      }
      const rmsRatio = Math.sqrt(sqErr / pts.length) / meanR;
      if (rmsRatio <= 0.125) {
        const roundedR = Math.max(1, Number(meanR.toFixed(1)));
        const dia = Number((roundedR * 2).toFixed(1));
        return {
          kind: "circle",
          cx: Number(cx.toFixed(2)),
          cy: Number(cy.toFixed(2)),
          r: roundedR,
          diameterMm: dia,
          label: `Converter em Círculo Ø ${String(dia).replace(".", ",")} mm`,
        };
      }
    }
  }

  // 2. Teste de Retangularidade alinhada aos eixos (proximidade média às 4 bordas da BBox)
  if (w >= 5 && h >= 5) {
    let edgeErrSum = 0;
    for (const p of pts) {
      const dEdge = Math.min(
        Math.abs(p.x - minX),
        Math.abs(p.x - maxX),
        Math.abs(p.y - minY),
        Math.abs(p.y - maxY),
      );
      edgeErrSum += dEdge;
    }
    const meanEdgeErr = edgeErrSum / pts.length;
    if (meanEdgeErr <= Math.min(w, h) * 0.095) {
      const rw = Math.max(1, Number(w.toFixed(1)));
      const rh = Math.max(1, Number(h.toFixed(1)));
      return {
        kind: "rect",
        x: Number(minX.toFixed(2)),
        y: Number(minY.toFixed(2)),
        widthMm: rw,
        heightMm: rh,
        label: `Converter em Retângulo ${String(rw).replace(".", ",")}×${String(rh).replace(".", ",")} mm`,
      };
    }
  }

  return null;
}
