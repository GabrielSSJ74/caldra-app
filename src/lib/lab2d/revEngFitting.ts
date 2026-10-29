/**
 * CALDRA CHAMFER CAD — MOTOR DE AJUSTE GEOMÉTRICO ORTOGONAL (MÍNIMOS QUADRADOS)
 * E VINCULAÇÃO DO CADERNO DE MEDIÇÕES (Seções 5 e 7 · Teste T10)
 *
 * Implementa:
 * 1. Ajuste ortogonal de reta (PCA / SVD 2x2 exato)
 * 2. Ajuste ortogonal de círculo e arco curto (< 60°) via inicialização de circumcírculo
 *    + refinamento não-linear de Levenberg–Marquardt (sem viés algébrico de Kåsa)
 * 3. Simplificação de polilinha Ramer–Douglas–Peucker (RDP) em milímetros reais
 * 4. Spline controlada com cálculo de erro RMS e desvio máximo em mm
 * 5. Extração de valor nominal de entidades CAD para o Caderno de Medições
 */

import { uid, closestOnSegment, segmentsOf, type Entity, type Vec2 } from "./core";
import type {
  FittedPrimitiveCandidate,
  MeasurementKind,
  MeasurementRecord,
} from "./revEngTypes";

const EPS = 1e-12;

export interface OrthogonalLineFitResult {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lengthMm: number;
  angleDeg: number;
  rmsMm: number;
  maxDeviationMm: number;
  pointCount: number;
  entity: Entity;
}

export interface OrthogonalCircleArcFitResult {
  cx: number;
  cy: number;
  r: number;
  a0: number;
  a1: number;
  angularSpanDeg: number;
  isFullCircle: boolean;
  rmsMm: number;
  maxDeviationMm: number;
  pointCount: number;
  collinearWarning?: string;
  entity: Entity;
}

/**
 * 1. Ajuste Ortogonal de Reta por Componentes Principais (PCA 2D exato).
 */
export function fitOrthogonalLine(
  points: Vec2[],
  layer = "corte",
): OrthogonalLineFitResult {
  if (!points || points.length < 2) {
    throw new Error("São necessários pelo menos 2 pontos para ajustar uma reta.");
  }

  const n = points.length;
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p.x;
    my += p.y;
  }
  mx /= n;
  my /= n;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }

  // Autovetor principal da matriz de covariância 2x2
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let ux = Math.cos(theta);
  let uy = Math.sin(theta);

  // Orienta o vetor diretor na direção de P[0] -> P[n-1]
  const overallDx = points[n - 1]!.x - points[0]!.x;
  const overallDy = points[n - 1]!.y - points[0]!.y;
  if (overallDx * ux + overallDy * uy < 0) {
    ux = -ux;
    uy = -uy;
  }

  const nx = -uy;
  const ny = ux;

  let tMin = Infinity;
  let tMax = -Infinity;
  let sumSq = 0;
  let maxDeviationMm = 0;

  for (const p of points) {
    const dx = p.x - mx;
    const dy = p.y - my;
    const t = dx * ux + dy * uy;
    const orthoDist = Math.abs(dx * nx + dy * ny);
    if (t < tMin) tMin = t;
    if (t > tMax) tMax = t;
    sumSq += orthoDist * orthoDist;
    if (orthoDist > maxDeviationMm) maxDeviationMm = orthoDist;
  }

  const x1 = mx + tMin * ux;
  const y1 = my + tMin * uy;
  const x2 = mx + tMax * ux;
  const y2 = my + tMax * uy;
  const lengthMm = Math.hypot(x2 - x1, y2 - y1);
  const angleDeg = (((Math.atan2(-(y2 - y1), x2 - x1) * 180) / Math.PI) + 360) % 360;
  const rmsMm = Math.sqrt(sumSq / n);

  const entity: Entity = {
    id: uid(),
    layer,
    type: "line",
    x1,
    y1,
    x2,
    y2,
    params: {
      revEngStatus: "AJUSTADO",
      fitRmsMm: Number(rmsMm.toFixed(4)),
      fitMaxDevMm: Number(maxDeviationMm.toFixed(4)),
      fitPointCount: n,
    },
  };

  return {
    x1,
    y1,
    x2,
    y2,
    lengthMm,
    angleDeg,
    rmsMm,
    maxDeviationMm,
    pointCount: n,
    entity,
  };
}

/**
 * Calcula o circumcírculo exato de 3 pontos. Retorna null se colineares.
 */
function circumcircle3Pts(p1: Vec2, p2: Vec2, p3: Vec2): { cx: number; cy: number; r: number } | null {
  const ax = p1.x;
  const ay = p1.y;
  const bx = p2.x;
  const by = p2.y;
  const cx = p3.x;
  const cy = p3.y;

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-9) return null;

  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;

  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);

  if (!Number.isFinite(r) || r <= 0 || r > 1e7) return null;
  return { cx: ux, cy: uy, r };
}

/**
 * Estimativa algébrica de Taubin centrada na média para inicialização.
 */
function algebraicCircleGuess(points: Vec2[]): { cx: number; cy: number; r: number } | null {
  const n = points.length;
  if (n < 3) return null;
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p.x;
    my += p.y;
  }
  mx /= n;
  my /= n;

  let suu = 0;
  let suv = 0;
  let svv = 0;
  let suuu = 0;
  let svvv = 0;
  let suvv = 0;
  let svuu = 0;

  for (const p of points) {
    const u = p.x - mx;
    const v = p.y - my;
    suu += u * u;
    suv += u * v;
    svv += v * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }

  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9) return null;

  const rhs1 = 0.5 * (suuu + suvv);
  const rhs2 = 0.5 * (svvv + svuu);

  const uc = (rhs1 * svv - rhs2 * suv) / det;
  const vc = (suu * rhs2 - suv * rhs1) / det;
  const cx = mx + uc;
  const cy = my + vc;

  let rSum = 0;
  for (const p of points) {
    rSum += Math.hypot(p.x - cx, p.y - cy);
  }
  const r = rSum / n;
  if (!Number.isFinite(r) || r <= 0 || r > 1e7) return null;
  return { cx, cy, r };
}

/**
 * Avalia os resíduos ortogonais e o raio ótimo analítico R = média(r_i) para um centro (cx, cy).
 */
function evaluateCircleCenter(points: Vec2[], cx: number, cy: number): {
  r: number;
  residuals: number[];
  ux: number[];
  uy: number[];
  costSq: number;
  rmsMm: number;
  maxDeviationMm: number;
} {
  const n = points.length;
  const dists = new Array<number>(n);
  const ux = new Array<number>(n);
  const uy = new Array<number>(n);
  let rSum = 0;

  for (let i = 0; i < n; i++) {
    const dx = points[i]!.x - cx;
    const dy = points[i]!.y - cy;
    const d = Math.hypot(dx, dy);
    dists[i] = d;
    if (d > EPS) {
      ux[i] = dx / d;
      uy[i] = dy / d;
    } else {
      ux[i] = 1;
      uy[i] = 0;
    }
    rSum += d;
  }

  const r = rSum / n;
  const residuals = new Array<number>(n);
  let costSq = 0;
  let maxDeviationMm = 0;

  for (let i = 0; i < n; i++) {
    const e = dists[i]! - r;
    residuals[i] = e;
    costSq += e * e;
    const absE = Math.abs(e);
    if (absE > maxDeviationMm) maxDeviationMm = absE;
  }

  return {
    r,
    residuals,
    ux,
    uy,
    costSq,
    rmsMm: Math.sqrt(costSq / n),
    maxDeviationMm,
  };
}

/**
 * 2. Ajuste Ortogonal de Círculo ou Arco (Gauss–Newton / Levenberg–Marquardt).
 *
 * Resolve o viés clássico em arcos curtos (< 60°, Teste T10) combinando
 * candidatos iniciais (circumcírculo de 3 pontos espaçados + estimativa algébrica)
 * e refinando diretamente a distância ortogonal verdadeira com Levenberg–Marquardt.
 */
export function fitOrthogonalCircleOrArc(
  points: Vec2[],
  forceCircle = false,
  layer = "corte",
): OrthogonalCircleArcFitResult {
  if (!points || points.length < 3) {
    throw new Error("São necessários pelo menos 3 pontos para ajustar um círculo ou arco.");
  }

  const n = points.length;

  // Verifica quase-colinearidade usando o ajuste ortogonal de reta
  const lineFit = fitOrthogonalLine(points, layer);
  let collinearWarning: string | undefined;
  if (lineFit.lengthMm > 1e-3 && lineFit.maxDeviationMm / lineFit.lengthMm < 1e-3) {
    collinearWarning =
      "Os pontos capturados são praticamente colineares (flecha < 0.1% da corda). Recomenda-se ajustar como Reta.";
  }

  // Gera múltiplos candidatos de inicialização e escolhe o de menor erro ortogonal inicial
  const candidates: { cx: number; cy: number; r: number }[] = [];

  const pFirst = points[0]!;
  const pMid = points[Math.floor(n / 2)]!;
  const pLast = points[n - 1]!;
  const cc1 = circumcircle3Pts(pFirst, pMid, pLast);
  if (cc1) candidates.push(cc1);

  if (n >= 5) {
    const cc2 = circumcircle3Pts(
      points[Math.floor(n * 0.15)]!,
      points[Math.floor(n * 0.5)]!,
      points[Math.floor(n * 0.85)]!,
    );
    if (cc2) candidates.push(cc2);
  }

  const alg = algebraicCircleGuess(points);
  if (alg) candidates.push(alg);

  if (candidates.length === 0) {
    // Fallback caso os pontos sejam estritamente colineares
    const fallbackR = Math.max(lineFit.lengthMm * 100, 1000);
    const midX = (lineFit.x1 + lineFit.x2) / 2;
    const midY = (lineFit.y1 + lineFit.y2) / 2;
    candidates.push({ cx: midX, cy: midY + fallbackR, r: fallbackR });
  }

  let bestInit = candidates[0]!;
  let bestEval = evaluateCircleCenter(points, bestInit.cx, bestInit.cy);
  for (let i = 1; i < candidates.length; i++) {
    const ev = evaluateCircleCenter(points, candidates[i]!.cx, candidates[i]!.cy);
    if (ev.costSq < bestEval.costSq) {
      bestInit = candidates[i]!;
      bestEval = ev;
    }
  }

  // Refinamento não-linear de Levenberg–Marquardt sobre (cx, cy) com R = média(r_i)
  let cx = bestInit.cx;
  let cy = bestInit.cy;
  let curEval = bestEval;
  let lambda = 1e-3;

  for (let iter = 0; iter < 80; iter++) {
    let meanUx = 0;
    let meanUy = 0;
    for (let i = 0; i < n; i++) {
      meanUx += curEval.ux[i]!;
      meanUy += curEval.uy[i]!;
    }
    meanUx /= n;
    meanUy /= n;

    let j11 = 0;
    let j12 = 0;
    let j22 = 0;
    let g1 = 0;
    let g2 = 0;

    for (let i = 0; i < n; i++) {
      // Derivada de e_i = r_i - mean(r) em relação a cx e cy
      const jx = -curEval.ux[i]! + meanUx;
      const jy = -curEval.uy[i]! + meanUy;
      const res = curEval.residuals[i]!;

      j11 += jx * jx;
      j12 += jx * jy;
      j22 += jy * jy;
      g1 += jx * res;
      g2 += jy * res;
    }

    const gradNorm = Math.hypot(g1, g2);
    if (gradNorm < 1e-11) break;

    let stepAccepted = false;
    for (let sub = 0; sub < 8; sub++) {
      const a11 = j11 + lambda * (j11 + 1);
      const a22 = j22 + lambda * (j22 + 1);
      const det = a11 * a22 - j12 * j12;
      if (Math.abs(det) < EPS) {
        lambda *= 10;
        continue;
      }

      const dCx = -(a22 * g1 - j12 * g2) / det;
      const dCy = -(-j12 * g1 + a11 * g2) / det;

      const candCx = cx + dCx;
      const candCy = cy + dCy;
      const candEval = evaluateCircleCenter(points, candCx, candCy);

      if (candEval.costSq < curEval.costSq) {
        const deltaStep = Math.hypot(dCx, dCy);
        cx = candCx;
        cy = candCy;
        curEval = candEval;
        lambda = Math.max(1e-7, lambda * 0.35);
        stepAccepted = true;
        if (deltaStep < 1e-9) break;
        break;
      } else {
        lambda *= 6;
      }
    }

    if (!stepAccepted && lambda > 1e8) break;
  }

  const r = curEval.r;
  const rmsMm = curEval.rmsMm;
  const maxDeviationMm = curEval.maxDeviationMm;

  // Determina o intervalo angular (a0 -> a1 no sentido anti-horário de atan2)
  const twoPi = Math.PI * 2;
  const normAngle = (a: number) => ((a % twoPi) + twoPi) % twoPi;
  const angles = points.map((p) => normAngle(Math.atan2(p.y - cy, p.x - cx)));
  const sorted = [...angles].sort((a, b) => a - b);

  // Encontra a maior lacuna angular entre pontos consecutivos para determinar o arco mínimo que contém todos os pontos
  let maxGap = -1;
  let maxGapIdx = 0;
  for (let i = 0; i < sorted.length; i++) {
    const curA = sorted[i]!;
    const nextA = i + 1 < sorted.length ? sorted[i + 1]! : sorted[0]! + twoPi;
    const gap = nextA - curA;
    if (gap > maxGap) {
      maxGap = gap;
      maxGapIdx = i;
    }
  }

  const angularSpanRad = Math.max(0, twoPi - maxGap);
  const angularSpanDeg = (angularSpanRad * 180) / Math.PI;
  const isFullCircle = forceCircle || angularSpanDeg >= 325;

  const a0 = sorted[(maxGapIdx + 1) % sorted.length]!;
  let a1 = sorted[maxGapIdx]!;
  if (a1 <= a0) a1 += twoPi;

  const entity: Entity = isFullCircle
    ? {
        id: uid(),
        layer,
        type: "circle",
        cx,
        cy,
        r,
        params: {
          revEngStatus: "AJUSTADO",
          fitRmsMm: Number(rmsMm.toFixed(4)),
          fitMaxDevMm: Number(maxDeviationMm.toFixed(4)),
          fitPointCount: n,
        },
      }
    : {
        id: uid(),
        layer,
        type: "arc",
        cx,
        cy,
        r,
        a0,
        a1,
        params: {
          revEngStatus: "AJUSTADO",
          fitRmsMm: Number(rmsMm.toFixed(4)),
          fitMaxDevMm: Number(maxDeviationMm.toFixed(4)),
          fitPointCount: n,
        },
      };

  return {
    cx,
    cy,
    r,
    a0,
    a1,
    angularSpanDeg,
    isFullCircle,
    rmsMm,
    maxDeviationMm,
    pointCount: n,
    collinearWarning,
    entity,
  };
}

/**
 * Distância perpendicular de um ponto P ao segmento AB.
 */
function pointToSegmentDist(p: Vec2, a: Vec2, b: Vec2): number {
  const proj = closestOnSegment(p, [a, b]);
  return Math.hypot(p.x - proj.x, p.y - proj.y);
}

/**
 * 3. Simplificação de Polilinha Ramer–Douglas–Peucker (RDP) em milímetros reais.
 */
export function simplifyPointsRDP(points: Vec2[], toleranceMm: number): Vec2[] {
  if (points.length <= 2) return [...points];
  const tol = Math.max(1e-4, toleranceMm);

  function rdpRecursive(pts: Vec2[]): Vec2[] {
    if (pts.length <= 2) return pts;
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    let maxDist = -1;
    let index = 0;

    for (let i = 1; i < pts.length - 1; i++) {
      const d = pointToSegmentDist(pts[i]!, first, last);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }

    if (maxDist > tol) {
      const left = rdpRecursive(pts.slice(0, index + 1));
      const right = rdpRecursive(pts.slice(index));
      return [...left.slice(0, -1), ...right];
    }
    return [first, last];
  }

  return rdpRecursive(points);
}

/**
 * Ajusta uma Polilinha Simplificada RDP e calcula o erro ortogonal (RMS e desvio máx) dos pontos originais.
 */
export function fitSimplifiedPolyline(
  points: Vec2[],
  toleranceMm = 0.25,
  closed = false,
  layer = "corte",
): {
  simplifiedPts: Vec2[];
  rmsMm: number;
  maxDeviationMm: number;
  pointCount: number;
  entity: Entity;
} {
  if (!points || points.length < 2) {
    throw new Error("São necessários pelo menos 2 pontos para gerar uma polilinha.");
  }

  const simplifiedPts = simplifyPointsRDP(points, toleranceMm);
  const entity: Entity = {
    id: uid(),
    layer,
    type: "polyline",
    pts: simplifiedPts,
    closed,
    params: {
      revEngStatus: "AJUSTADO",
      rdpToleranceMm: toleranceMm,
      fitPointCount: points.length,
    },
  };

  const segs = segmentsOf(entity);
  let sumSq = 0;
  let maxDeviationMm = 0;

  for (const p of points) {
    let minD = Infinity;
    for (const seg of segs) {
      const d = pointToSegmentDist(p, seg[0], seg[1]);
      if (d < minD) minD = d;
    }
    if (!Number.isFinite(minD)) minD = 0;
    sumSq += minD * minD;
    if (minD > maxDeviationMm) maxDeviationMm = minD;
  }

  const rmsMm = Math.sqrt(sumSq / points.length);
  entity.params = {
    ...entity.params,
    fitRmsMm: Number(rmsMm.toFixed(4)),
    fitMaxDevMm: Number(maxDeviationMm.toFixed(4)),
  };

  return {
    simplifiedPts,
    rmsMm,
    maxDeviationMm,
    pointCount: points.length,
    entity,
  };
}

/**
 * 4. Ajusta uma Spline Controlada (Catmull-Rom amostrada suavemente após pré-filtragem de ruído)
 *    para contornos orgânicos, evitando ondulação excessiva.
 */
export function fitControlledSpline(
  points: Vec2[],
  smoothingToleranceMm = 0.15,
  closed = false,
  layer = "corte",
): {
  controlPoints: Vec2[];
  sampledPoints: Vec2[];
  rmsMm: number;
  maxDeviationMm: number;
  pointCount: number;
  entity: Entity;
} {
  if (!points || points.length < 3) {
    throw new Error("São necessários pelo menos 3 pontos para ajustar uma spline controlada.");
  }

  const controlPoints =
    points.length > 6 ? simplifyPointsRDP(points, smoothingToleranceMm) : [...points];
  const n = controlPoints.length;
  const sampledPoints: Vec2[] = [];
  const stepsPerSeg = Math.max(8, Math.min(24, Math.ceil(96 / Math.max(1, n - 1))));

  const getPt = (idx: number): Vec2 => {
    if (closed) {
      return controlPoints[((idx % n) + n) % n]!;
    }
    return controlPoints[Math.max(0, Math.min(n - 1, idx))]!;
  };

  const segCount = closed ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const p0 = getPt(i - 1);
    const p1 = getPt(i);
    const p2 = getPt(i + 1);
    const p3 = getPt(i + 2);

    for (let s = 0; s < stepsPerSeg; s++) {
      const t = s / stepsPerSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      const x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y =
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      sampledPoints.push({ x, y });
    }
  }
  if (!closed) {
    sampledPoints.push(controlPoints[n - 1]!);
  }

  const entity: Entity = {
    id: uid(),
    layer,
    type: "polyline",
    pts: sampledPoints,
    closed,
    params: {
      revEngStatus: "AJUSTADO",
      isControlledSpline: true,
      controlPointCount: controlPoints.length,
      fitPointCount: points.length,
    },
  };

  const segs = segmentsOf(entity);
  let sumSq = 0;
  let maxDeviationMm = 0;
  for (const p of points) {
    let minD = Infinity;
    for (const seg of segs) {
      const d = pointToSegmentDist(p, seg[0], seg[1]);
      if (d < minD) minD = d;
    }
    if (!Number.isFinite(minD)) minD = 0;
    sumSq += minD * minD;
    if (minD > maxDeviationMm) maxDeviationMm = minD;
  }

  const rmsMm = Math.sqrt(sumSq / points.length);
  entity.params = {
    ...entity.params,
    fitRmsMm: Number(rmsMm.toFixed(4)),
    fitMaxDevMm: Number(maxDeviationMm.toFixed(4)),
  };

  return {
    controlPoints,
    sampledPoints,
    rmsMm,
    maxDeviationMm,
    pointCount: points.length,
    entity,
  };
}

/**
 * Computa um candidato padronizado `FittedPrimitiveCandidate` para exibição no painel ENG. REV.
 */
export function buildFittedCandidate(
  points: Vec2[],
  kind: "line" | "circle" | "arc" | "polyline_rdp" | "spline",
  rdpToleranceMm = 0.25,
  closed = false,
  layer = "corte",
): FittedPrimitiveCandidate {
  if (kind === "line") {
    const res = fitOrthogonalLine(points, layer);
    return {
      id: `fit-line-${Date.now()}`,
      kind: "line",
      pointsUsed: res.pointCount,
      rmsMm: res.rmsMm,
      maxDeviationMm: res.maxDeviationMm,
      entityPreview: res.entity,
      summaryLabel: `Reta L = ${res.lengthMm.toFixed(2)} mm · ∠ ${res.angleDeg.toFixed(1)}°`,
      infoStatus: "AJUSTADO",
    };
  }

  if (kind === "circle" || kind === "arc") {
    const res = fitOrthogonalCircleOrArc(points, kind === "circle", layer);
    return {
      id: `fit-${kind}-${Date.now()}`,
      kind,
      pointsUsed: res.pointCount,
      rmsMm: res.rmsMm,
      maxDeviationMm: res.maxDeviationMm,
      collinearWarning: res.collinearWarning,
      entityPreview: res.entity,
      summaryLabel: res.isFullCircle
        ? `Círculo Ø ${(res.r * 2).toFixed(2)} mm (R ${res.r.toFixed(2)} mm)`
        : `Arco R ${res.r.toFixed(2)} mm · Δ∠ ${res.angularSpanDeg.toFixed(1)}°`,
      infoStatus: "AJUSTADO",
    };
  }

  if (kind === "polyline_rdp") {
    const res = fitSimplifiedPolyline(points, rdpToleranceMm, closed, layer);
    return {
      id: `fit-rdp-${Date.now()}`,
      kind: "polyline_rdp",
      pointsUsed: res.pointCount,
      rmsMm: res.rmsMm,
      maxDeviationMm: res.maxDeviationMm,
      entityPreview: res.entity,
      summaryLabel: `Polilinha RDP (${res.simplifiedPts.length} vértices de ${res.pointCount} pts)`,
      infoStatus: "AJUSTADO",
    };
  }

  const res = fitControlledSpline(points, rdpToleranceMm, closed, layer);
  return {
    id: `fit-spline-${Date.now()}`,
    kind: "spline",
    pointsUsed: res.pointCount,
    rmsMm: res.rmsMm,
    maxDeviationMm: res.maxDeviationMm,
    entityPreview: res.entity,
    summaryLabel: `Spline Suave (${res.controlPoints.length} nós de controle)`,
    infoStatus: "AJUSTADO",
  };
}

/**
 * 5. Extrai o valor nominal atual de uma entidade CAD para comparação automática
 *    com uma medição registrada no Caderno de Medições (Seção 5.2).
 */
export function extractNominalMetricFromEntity(
  entity: Entity | undefined,
  kind: MeasurementKind,
): number | undefined {
  if (!entity) return undefined;

  if (entity.type === "line") {
    const len = Math.hypot(entity.x2 - entity.x1, entity.y2 - entity.y1);
    if (kind === "angulo") {
      return (((Math.atan2(-(entity.y2 - entity.y1), entity.x2 - entity.x1) * 180) / Math.PI) + 360) % 360;
    }
    return len;
  }

  if (entity.type === "circle") {
    if (kind === "raio") return entity.r;
    return entity.r * 2;
  }

  if (entity.type === "arc") {
    if (kind === "diametro") return entity.r * 2;
    if (kind === "corda") {
      const p0 = { x: entity.cx + entity.r * Math.cos(entity.a0), y: entity.cy + entity.r * Math.sin(entity.a0) };
      const p1 = { x: entity.cx + entity.r * Math.cos(entity.a1), y: entity.cy + entity.r * Math.sin(entity.a1) };
      return Math.hypot(p1.x - p0.x, p1.y - p0.y);
    }
    return entity.r;
  }

  if (entity.type === "polyline" && entity.pts.length >= 2) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of entity.pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const w = maxX - minX;
    const h = maxY - minY;
    if (kind === "largura") return Math.min(w, h);
    if (kind === "comprimento") return Math.max(w, h);
    return w;
  }

  return undefined;
}

/**
 * Sincroniza as medições do Caderno com as entidades atuais do plano,
 * atualizando `drawnNominalValue` e `discrepancyMm`.
 */
export function syncMeasurementsWithEntities(
  measurements: MeasurementRecord[],
  entities: Entity[],
  sheetThicknessMm?: number,
): MeasurementRecord[] {
  const entityMap = new Map(entities.map((e) => [e.id, e]));

  return measurements.map((m) => {
    if (m.kind === "espessura" && typeof sheetThicknessMm === "number") {
      const discrepancyMm = Math.abs(m.valueMmOrDeg - sheetThicknessMm);
      return {
        ...m,
        drawnNominalValue: sheetThicknessMm,
        discrepancyMm,
      };
    }

    if (!m.linkedEntityId) {
      return m;
    }

    const ent = entityMap.get(m.linkedEntityId);
    const nominal = extractNominalMetricFromEntity(ent, m.kind);
    if (typeof nominal !== "number" || !Number.isFinite(nominal)) {
      return m;
    }

    return {
      ...m,
      drawnNominalValue: nominal,
      discrepancyMm: Math.abs(m.valueMmOrDeg - nominal),
    };
  });
}
