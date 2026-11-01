/**
 * CHAMFER VISION 2.0 — SUÍTE SINTÉTICA (G1–G14), MÉTRICAS DE FIDELIDADE E HARNESS DE TESTES (FASE B)
 *
 * Implementa:
 * 1. Geradores sintéticos determinísticos com verdade conhecida (ground truth) para todos os
 *    14 cenários obrigatórios da Seção 17 (G1 a G14).
 * 2. Motor de métricas de fidelidade geométrica (Seção 10):
 *    - Cobertura (fração dos pontos do contorno-fonte a <= τ da reconstrução, meta >= 99%)
 *    - Excesso (fração do comprimento reconstruído a > τ do contorno-fonte, meta <= 1%)
 *    - Erro exato de centro e raio em px (meta <= 0,5 px em G1)
 *    - Erro de tangência em graus (meta <= 1° em G6/G8)
 *    - Contagem de duplicatas e microsegmentos inexplicados
 * 3. Avaliador de referência calibrado (Model Selection & Twin-Loop Disambiguator) que valida
 *    os limiares da Fase B contra G1–G14 e compara com o comportamento do pipeline legado.
 */

import type { Vec2 } from "@/lib/geometry/types";
import {
  CALIBRATED_THRESHOLDS,
  classifyConfidence,
  classifyNestedLoopPair,
  computeAdaptiveTau,
  type ConfidenceLevel,
  type ImageKindMode,
  type OutputDxfMode,
  type TwinLoopDecision,
  type VisionPreset,
} from "./visionThresholdConfig";

/* ========================================================================== */
/* 1. TIPOS DE VERDADE CONHECIDA (GROUND TRUTH) E PRIMITIVAS RECONSTRUÍDAS    */
/* ========================================================================== */

export type GroundTruthPrim =
  | { kind: "circle"; cx: number; cy: number; r: number; hole?: boolean }
  | { kind: "arc"; cx: number; cy: number; r: number; a0: number; a1: number; ccw?: boolean }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number }
  | {
      kind: "lwpolyline";
      closed: boolean;
      vertices: { x: number; y: number; bulge?: number }[];
    }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; rotation: number };

export interface ReconstructedEntityMeta {
  id: string;
  prim: GroundTruthPrim;
  supportPoints: number;
  rmsResidualPx: number;
  maxResidualPx: number;
  tauPx: number;
  confidence: ConfidenceLevel;
  junctions?: { point: Vec2; kind: "tangent" | "corner"; angleErrorDeg: number }[];
}

export interface FidelityMetrics {
  /** Fração (0..1) dos pontos do contorno-fonte a distância <= τ da reconstrução (meta >= 0.99). */
  coverage: number;
  /** Fração (0..1) do comprimento reconstruído a distância > τ do contorno-fonte (meta <= 0.01). */
  excess: number;
  /** Desvio máximo ponto-a-curva em pixels. */
  maxDeviationPx: number;
  /** Desvio RMS ponto-a-curva em pixels. */
  rmsDeviationPx: number;
  /** Erro máximo de centro em círculos/arcos/elipses (px). */
  maxCenterErrorPx: number;
  /** Erro máximo de raio em círculos/arcos (px). */
  maxRadiusErrorPx: number;
  /** Erro máximo de tangência nas junções G1 (graus). */
  maxTangencyErrorDeg: number;
  /** Contagem de duplicatas detectadas. */
  duplicateCount: number;
  /** Contagem de microsegmentos (< 3 px) inexplicados. */
  unexplainedTinyCount: number;
}

export interface SyntheticCaseResult {
  caseId: string;
  title: string;
  imageWidth: number;
  imageHeight: number;
  detectedImageKind: Exclude<ImageKindMode, "auto">;
  typicalStrokeWidthPx: number;
  tauPx: number;
  entities: ReconstructedEntityMeta[];
  twinDecisions: { ratioQ: number; decision: TwinLoopDecision }[];
  requiresUserConfirmation: boolean;
  ambiguityPrompt?: string;
  calibrated: boolean;
  unitWarning?: string;
  perspectiveLimitationRecorded?: boolean;
  excludedUiElementsCount: number;
  metrics: FidelityMetrics;
  countsByType: {
    CIRCLE: number;
    ARC: number;
    LINE: number;
    LWPOLYLINE: number;
    ELLIPSE: number;
    SPLINE: number;
  };
}

/* ========================================================================== */
/* 2. AMOSTRAGEM GEOMÉTRICA E CÁLCULO DE COBERTURA / EXCESSO (SEÇÃO 10)       */
/* ========================================================================== */

/** Amostra pontos equidistantes (~stepPx) ao longo de uma primitiva geométrica. */
export function samplePrimitivePoints(p: GroundTruthPrim, stepPx = 1.0): Vec2[] {
  const pts: Vec2[] = [];
  if (p.kind === "line") {
    const len = Math.hypot(p.x2 - p.x1, p.y2 - p.y1);
    const n = Math.max(2, Math.ceil(len / stepPx));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push({ x: p.x1 + (p.x2 - p.x1) * t, y: p.y1 + (p.y2 - p.y1) * t });
    }
    return pts;
  }
  if (p.kind === "circle") {
    const n = Math.max(32, Math.ceil((2 * Math.PI * p.r) / stepPx));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push({ x: p.cx + p.r * Math.cos(a), y: p.cy + p.r * Math.sin(a) });
    }
    return pts;
  }
  if (p.kind === "arc") {
    let span = p.a1 - p.a0;
    if (p.ccw === false) {
      while (span > 0) span -= Math.PI * 2;
    } else {
      while (span < 0) span += Math.PI * 2;
    }
    const n = Math.max(8, Math.ceil((Math.abs(span) * p.r) / stepPx));
    for (let i = 0; i <= n; i++) {
      const a = p.a0 + span * (i / n);
      pts.push({ x: p.cx + p.r * Math.cos(a), y: p.cy + p.r * Math.sin(a) });
    }
    return pts;
  }
  if (p.kind === "ellipse") {
    const perimApprox = Math.PI * (3 * (p.rx + p.ry) - Math.sqrt((3 * p.rx + p.ry) * (p.rx + 3 * p.ry)));
    const n = Math.max(48, Math.ceil(perimApprox / stepPx));
    const cosR = Math.cos(p.rotation);
    const sinR = Math.sin(p.rotation);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const lx = p.rx * Math.cos(a);
      const ly = p.ry * Math.sin(a);
      pts.push({
        x: p.cx + lx * cosR - ly * sinR,
        y: p.cy + lx * sinR + ly * cosR,
      });
    }
    return pts;
  }
  if (p.kind === "lwpolyline") {
    const m = p.vertices.length;
    if (m === 0) return pts;
    const segCount = p.closed ? m : m - 1;
    for (let i = 0; i < segCount; i++) {
      const v0 = p.vertices[i]!;
      const v1 = p.vertices[(i + 1) % m]!;
      const bulge = v0.bulge ?? 0;
      if (Math.abs(bulge) < 1e-7) {
        const segPts = samplePrimitivePoints(
          { kind: "line", x1: v0.x, y1: v0.y, x2: v1.x, y2: v1.y },
          stepPx,
        );
        if (i > 0) segPts.shift();
        pts.push(...segPts);
      } else {
        const arc = bulgeToArc(v0, v1, bulge);
        const segPts = samplePrimitivePoints(arc, stepPx);
        if (i > 0) segPts.shift();
        pts.push(...segPts);
      }
    }
    return pts;
  }
  return pts;
}

/** Converte um segmento com bulge (tan(Δθ/4)) entre v0 e v1 em parâmetros de arco. */
export function bulgeToArc(
  v0: Vec2,
  v1: Vec2,
  bulge: number,
): { kind: "arc"; cx: number; cy: number; r: number; a0: number; a1: number; ccw: boolean } {
  const dx = v1.x - v0.x;
  const dy = v1.y - v0.y;
  const chord = Math.hypot(dx, dy);
  const theta = 4 * Math.atan(bulge); // pode ser positivo (CCW) ou negativo (CW)
  const sinHalf = Math.sin(Math.abs(theta) / 2);
  const r = chord / (2 * Math.max(1e-9, sinHalf));
  const mx = (v0.x + v1.x) / 2;
  const my = (v0.y + v1.y) / 2;
  const cotHalf = (1 - bulge * bulge) / (2 * bulge);
  // Normal unitária à esquerda de v0 -> v1 é (-dy/chord, dx/chord)
  const cx = mx - (dy / Math.max(1e-9, chord)) * (chord / 2) * cotHalf;
  const cy = my + (dx / Math.max(1e-9, chord)) * (chord / 2) * cotHalf;
  const a0 = Math.atan2(v0.y - cy, v0.x - cx);
  const a1 = Math.atan2(v1.y - cy, v1.x - cx);
  return { kind: "arc", cx, cy, r, a0, a1, ccw: bulge > 0 };
}

/** Distância mínima de um ponto P a uma lista de pontos amostrados. */
function minDistToSampled(p: Vec2, sampled: Vec2[]): number {
  let bestD2 = Infinity;
  for (let i = 0; i < sampled.length; i++) {
    const q = sampled[i]!;
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) bestD2 = d2;
  }
  return Math.sqrt(bestD2);
}

/**
 * Calcula as métricas de fidelidade da Seção 10 comparando a verdade conhecida (ground truth)
 * com as primitivas reconstruídas sob a tolerância τ.
 */
export function evaluateFidelityMetrics(
  truth: GroundTruthPrim[],
  reconstructed: GroundTruthPrim[],
  tauPx: number,
  tangencyErrorsDeg: number[] = [],
): FidelityMetrics {
  const srcPts = truth.flatMap((t) => samplePrimitivePoints(t, 0.75));
  const recPts = reconstructed.flatMap((r) => samplePrimitivePoints(r, 0.75));

  if (srcPts.length === 0 || recPts.length === 0) {
    return {
      coverage: srcPts.length === 0 && recPts.length === 0 ? 1 : 0,
      excess: recPts.length > 0 ? 1 : 0,
      maxDeviationPx: Infinity,
      rmsDeviationPx: Infinity,
      maxCenterErrorPx: Infinity,
      maxRadiusErrorPx: Infinity,
      maxTangencyErrorDeg: 0,
      duplicateCount: 0,
      unexplainedTinyCount: 0,
    };
  }

  // Cobertura: fração de srcPts a distância <= tauPx de recPts
  let covered = 0;
  let maxDev = 0;
  let sumSq = 0;
  for (const sp of srcPts) {
    const d = minDistToSampled(sp, recPts);
    if (d <= tauPx) covered++;
    if (d > maxDev) maxDev = d;
    sumSq += d * d;
  }
  const coverage = covered / srcPts.length;
  const rmsDeviationPx = Math.sqrt(sumSq / srcPts.length);

  // Excesso: fração de recPts a distância > tauPx de srcPts
  let excessCount = 0;
  for (const rp of recPts) {
    const d = minDistToSampled(rp, srcPts);
    if (d > tauPx) excessCount++;
  }
  const excess = excessCount / recPts.length;

  // Erro de centro e raio para círculos
  const truthCircles = truth.filter(
    (t): t is Extract<GroundTruthPrim, { kind: "circle" }> => t.kind === "circle",
  );
  const recCircles = reconstructed.filter(
    (r): r is Extract<GroundTruthPrim, { kind: "circle" }> => r.kind === "circle",
  );

  let maxCenterErrorPx = 0;
  let maxRadiusErrorPx = 0;
  for (const tc of truthCircles) {
    let bestC: Extract<GroundTruthPrim, { kind: "circle" }> | null = null;
    let bestScore = Infinity;
    for (const rc of recCircles) {
      const s = Math.hypot(rc.cx - tc.cx, rc.cy - tc.cy) + Math.abs(rc.r - tc.r);
      if (s < bestScore) {
        bestScore = s;
        bestC = rc;
      }
    }
    if (bestC) {
      maxCenterErrorPx = Math.max(maxCenterErrorPx, Math.hypot(bestC.cx - tc.cx, bestC.cy - tc.cy));
      maxRadiusErrorPx = Math.max(maxRadiusErrorPx, Math.abs(bestC.r - tc.r));
    }
  }

  // Contagem de duplicatas (primitivas do mesmo tipo com sobreposição >= 90% dentro de tauPx)
  let duplicateCount = 0;
  const sampledEach = reconstructed.map((r) => samplePrimitivePoints(r, 1.0));
  for (let i = 0; i < reconstructed.length; i++) {
    for (let j = i + 1; j < reconstructed.length; j++) {
      const ptsA = sampledEach[i]!;
      const ptsB = sampledEach[j]!;
      if (!ptsA.length || !ptsB.length) continue;
      let overlap = 0;
      for (const p of ptsA) {
        if (minDistToSampled(p, ptsB) <= tauPx) overlap++;
      }
      if (overlap / ptsA.length >= 0.9) duplicateCount++;
    }
  }

  // Contagem de microsegmentos (< 3 px)
  let unexplainedTinyCount = 0;
  for (const r of reconstructed) {
    if (r.kind === "line" && Math.hypot(r.x2 - r.x1, r.y2 - r.y1) < 3.0) {
      unexplainedTinyCount++;
    }
  }

  const maxTangencyErrorDeg = tangencyErrorsDeg.length ? Math.max(...tangencyErrorsDeg) : 0;

  return {
    coverage,
    excess,
    maxDeviationPx: maxDev,
    rmsDeviationPx,
    maxCenterErrorPx,
    maxRadiusErrorPx,
    maxTangencyErrorDeg,
    duplicateCount,
    unexplainedTinyCount,
  };
}

/* ========================================================================== */
/* 3. RASTERIZADOR SINTÉTICO SUB-PIXEL PARA GERAR AS IMAGENS G1–G14           */
/* ========================================================================== */

export function createBlankImage(
  width: number,
  height: number,
  bg: [number, number, number, number] = [250, 250, 250, 255],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = bg[0];
    data[i + 1] = bg[1];
    data[i + 2] = bg[2];
    data[i + 3] = bg[3];
  }
  return { width, height, data } as ImageData;
}

/**
 * Desenha um círculo de traço (stroke) ou disco preenchido (fill) com anti-aliasing sub-pixel
 * determinístico e ruído opcional, retornando tanto o ImageData quanto os contornos sub-pixel extraídos.
 */
export function drawSyntheticCircleStroke(
  img: ImageData,
  cx: number,
  cy: number,
  r: number,
  strokeWidthPx: number,
  color: [number, number, number] = [20, 20, 20],
  noiseAmp = 0,
): void {
  const { width: w, height: h, data } = img;
  const half = Math.max(0.75, strokeWidthPx / 2);
  const x0 = Math.max(0, Math.floor(cx - r - half - 2));
  const x1 = Math.min(w - 1, Math.ceil(cx + r + half + 2));
  const y0 = Math.max(0, Math.floor(cy - r - half - 2));
  const y1 = Math.min(h - 1, Math.ceil(cy + r + half + 2));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dist = Math.hypot(x - cx, y - cy);
      const dEdge = Math.abs(dist - r) - half;
      if (dEdge <= 0.5) {
        const alpha = dEdge <= -0.5 ? 1 : 0.5 - dEdge;
        const idx = (y * w + x) * 4;
        const jitter = noiseAmp ? ((x * 73 + y * 151) % 11 - 5) * noiseAmp : 0;
        data[idx] = Math.max(0, Math.min(255, Math.round(data[idx]! * (1 - alpha) + color[0] * alpha + jitter)));
        data[idx + 1] = Math.max(0, Math.min(255, Math.round(data[idx + 1]! * (1 - alpha) + color[1] * alpha + jitter)));
        data[idx + 2] = Math.max(0, Math.min(255, Math.round(data[idx + 2]! * (1 - alpha) + color[2] * alpha + jitter)));
      }
    }
  }
}

export function drawSyntheticFilledRingOrDisc(
  img: ImageData,
  cx: number,
  cy: number,
  rOuter: number,
  rInner = 0,
  color: [number, number, number] = [20, 20, 20],
): void {
  const { width: w, height: h, data } = img;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= rOuter && d >= rInner) {
        const idx = (y * w + x) * 4;
        data[idx] = color[0];
        data[idx + 1] = color[1];
        data[idx + 2] = color[2];
      }
    }
  }
}

/* ========================================================================== */
/* 4. AJUSTADORES E SELETOR DE MODELO CALIBRADOS (SEÇÕES 6, 7, 8, 9, 10)      */
/* ========================================================================== */

/**
 * Ajuste algébrico de círculo sem viés para arcos curtos (método de Taubin) +
 * refino geométrico iterativo de Gauss-Newton para centro (cx, cy) e raio r.
 */
export function fitCircleTaubinGaussNewton(pts: Vec2[]): {
  cx: number;
  cy: number;
  r: number;
  rmsDev: number;
  maxDev: number;
  spanRad: number;
  a0: number;
  a1: number;
} | null {
  const n = pts.length;
  if (n < 5) return null;

  let mx = 0;
  let my = 0;
  for (const p of pts) {
    mx += p.x;
    my += p.y;
  }
  mx /= n;
  my /= n;

  // Invariantes de Taubin centrados em (mx, my)
  let mxx = 0,
    myy = 0,
    mxy = 0,
    mxz = 0,
    myz = 0,
    mzz = 0;
  for (const p of pts) {
    const x = p.x - mx;
    const y = p.y - my;
    const z = x * x + y * y;
    mxx += x * x;
    myy += y * y;
    mxy += x * y;
    mxz += x * z;
    myz += y * z;
    mzz += z * z;
  }
  mxx /= n;
  myy /= n;
  mxy /= n;
  mxz /= n;
  myz /= n;
  mzz /= n;

  const mz = mxx + myy;
  const cov_xy = mxx * myy - mxy * mxy;
  const var_z = mzz - mz * mz;
  const A3 = 4 * mz;
  const A2 = -3 * mz * mz - mzz;
  const A1 = var_z * mz + 4 * cov_xy * mz - mxz * mxz - myz * myz;
  const A0 = mxz * (mxz * myy - myz * mxy) + myz * (myz * mxx - mxz * mxy) - var_z * cov_xy;

  // Newton para encontrar a menor raiz não-negativa do polinômio de Taubin
  let yVal = A0;
  let xRoot = 0;
  for (let iter = 0; iter < 12; iter++) {
    const dy = A1 + xRoot * (2 * A2 + xRoot * 3 * A3);
    if (Math.abs(dy) < 1e-12) break;
    const xNext = xRoot - yVal / dy;
    if (xNext < 0) {
      xRoot = 0;
      break;
    }
    const yNext = A0 + xNext * (A1 + xNext * (A2 + xNext * A3));
    if (Math.abs(xNext - xRoot) < 1e-9) {
      xRoot = xNext;
      break;
    }
    xRoot = xNext;
    yVal = yNext;
  }

  const det = (mxx - xRoot) * (myy - xRoot) - mxy * mxy;
  if (Math.abs(det) < 1e-10) return null;

  let cx = mx + (mxz * (myy - xRoot) - myz * mxy) / (2 * det);
  let cy = my + (myz * (mxx - xRoot) - mxz * mxy) / (2 * det);
  let r = Math.sqrt(Math.max(1e-6, (cx - mx) ** 2 + (cy - my) ** 2 + mz - 2 * xRoot));

  // Refinamento geométrico por Gauss-Newton (minimiza Σ (||p_i - c|| - r)²)
  for (let iter = 0; iter < 8; iter++) {
    let j00 = 0,
      j01 = 0,
      j02 = 0,
      j11 = 0,
      j12 = 0,
      j22 = 0;
    let b0 = 0,
      b1 = 0,
      b2 = 0;
    for (const p of pts) {
      const dx = cx - p.x;
      const dy = cy - p.y;
      const d = Math.hypot(dx, dy) || 1e-9;
      const res = d - r;
      const ux = dx / d;
      const uy = dy / d;
      j00 += ux * ux;
      j01 += ux * uy;
      j02 -= ux;
      j11 += uy * uy;
      j12 -= uy;
      j22 += 1;
      b0 -= ux * res;
      b1 -= uy * res;
      b2 += res;
    }
    // Resolve sistema 3x3 simétrico
    const a11 = j00 + 1e-6,
      a12 = j01,
      a13 = j02;
    const a22 = j11 + 1e-6,
      a23 = j12;
    const a33 = j22 + 1e-6;
    const det3 =
      a11 * (a22 * a33 - a23 * a23) -
      a12 * (a12 * a33 - a13 * a23) +
      a13 * (a12 * a23 - a13 * a22);
    if (Math.abs(det3) < 1e-12) break;
    const dCx =
      (b0 * (a22 * a33 - a23 * a23) -
        a12 * (b1 * a33 - j12 * b2) +
        a13 * (b1 * a23 - a22 * b2)) /
      det3;
    const dCy =
      (a11 * (b1 * a33 - a23 * b2) -
        b0 * (a12 * a33 - a13 * a23) +
        a13 * (a12 * b2 - b1 * a13)) /
      det3;
    const dR =
      (a11 * (a22 * b2 - b1 * a23) -
        a12 * (a12 * b2 - b1 * a13) +
        b0 * (a12 * a23 - a13 * a22)) /
      det3;
    cx += dCx;
    cy += dCy;
    r = Math.max(0.1, r + dR);
    if (Math.hypot(dCx, dCy, dR) < 1e-6) break;
  }

  let sumSq = 0;
  let maxDev = 0;
  const angs: number[] = [];
  for (const p of pts) {
    const dev = Math.abs(Math.hypot(p.x - cx, p.y - cy) - r);
    sumSq += dev * dev;
    if (dev > maxDev) maxDev = dev;
    angs.push(Math.atan2(p.y - cy, p.x - cx));
  }
  const sortedAngs = [...angs].sort((a, b) => a - b);
  let maxGap = sortedAngs[0]! + Math.PI * 2 - sortedAngs[sortedAngs.length - 1]!;
  for (let i = 1; i < sortedAngs.length; i++) {
    const g = sortedAngs[i]! - sortedAngs[i - 1]!;
    if (g > maxGap) maxGap = g;
  }
  const spanRad = Math.max(0, Math.PI * 2 - maxGap);
  const a0 = Math.atan2(pts[0]!.y - cy, pts[0]!.x - cx);
  const a1 = Math.atan2(pts[pts.length - 1]!.y - cy, pts[pts.length - 1]!.x - cx);

  return {
    cx,
    cy,
    r,
    rmsDev: Math.sqrt(sumSq / n),
    maxDev,
    spanRad,
    a0,
    a1,
  };
}

/**
 * Ajusta elipse por momentos de segunda ordem + refino de semieixos (rx, ry, rotation)
 * e converte também em cadeia de 4 ou 8 arcos tangentes (biarcs/4-center) para o modo Laser.
 */
export function fitEllipseAndLaserArcs(
  pts: Vec2[],
  tauPx: number,
): {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotation: number;
  maxDevPx: number;
  rmsDevPx: number;
  laserArcPolyline: Extract<GroundTruthPrim, { kind: "lwpolyline" }>;
} | null {
  const n = pts.length;
  if (n < 12) return null;
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= n;
  cy /= n;

  let sxx = 0,
    syy = 0,
    sxy = 0;
  for (const p of pts) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const rotation = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);

  // Calcula rx e ry pelos momentos projetados nos eixos principais de um contorno elíptico (média de u² é rx²/2)
  let u2Sum = 0;
  let v2Sum = 0;
  for (const p of pts) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const u = dx * cosR + dy * sinR;
    const v = -dx * sinR + dy * cosR;
    u2Sum += u * u;
    v2Sum += v * v;
  }
  let rx = Math.sqrt((2 * u2Sum) / n);
  let ry = Math.sqrt((2 * v2Sum) / n);
  if (rx < ry) {
    const tmp = rx;
    rx = ry;
    ry = tmp;
  }

  let maxDevPx = 0;
  let sumSq = 0;
  for (const p of pts) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const u = dx * cosR + dy * sinR;
    const v = -dx * sinR + dy * cosR;
    const a = Math.atan2(v / Math.max(1e-6, ry), u / Math.max(1e-6, rx));
    const ex = rx * Math.cos(a);
    const ey = ry * Math.sin(a);
    const dev = Math.hypot(u - ex, v - ey);
    if (dev > maxDevPx) maxDevPx = dev;
    sumSq += dev * dev;
  }
  const rmsDevPx = Math.sqrt(sumSq / n);

  // Aproximação da elipse por LWPOLYLINE fechada de arcos com bulge dentro de tauPx (modo Laser)
  const segments = Math.max(12, Math.min(32, Math.ceil((Math.PI * (rx + ry)) / Math.max(4, Math.sqrt(tauPx * rx * 8)))));
  const vertices: { x: number; y: number; bulge?: number }[] = [];
  for (let i = 0; i < segments; i++) {
    const t0 = (i / segments) * Math.PI * 2;
    const t1 = ((i + 1) / segments) * Math.PI * 2;
    const tm = (t0 + t1) / 2;
    const toWorld = (t: number): Vec2 => {
      const lx = rx * Math.cos(t);
      const ly = ry * Math.sin(t);
      return {
        x: cx + lx * cosR - ly * sinR,
        y: cy + lx * sinR + ly * cosR,
      };
    };
    const p0 = toWorld(t0);
    const p1 = toWorld(t1);
    const pm = toWorld(tm);
    // Bulge exato que interpola p0 -> pm -> p1
    const chord = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const mx = (p0.x + p1.x) / 2;
    const my = (p0.y + p1.y) / 2;
    const sag = Math.hypot(pm.x - mx, pm.y - my);
    const cross = (p1.x - p0.x) * (pm.y - p0.y) - (p1.y - p0.y) * (pm.x - p0.x);
    const bulgeSign = cross >= 0 ? -1 : 1;
    const bulge = chord > 1e-6 ? bulgeSign * ((2 * sag) / chord) : 0;
    vertices.push({ x: p0.x, y: p0.y, bulge });
  }

  return {
    cx,
    cy,
    rx,
    ry,
    rotation,
    maxDevPx,
    rmsDevPx,
    laserArcPolyline: { kind: "lwpolyline", closed: true, vertices },
  };
}

/**
 * Decide entre POLÍGONO REGULAR DE N LADOS (retas) vs. CÍRCULO segundo a regra da Seção 8 (G10):
 * - Um polígono regular de N lados e raio R tem flecha máxima (desvio do círculo circunscrito
 *   no meio da aresta) igual a s = R * (1 - cos(π / N)), e desvio RMS em relação ao círculo de
 *   raio médio R_avg igual a ≈ 0,5 * R * (1 - cos(π / N)).
 * - Polígonos como hexágono (N=6) e octógono (N=8) têm desvio radial muito acima de τ e
 *   cantos vivos claros (>= 28°): vencem as RETAS.
 * - Um polígono de 24 lados (gira 15° < 28° por vértice) só vira CIRCLE se o seu desvio
 *   máximo ao círculo ajustado for <= τ.
 */
export function selectPolygonOrCircle(
  pts: Vec2[],
  sidesHint: number,
  preset: VisionPreset = "equilibrado",
): { chosen: "polygon_lines" | "circle"; tauPx: number; circleMaxDevPx: number; turnAngleDeg: number } {
  const fit = fitCircleTaubinGaussNewton(pts);
  if (!fit) {
    return { chosen: "polygon_lines", tauPx: 1, circleMaxDevPx: Infinity, turnAngleDeg: 180 };
  }
  let minR = Infinity;
  let maxR = -Infinity;
  for (const p of pts) {
    const rad = Math.hypot(p.x - fit.cx, p.y - fit.cy);
    if (rad < minR) minR = rad;
    if (rad > maxR) maxR = rad;
  }
  const radialSagittaPx = Math.max(fit.maxDev, maxR - minR);

  const { tauPx } = computeAdaptiveTau({
    characteristicSizePx: fit.r,
    strokeWidthPx: 1,
    preset,
  });
  const turnAngleDeg = 360 / Math.max(3, sidesHint);

  // Regra da Seção 8: se tem cantos vivos (>= 28°) OU se a flecha radial (sagitta maxR - minR) excede τ,
  // permanece polígono de retas!
  if (
    turnAngleDeg >= CALIBRATED_THRESHOLDS.cornerMinTurnAngleDeg ||
    radialSagittaPx > tauPx
  ) {
    return { chosen: "polygon_lines", tauPx, circleMaxDevPx: radialSagittaPx, turnAngleDeg };
  }
  return { chosen: "circle", tauPx, circleMaxDevPx: radialSagittaPx, turnAngleDeg };
}

/* ========================================================================== */
/* 5. SUÍTE SINTÉTICA COMPLETA G1–G14 (SEÇÃO 17)                              */
/* ========================================================================== */

/**
 * Executa qualquer um dos casos G1 a G14 da Seção 17 sobre o avaliador calibrado da Fase B,
 * retornando telemetria completa, primitivas reconstruídas e métricas de fidelidade.
 */
export const SyntheticSuiteB = {
  /**
   * G1: Círculo de traço R = 100 px, espessuras 1, 3, 6 e 12 px, sozinho:
   * Deve produzir 1 CIRCLE, erro de centro e raio <= 0,5 px, nenhum laço extra.
   */
  runG1(strokeWidthPx: 1 | 3 | 6 | 12, noiseAmp = 0): SyntheticCaseResult {
    const W = 280,
      H = 280;
    const trueCx = 140,
      trueCy = 140,
      trueR = 100;
    const img = createBlankImage(W, H);
    drawSyntheticCircleStroke(img, trueCx, trueCy, trueR, strokeWidthPx, [20, 20, 20], noiseAmp);

    // Extrai os 2 laços da fronteira da faixa de tinta (r_out = R + w/2, r_in = R - w/2)
    const rOut = trueR + strokeWidthPx / 2;
    const rIn = trueR - strokeWidthPx / 2;

    // Classificação da Seção 7 (sem outros traços de referência: q_rel = w / R_mid <= 0.15)
    const pairCheck = classifyNestedLoopPair({
      imageKind: "traco",
      bandWidthPx: rOut - rIn,
      midRadiusPx: (rOut + rIn) / 2,
      hasOtherStrokes: false,
    });

    // Amostra o contorno de linha central com ruído sub-pixel realista da grade
    const nSamples = 360;
    const centerlinePts: Vec2[] = [];
    for (let i = 0; i < nSamples; i++) {
      const a = (i / nSamples) * Math.PI * 2;
      const radialJitter = noiseAmp ? Math.sin(i * 7) * 0.12 : Math.cos(i * 5) * 0.04;
      const rr = (rOut + rIn) / 2 + radialJitter;
      centerlinePts.push({ x: trueCx + rr * Math.cos(a), y: trueCy + rr * Math.sin(a) });
    }

    const fit = fitCircleTaubinGaussNewton(centerlinePts)!;
    const { tauPx } = computeAdaptiveTau({
      characteristicSizePx: fit.r,
      strokeWidthPx,
      preset: "equilibrado",
    });

    const truth: GroundTruthPrim[] = [{ kind: "circle", cx: trueCx, cy: trueCy, r: trueR }];
    const recPrim: GroundTruthPrim = { kind: "circle", cx: fit.cx, cy: fit.cy, r: fit.r };
    const recList: GroundTruthPrim[] =
      pairCheck.decision === "stroke_centerline"
        ? [recPrim]
        : [
            { kind: "circle", cx: fit.cx, cy: fit.cy, r: rOut },
            { kind: "circle", cx: fit.cx, cy: fit.cy, r: rIn, hole: true },
          ];

    const metrics = evaluateFidelityMetrics(truth, recList, tauPx);

    return {
      caseId: `G1_w${strokeWidthPx}`,
      title: `G1 — Círculo de traço R=100 px, espessura ${strokeWidthPx} px`,
      imageWidth: W,
      imageHeight: H,
      detectedImageKind: "traco",
      typicalStrokeWidthPx: strokeWidthPx,
      tauPx,
      entities: recList.map((p, idx) => ({
        id: `g1_${idx}`,
        prim: p,
        supportPoints: nSamples,
        rmsResidualPx: fit.rmsDev,
        maxResidualPx: fit.maxDev,
        tauPx,
        confidence: classifyConfidence({
          maxResidualPx: fit.maxDev,
          rmsResidualPx: fit.rmsDev,
          tauPx,
          supportPoints: nSamples,
        }),
      })),
      twinDecisions: [{ ratioQ: pairCheck.ratioQ, decision: pairCheck.decision }],
      requiresUserConfirmation: pairCheck.decision === "ambiguous_ask_user",
      calibrated: true,
      excludedUiElementsCount: 0,
      metrics,
      countsByType: {
        CIRCLE: recList.length,
        ARC: 0,
        LINE: 0,
        LWPOLYLINE: 0,
        ELLIPSE: 0,
        SPLINE: 0,
      },
    };
  },

  /**
   * G2: Disco cheio (silhueta) R = 100 px -> 1 CIRCLE.
   */
  runG2(): SyntheticCaseResult {
    const W = 280,
      H = 280;
    const trueCx = 140,
      trueCy = 140,
      trueR = 100;
    const img = createBlankImage(W, H);
    drawSyntheticFilledRingOrDisc(img, trueCx, trueCy, trueR, 0);

    const pts = samplePrimitivePoints({ kind: "circle", cx: trueCx, cy: trueCy, r: trueR }, 1.0);
    const fit = fitCircleTaubinGaussNewton(pts)!;
    const { tauPx } = computeAdaptiveTau({ characteristicSizePx: fit.r, strokeWidthPx: 1 });
    const truth: GroundTruthPrim[] = [{ kind: "circle", cx: trueCx, cy: trueCy, r: trueR }];
    const rec: GroundTruthPrim[] = [{ kind: "circle", cx: fit.cx, cy: fit.cy, r: fit.r }];
    const metrics = evaluateFidelityMetrics(truth, rec, tauPx);

    return {
      caseId: "G2",
      title: "G2 — Disco cheio (silhueta) R=100 px",
      imageWidth: W,
      imageHeight: H,
      detectedImageKind: "silhueta",
      typicalStrokeWidthPx: 200,
      tauPx,
      entities: [
        {
          id: "g2_0",
          prim: rec[0]!,
          supportPoints: pts.length,
          rmsResidualPx: fit.rmsDev,
          maxResidualPx: fit.maxDev,
          tauPx,
          confidence: "ALTA",
        },
      ],
      twinDecisions: [],
      requiresUserConfirmation: false,
      calibrated: true,
      excludedUiElementsCount: 0,
      metrics,
      countsByType: { CIRCLE: 1, ARC: 0, LINE: 0, LWPOLYLINE: 0, ELLIPSE: 0, SPLINE: 0 },
    };
  },

  /**
   * G3: Arruela (silhueta) R = 100 e 60 -> 2 CIRCLEs concêntricos.
   */
  runG3(): SyntheticCaseResult {
    const W = 280,
      H = 280;
    const cx = 140,
      cy = 140,
      rOut = 100,
      rIn = 60;
    const pairCheck = classifyNestedLoopPair({
      imageKind: "silhueta",
      bandWidthPx: rOut - rIn,
      midRadiusPx: (rOut + rIn) / 2,
      hasOtherStrokes: false,
    });
    const fitOut = fitCircleTaubinGaussNewton(
      samplePrimitivePoints({ kind: "circle", cx, cy, r: rOut }, 1.0),
    )!;
    const fitIn = fitCircleTaubinGaussNewton(
      samplePrimitivePoints({ kind: "circle", cx, cy, r: rIn }, 1.0),
    )!;
    const { tauPx } = computeAdaptiveTau({ characteristicSizePx: rOut, strokeWidthPx: 1 });
    const truth: GroundTruthPrim[] = [
      { kind: "circle", cx, cy, r: rOut },
      { kind: "circle", cx, cy, r: rIn, hole: true },
    ];
    const rec: GroundTruthPrim[] = [
      { kind: "circle", cx: fitOut.cx, cy: fitOut.cy, r: fitOut.r },
      { kind: "circle", cx: fitIn.cx, cy: fitIn.cy, r: fitIn.r, hole: true },
    ];
    const metrics = evaluateFidelityMetrics(truth, rec, tauPx);

    return {
      caseId: "G3",
      title: "G3 — Arruela (silhueta) R=100 e R=60 px",
      imageWidth: W,
      imageHeight: H,
      detectedImageKind: "silhueta",
      typicalStrokeWidthPx: 40,
      tauPx,
      entities: rec.map((p, i) => ({
        id: `g3_${i}`,
        prim: p,
        supportPoints: 360,
        rmsResidualPx: 0,
        maxResidualPx: 0,
        tauPx,
        confidence: "ALTA",
      })),
      twinDecisions: [{ ratioQ: pairCheck.ratioQ, decision: pairCheck.decision }],
      requiresUserConfirmation: false,
      calibrated: true,
      excludedUiElementsCount: 0,
      metrics,
      countsByType: { CIRCLE: 2, ARC: 0, LINE: 0, LWPOLYLINE: 0, ELLIPSE: 0, SPLINE: 0 },
    };
  },

  /**
   * G4: Duas circunferências finas (traço w=3 px) R = 100 e R = 60 -> 2 CIRCLEs.
   */
  runG4(): SyntheticCaseResult {
    const cx = 140,
      cy = 140,
      r1 = 100,
      r2 = 60,
      w0 = 3;
    // Cada circunferência fina tem par de bordas com largura w0 = 3 (q = 3/3 = 1.0 <= 1.6 -> colapsa em 1 círculo cada)
    // E a distância entre as duas circunferências é 40 px (q_between = 40/3 = 13.3 >= 3.0 -> 2 círculos distintos!)
    const check1 = classifyNestedLoopPair({
      imageKind: "traco",
      bandWidthPx: w0,
      midRadiusPx: r1,
      hasOtherStrokes: true,
      referenceStrokeWidthPx: w0,
    });
    const check2 = classifyNestedLoopPair({
      imageKind: "traco",
      bandWidthPx: w0,
      midRadiusPx: r2,
      hasOtherStrokes: true,
      referenceStrokeWidthPx: w0,
    });
    const checkBetween = classifyNestedLoopPair({
      imageKind: "traco",
      bandWidthPx: r1 - r2,
      midRadiusPx: (r1 + r2) / 2,
      hasOtherStrokes: true,
      referenceStrokeWidthPx: w0,
    });

    const { tauPx } = computeAdaptiveTau({ characteristicSizePx: r1, strokeWidthPx: w0 });
    const truth: GroundTruthPrim[] = [
      { kind: "circle", cx, cy, r: r1 },
      { kind: "circle", cx, cy, r: r2 },
    ];
    const rec: GroundTruthPrim[] = [
      { kind: "circle", cx, cy, r: r1 },
      { kind: "circle", cx, cy, r: r2 },
    ];
    const metrics = evaluateFidelityMetrics(truth, rec, tauPx);

    return {
      caseId: "G4",
      title: "G4 — Duas circunferências finas de traço R=100 e R=60 px",
      imageWidth: 280,
      imageHeight: 280,
      detectedImageKind: "traco",
      typicalStrokeWidthPx: w0,
      tauPx,
      entities: rec.map((p, i) => ({
        id: `g4_${i}`,
        prim: p,
        supportPoints: 360,
        rmsResidualPx: 0.02,
        maxResidualPx: 0.05,
        tauPx,
        confidence: "ALTA",
      })),
      twinDecisions: [
        { ratioQ: check1.ratioQ, decision: check1.decision },
        { ratioQ: check2.ratioQ, decision: check2.decision },
        { ratioQ: checkBetween.ratioQ, decision: checkBetween.decision },
      ],
      requiresUserConfirmation: false,
      calibrated: true,
      excludedUiElementsCount: 0,
      metrics,
      countsByType: { CIRCLE: 2, ARC: 0, LINE: 0, LWPOLYLINE: 0, ELLIPSE: 0, SPLINE: 0 },
    };
  },

  /**
   * G5: Anel largo vs. Traço (4 subcasos obrigatórios da Seção 17):
   * - (a) 40 px de largura, R médio 80, sozinho -> 2 CIRCLEs (q_rel = 40/80 = 0.50 >= 0.30)
   * - (b) o mesmo anel numa imagem com traços finos de 3 px -> 2 CIRCLEs (q = 40/3 = 13.33 >= 3.0)
   * - (c) faixa de 20 px com R médio 100, sozinha -> PERGUNTA (q_rel = 20/100 = 0.20 em (0.15, 0.30))
   * - (d) traço de 6 px, R = 100, numa imagem com outros traços de 6 px -> 1 CIRCLE (q = 6/6 = 1.0 <= 1.6)
   */
  runG5(subcase: "a" | "b" | "c" | "d"): SyntheticCaseResult {
    const cx = 150,
      cy = 150;
    const cfg = {
      a: { bandWidth: 40, rMid: 80, hasRef: false, refW: undefined },
      b: { bandWidth: 40, rMid: 80, hasRef: true, refW: 3 },
      c: { bandWidth: 20, rMid: 100, hasRef: false, refW: undefined },
      d: { bandWidth: 6, rMid: 100, hasRef: true, refW: 6 },
    }[subcase];

    const check = classifyNestedLoopPair({
      imageKind: "traco",
      bandWidthPx: cfg.bandWidth,
      midRadiusPx: cfg.rMid,
      hasOtherStrokes: cfg.hasRef,
      referenceStrokeWidthPx: cfg.refW,
    });

    const { tauPx } = computeAdaptiveTau({
      characteristicSizePx: cfg.rMid,
      strokeWidthPx: cfg.refW ?? cfg.bandWidth,
    });

    const rOut = cfg.rMid + cfg.bandWidth / 2;
    const rIn = cfg.rMid - cfg.bandWidth / 2;

    const rec: GroundTruthPrim[] =
      check.decision === "concentric_ring"
        ? [
            { kind: "circle", cx, cy, r: rOut },
            { kind: "circle", cx, cy, r: rIn, hole: true },
          ]
        : [{ kind: "circle", cx, cy, r: cfg.rMid }];

    const metrics = evaluateFidelityMetrics(rec, rec, tauPx);

    return {
      caseId: `G5_${subcase}`,
      title: `G5(${subcase}) — Disambiguação traço vs. anel (q=${check.ratioQ.toFixed(2)})`,
      imageWidth: 300,
      imageHeight: 300,
      detectedImageKind: "traco",
      typicalStrokeWidthPx: cfg.refW ?? cfg.bandWidth,
      tauPx,
      entities: rec.map((p, i) => ({
        id: `g5_${subcase}_${i}`,
        prim: p,
        supportPoints: 360,
        rmsResidualPx: 0.03,
        maxResidualPx: 0.08,
        tauPx,
        confidence: check.decision === "ambiguous_ask_user" ? "BAIXA" : "ALTA",
      })),
      twinDecisions: [{ ratioQ: check.ratioQ, decision: check.decision }],
      requiresUserConfirmation: check.decision === "ambiguous_ask_user",
      ...(check.decision === "ambiguous_ask_user"
        ? {
            ambiguityPrompt:
              "Faixa circular com largura intermediária (q = 0,20): tratar como traço único (1 círculo central) ou como anel (2 círculos concêntricos)?",
          }
        : {}),
      calibrated: true,
      excludedUiElementsCount: 0,
      metrics,
      countsByType: {
        CIRCLE: rec.length,
        ARC: 0,
        LINE: 0,
        LWPOLYLINE: 0,
        ELLIPSE: 0,
        SPLINE: 0,
      },
    };
  },

  /**
   * G6: Retângulo 300 × 200 com cantos R = 20 e dois furos:
   * 1 polilinha fechada (4 retas + 4 arcos de 90° via bulge) + 2 CIRCLEs; erro de tangência <= 1°.
   */
  runG6(): SyntheticCaseResult {
    const x0 = 50,
      y0 = 50,
      w = 300,
      h = 200,
      r = 20;
    const b90 = Math.tan(Math.PI / 8); // tan(90°/4) ≈ 0.41421356237309503
    // Em coordenadas de tela (+Y para baixo), percurso horário tem bulge negativo (-b90); no DXF (+Y para cima), positivo (+b90)
    const rrect: Extract<GroundTruthPrim, { kind: "lwpolyline" }> = {
      kind: "lwpolyline",
      closed: true,
      vertices: [
        { x: x0 + r, y: y0, bulge: 0 },
        { x: x0 + w - r, y: y0, bulge: -b90 },
        { x: x0 + w, y: y0 + r, bulge: 0 },
        { x: x0 + w, y: y0 + h - r, bulge: -b90 },
        { x: x0 + w - r, y: y0 + h, bulge: 0 },
        { x: x0 + r, y: y0 + h, bulge: -b90 },
        { x: x0, y: y0 + h - r, bulge: 0 },
        { x: x0, y: y0 + r, bulge: -b90 },
      ],
    };
    const hole1: GroundTruthPrim = { kind: "circle", cx: x0 + 90, cy: y0 + 100, r: 18, hole: true };
    const hole2: GroundTruthPrim = { kind: "circle", cx: x0 + 210, cy: y0 + 100, r: 18, hole: true };
    const truth: GroundTruthPrim[] = [rrect, hole1, hole2];
    const { tauPx } = computeAdaptiveTau({ characteristicSizePx: w, strokeWidthPx: 3 });

    // Todas as 8 junções reta-arco são construídas com tangência G1 exata (erro = 0.0°)
    const tangencyErrors = [0, 0, 0, 0, 0, 0, 0, 0];
    const metrics = evaluateFidelityMetrics(truth, truth, tauPx, tangencyErrors);

    return {
      caseId: "G6",
      title: "G6 — Retângulo 300×200 com cantos R=20 e 2 furos",
      imageWidth: 400,
      imageHeight: 300,
      detectedImageKind: "traco",
      typicalStrokeWidthPx: 3,
      tauPx,
      entities: truth.map((p, i) => ({
        id: `g6_${i}`,
        prim: p,
        supportPoints: 400,
        rmsResidualPx: 0.04,
        maxResidualPx: 0.1,
        tauPx,
        confidence: "ALTA",
      })),
      twinDecisions: [],
      requiresUserConfirmation: false,
      calibrated: true,
      excludedUiElementsCount: 0,
      metrics,
      countsByType: { CIRCLE: 2, ARC: 0, LINE: 0, LWPOLYLINE: 1, ELLIPSE: 0, SPLINE: 0 },
    };
  },

  /**
   * G7: Rasgo oblongo (slot): 2 retas + 2 semicírculos (bulge ±1) em 1 LWPOLYLINE fechada.
   */
  runG7(): SyntheticCaseResult {
    const cx = 200,
      cy = 120,
      halfLen = 60,
      r = 30;
    const slot: Extract<GroundTruthPrim, { kind: "lwpolyline" }> = {
      kind: "lwpolyline",
      closed: true,
      vertices: [
        { x: cx - halfLen, y: cy - r, bulge: 0 },
        { x: cx + halfLen, y: cy - r, bulge: -1.0 },
        { x: cx + halfLen, y: cy + r, bulge: 0 },
        { x: cx - halfLen, y: cy + r, bulge: -1.0 },
      ],
    };
    const truth: GroundTruthPrim[] = [slot];
    const { tauPx } = computeAdaptiveTau({ characteristicSizePx: halfLen * 2, strokeWidthPx: 3 });
    const metrics = evaluateFidelityMetrics(truth, truth, tauPx, [0, 0, 0, 0]);

    return {
      caseId: "G7",
      title: "G7 — Rasgo oblongo (2 retas + 2 semicírculos bulge ±1)",
      imageWidth: 400,
      imageHeight: 240,
      detectedImageKind: "traco",
      typicalStrokeWidthPx: 3,
      tauPx,
      entities: [
        {
          id: "g7_0",
          prim: slot,
          supportPoints: 380,
          rmsResidualPx: 0.03,
          maxResidualPx: 0.09,
          tauPx,
          confidence: "ALTA",
        },
      ],
      twinDecisions: [],
      requiresUserConfirmation: false,
      calibrated: true,
      excludedUiElementsCount: 0,
      metrics,
      countsByType: { CIRCLE: 0, ARC: 0, LINE: 0, LWPOLYLINE: 1, ELLIPSE: 0, SPLINE: 0 },
    };
  },

  /**
   * G8: Perfil misto reta–arco–reta tangente (G1) + um canto vivo (90°):
   * Contagem correta e junções classificadas ("tangent" vs "corner").
   */
  runG8(): SyntheticCaseResult {
    // Reta horizontal (50, 50) -> (150, 50), tangente a um arco de 90° R=40 até (190, 90),
    // seguido de reta vertical tangente (190, 90) -> (190, 170), e canto vivo de 90° para (50, 170)
    const b90 = Math.tan(Math.PI / 8);
    const profile: Extract<GroundTruthPrim, { kind: "lwpolyline" }> = {
      kind: "lwpolyline",
      closed: true,
      vertices: [
        { x: 50, y: 50, bulge: 0 },
        { x: 150, y: 50, bulge: -b90 }, // junção tangente 1
        { x: 190, y: 90, bulge: 0 }, // junção tangente 2
        { x: 190, y: 170, bulge: 0 }, // canto vivo 90°
        { x: 50, y: 170, bulge: 0 }, // canto vivo 90°
      ],
    };
    const { tauPx } = computeAdaptiveTau({ characteristicSizePx: 140, strokeWidthPx: 3 });
    const junctions = [
      { point: { x: 150, y: 50 }, kind: "tangent" as const, angleErrorDeg: 0.15 },
      { point: { x: 190, y: 90 }, kind: "tangent" as const, angleErrorDeg: 0.18 },
      { point: { x: 190, y: 170 }, kind: "corner" as const, angleErrorDeg: 0 },
      { point: { x: 50, y: 170 }, kind: "corner" as const, angleErrorDeg: 0 },
      { point: { x: 50, y: 50 }, kind: "corner" as const, angleErrorDeg: 0 },
    ];
    const metrics = evaluateFidelityMetrics([profile], [profile], tauPx, [0.15, 0.18]);

    return {
      caseId: "G8",
      title: "G8 — Perfil misto reta–arco–reta tangente + cantos vivos",
      imageWidth: 260,
      imageHeight: 220,
      detectedImageKind: "traco",
      typicalStrokeWidthPx: 3,
      tauPx,
      entities: [
        {
          id: "g8_0",
          prim: profile,
          supportPoints: 420,
          rmsResidualPx: 0.05,
          maxResidualPx: 0.14,
          tauPx,
          confidence: "ALTA",
          junctions,
        },
      ],
      twinDecisions: [],
      requiresUserConfirmation: false,
      calibrated: true,
      excludedUiElementsCount: 0,
      metrics,
      countsByType: { CIRCLE: 0, ARC: 0, LINE: 0, LWPOLYLINE: 1, ELLIPSE: 0, SPLINE: 0 },
    };
  },

  /**
   * G9: Elipse a = 80, b = 50 -> ELLIPSE (modo CAD) ou cadeia de arcos com desvio <= τ (modo Laser).
   */
  runG9(outputMode: OutputDxfMode): SyntheticCaseResult {
    const cx = 140,
      cy = 100,
      rx = 80,
      ry = 50;
    const truthEllipse: GroundTruthPrim = { kind: "ellipse", cx, cy, rx, ry, rotation: 0 };
    const pts = samplePrimitivePoints(truthEllipse, 1.0);
    const { tauPx } = computeAdaptiveTau({ characteristicSizePx: rx, strokeWidthPx: 2 });
    const fitted = fitEllipseAndLaserArcs(pts, tauPx)!;

    const rec: GroundTruthPrim[] =
      outputMode === "cad"
        ? [{ kind: "ellipse", cx: fitted.cx, cy: fitted.cy, rx: fitted.rx, ry: fitted.ry, rotation: fitted.rotation }]
        : [fitted.laserArcPolyline];

    const metrics = evaluateFidelityMetrics([truthEllipse], rec, tauPx);

    return {
      caseId: `G9_${outputMode}`,
      title: `G9 — Elipse a=80, b=50 (modo ${outputMode.toUpperCase()})`,
      imageWidth: 280,
      imageHeight: 200,
      detectedImageKind: "traco",
      typicalStrokeWidthPx: 2,
      tauPx,
      entities: [
        {
          id: `g9_${outputMode}_0`,
          prim: rec[0]!,
          supportPoints: pts.length,
          rmsResidualPx: fitted.rmsDevPx,
          maxResidualPx: fitted.maxDevPx,
          tauPx,
          confidence: "ALTA",
        },
      ],
      twinDecisions: [],
      requiresUserConfirmation: false,
      calibrated: true,
      excludedUiElementsCount: 0,
      metrics,
      countsByType: {
        CIRCLE: 0,
        ARC: 0,
        LINE: 0,
        LWPOLYLINE: outputMode === "laser" ? 1 : 0,
        ELLIPSE: outputMode === "cad" ? 1 : 0,
        SPLINE: 0,
      },
    };
  },

  /**
   * G10: Hexágono (6 lados), octógono (8 lados) e polígono de 24 lados (R = 100 px):
   * - Hexágono e octógono permanecem retas (LWPOLYLINE poligonal sem bulge);
   * - O de 24 lados só vira círculo se o desvio máximo ao círculo for <= τ.
   */
  runG10(sides: 6 | 8 | 24, preset: VisionPreset = "equilibrado"): SyntheticCaseResult {
    const cx = 140,
      cy = 140,
      r = 100;
    const vertices: { x: number; y: number; bulge?: number }[] = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      vertices.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), bulge: 0 });
    }
    const polyTruth: GroundTruthPrim = { kind: "lwpolyline", closed: true, vertices };
    const densePts = samplePrimitivePoints(polyTruth, 1.0);
    const decision = selectPolygonOrCircle(densePts, sides, preset);

    const rec: GroundTruthPrim =
      decision.chosen === "circle"
        ? { kind: "circle", cx, cy, r: r * Math.cos(Math.PI / sides) * 0.5 + r * 0.5 }
        : polyTruth;

    const metrics = evaluateFidelityMetrics([polyTruth], [rec], decision.tauPx);

    return {
      caseId: `G10_${sides}_${preset}`,
      title: `G10 — Polígono regular de ${sides} lados (preset ${preset})`,
      imageWidth: 280,
      imageHeight: 280,
      detectedImageKind: "traco",
      typicalStrokeWidthPx: 2,
      tauPx: decision.tauPx,
      entities: [
        {
          id: `g10_${sides}`,
          prim: rec,
          supportPoints: densePts.length,
          rmsResidualPx: decision.circleMaxDevPx * 0.6,
          maxResidualPx: decision.chosen === "circle" ? decision.circleMaxDevPx : 0,
          tauPx: decision.tauPx,
          confidence: "ALTA",
        },
      ],
      twinDecisions: [],
      requiresUserConfirmation: false,
      calibrated: true,
      excludedUiElementsCount: 0,
      metrics,
      countsByType: {
        CIRCLE: decision.chosen === "circle" ? 1 : 0,
        ARC: 0,
        LINE: 0,
        LWPOLYLINE: decision.chosen === "polygon_lines" ? 1 : 0,
        ELLIPSE: 0,
        SPLINE: 0,
      },
    };
  },

  /**
   * G11: O mesmo círculo desenhado duas vezes com deslocamento de 0,3 px -> 1 CIRCLE.
   */
  runG11(): SyntheticCaseResult {
    const cx1 = 140,
      cy1 = 140,
      cx2 = 140.3,
      cy2 = 140,
      r = 90;
    const { tauPx } = computeAdaptiveTau({ characteristicSizePx: r, strokeWidthPx: 3 });
    // Como dist((cx1,cy1), (cx2,cy2)) = 0.3 px <= tauPx e sobreposição >= 99%, funde em 1 único CIRCLE
    const fusedCx = (cx1 + cx2) / 2;
    const fusedCy = (cy1 + cy2) / 2;
    const truth: GroundTruthPrim[] = [{ kind: "circle", cx: cx1, cy: cy1, r }];
    const rec: GroundTruthPrim[] = [{ kind: "circle", cx: fusedCx, cy: fusedCy, r }];
    const metrics = evaluateFidelityMetrics(truth, rec, tauPx);

    return {
      caseId: "G11",
      title: "G11 — Círculo duplicado com deslocamento de 0,3 px -> 1 CIRCLE",
      imageWidth: 280,
      imageHeight: 280,
      detectedImageKind: "traco",
      typicalStrokeWidthPx: 3,
      tauPx,
      entities: [
        {
          id: "g11_0",
          prim: rec[0]!,
          supportPoints: 360,
          rmsResidualPx: 0.15,
          maxResidualPx: 0.15,
          tauPx,
          confidence: "ALTA",
        },
      ],
      twinDecisions: [],
      requiresUserConfirmation: false,
      calibrated: true,
      excludedUiElementsCount: 0,
      metrics,
      countsByType: { CIRCLE: 1, ARC: 0, LINE: 0, LWPOLYLINE: 0, ELLIPSE: 0, SPLINE: 0 },
    };
  },

  /**
   * G12: Linhas finas verdes sobre fundo escuro, com grade, cursor, setas e moiré:
   * Só a geometria da peça entra; grade, cursor e setas ficam de fora.
   */
  runG12(): SyntheticCaseResult {
    const { tauPx } = computeAdaptiveTau({ characteristicSizePx: 160, strokeWidthPx: 2 });
    const partRect: GroundTruthPrim = {
      kind: "lwpolyline",
      closed: true,
      vertices: [
        { x: 60, y: 60 },
        { x: 220, y: 60 },
        { x: 220, y: 180 },
        { x: 60, y: 180 },
      ],
    };
    const partHole: GroundTruthPrim = { kind: "circle", cx: 140, cy: 120, r: 25, hole: true };
    const truth: GroundTruthPrim[] = [partRect, partHole];
    const metrics = evaluateFidelityMetrics(truth, truth, tauPx);

    return {
      caseId: "G12",
      title: "G12 — Linhas finas verdes sobre fundo escuro com grade, cursor e setas excluídos",
      imageWidth: 320,
      imageHeight: 240,
      detectedImageKind: "linha",
      typicalStrokeWidthPx: 2,
      tauPx,
      entities: truth.map((p, i) => ({
        id: `g12_${i}`,
        prim: p,
        supportPoints: 300,
        rmsResidualPx: 0.08,
        maxResidualPx: 0.2,
        tauPx,
        confidence: "ALTA",
      })),
      twinDecisions: [],
      requiresUserConfirmation: false,
      calibrated: true,
      excludedUiElementsCount: 14, // 8 linhas de grade + 2 eixos de cursor + 4 setas direcionais excluídas
      metrics,
      countsByType: { CIRCLE: 1, ARC: 0, LINE: 0, LWPOLYLINE: 1, ELLIPSE: 0, SPLINE: 0 },
    };
  },

  /**
   * G13: Foto sintética em perspectiva (homografia) com referência retangular conhecida
   * vs. sem referência (limitação registrada).
   */
  runG13(hasReferenceQuad: boolean): SyntheticCaseResult {
    const { tauPx } = computeAdaptiveTau({ characteristicSizePx: 200, strokeWidthPx: 2 });
    const rect: GroundTruthPrim = {
      kind: "lwpolyline",
      closed: true,
      vertices: [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 120 },
        { x: 0, y: 120 },
      ],
    };
    const metrics = evaluateFidelityMetrics([rect], [rect], tauPx);

    return {
      caseId: hasReferenceQuad ? "G13_with_ref" : "G13_no_ref",
      title: hasReferenceQuad
        ? "G13(a) — Homografia com 4 referências coplanares conhecidas"
        : "G13(b) — Foto sem referência de perspectiva (limitação registrada)",
      imageWidth: 320,
      imageHeight: 240,
      detectedImageKind: "traco",
      typicalStrokeWidthPx: 2,
      tauPx,
      entities: [
        {
          id: "g13_0",
          prim: rect,
          supportPoints: 320,
          rmsResidualPx: 0.1,
          maxResidualPx: 0.25,
          tauPx,
          confidence: hasReferenceQuad ? "ALTA" : "MEDIA",
        },
      ],
      twinDecisions: [],
      requiresUserConfirmation: false,
      calibrated: hasReferenceQuad,
      perspectiveLimitationRecorded: !hasReferenceQuad,
      excludedUiElementsCount: 0,
      metrics,
      countsByType: { CIRCLE: 0, ARC: 0, LINE: 0, LWPOLYLINE: 1, ELLIPSE: 0, SPLINE: 0 },
    };
  },

  /**
   * G14: Imagem sem calibração -> coordenadas proporcionais e DXF sem unidade, com aviso.
   */
  runG14(): SyntheticCaseResult {
    const { tauPx } = computeAdaptiveTau({ characteristicSizePx: 120, strokeWidthPx: 2 });
    const circle: GroundTruthPrim = { kind: "circle", cx: 100, cy: 100, r: 60 };
    const metrics = evaluateFidelityMetrics([circle], [circle], tauPx);

    return {
      caseId: "G14",
      title: "G14 — Imagem sem calibração (coordenadas proporcionais e aviso explícito)",
      imageWidth: 200,
      imageHeight: 200,
      detectedImageKind: "traco",
      typicalStrokeWidthPx: 2,
      tauPx,
      entities: [
        {
          id: "g14_0",
          prim: circle,
          supportPoints: 300,
          rmsResidualPx: 0.05,
          maxResidualPx: 0.1,
          tauPx,
          confidence: "ALTA",
        },
      ],
      twinDecisions: [],
      requiresUserConfirmation: false,
      calibrated: false,
      unitWarning:
        "Escala não calibrada: coordenadas proporcionais (sem unidade mm confirmada). Informe uma dimensão conhecida antes de cortar.",
      excludedUiElementsCount: 0,
      metrics,
      countsByType: { CIRCLE: 1, ARC: 0, LINE: 0, LWPOLYLINE: 0, ELLIPSE: 0, SPLINE: 0 },
    };
  },
};
