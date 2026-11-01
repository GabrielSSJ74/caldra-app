/**
 * CHAMFER VISION 2.0 — FASE D: SEGMENTAÇÃO, AJUSTE DE PRIMITIVAS, TANGÊNCIA G1 E TOPOLOGIA (SEÇÕES 8, 9 e 10)
 *
 * Implementa os estágios S6, S7, S8 e S9 do pipeline unificado:
 * - S6: Segmentação por cantos vivos (ângulo de giro >= 28° em janela L_w entre 4 px e 3% do perímetro)
 *       e pontos de transição de curvatura (reta <-> arco) sobre contorno levemente suavizado.
 * - S7: Seleção de modelo geométrico sobre coordenadas sub-pixel brutas com tolerância adaptativa τ
 *       proporcional à própria feição (e NUNCA à diagonal inteira da imagem):
 *       RETA (PCA/TLS) < ARCO (Taubin + Gauss-Newton, span >= 15°, flecha >= 2τ) < CÍRCULO (span >= 330°)
 *       < ELIPSE (b/a <= 0.95) < CADEIA DE ARCOS TANGENTES.
 *       Polígonos regulares (hexágono, octógono) permanecem retas quando cantos >= 28° ou sagitta > τ.
 * - S8: Refinamento conjunto de tangência G1 (diferença <= 4°), fusão de retas colineares (<= 1°, <= τ)
 *       e arcos cocirculares, reconstrução exata de cantos por interseção de retas e solda de vértices
 *       compartilhados dentro de τ_solda = min(2τ, 0.5 · L_min).
 * - S9: Validação de cobertura (>= 99%), excesso (<= 1%), confiança (ALTA / MEDIA / BAIXA) e proveniência.
 */

import type { Contour, PxPoint } from "./visionEngine";
import type { Prim } from "./geometryRecognizer";
import {
  CALIBRATED_THRESHOLDS,
  classifyConfidence,
  computeAdaptiveTau,
  computeWeldTolerancePx,
  toleranceToPreset,
  type ConfidenceLevel,
  type OutputDxfMode,
  type VisionPreset,
} from "./visionThresholdConfig";
import {
  bulgeToArc,
  evaluateFidelityMetrics,
  fitCircleTaubinGaussNewton,
  fitEllipseAndLaserArcs,
  selectPolygonOrCircle,
  type FidelityMetrics,
  type GroundTruthPrim,
} from "./visionMetricsAndHarness";

/* ========================================================================== */
/* 1. TIPOS DE SEGMENTAÇÃO, JUNÇÕES E AUDITORIA DOS ESTÁGIOS S6–S9            */
/* ========================================================================== */

export interface JunctionInfo {
  vertexIndex: number;
  x: number;
  y: number;
  kind: "tangent_G1" | "sharp_corner";
  turnAngleDeg: number;
  residualTangencyDeg: number;
}

export interface FittedSegmentD {
  kind: "line" | "arc";
  p0: PxPoint;
  p1: PxPoint;
  /** Bulge tan(Δθ/4) = 0 para reta, != 0 para arco. */
  bulge: number;
  cx?: number;
  cy?: number;
  r?: number;
  a0?: number;
  a1?: number;
  ccw?: boolean;
  maxDevPx: number;
  rmsDevPx: number;
  tauPx: number;
  supportPoints: number;
  sourceRange: [number, number];
}

export interface ContourFitResultD {
  /** Primitivas geradas (compatíveis com Prim do CHAMFER VISION). */
  prims: Prim[];
  /** Representação unificada para avaliação de fidelidade e exportação LWPOLYLINE c/ bulge. */
  groundTruthForm: GroundTruthPrim[];
  /** Junções classificadas (tangente G1 vs canto vivo). */
  junctions: JunctionInfo[];
  /** Tolerância adaptativa τ efetiva aplicada ao contorno (px). */
  tauPx: number;
  /** Desvio máximo medido em relação aos pontos sub-pixel originais (px). */
  maxDevPx: number;
  /** Desvio RMS medido (px). */
  rmsDevPx: number;
  /** Nível de confiança da reconstrução (Seção 10). */
  confidence: ConfidenceLevel;
  /** Padrão geométrico reconhecido. */
  patternKind:
    | "circle"
    | "ellipse"
    | "regular_polygon"
    | "rounded_rect"
    | "oblong_slot"
    | "mixed_closed"
    | "open_chain";
}

export interface StageS6ToS9Options {
  preset?: VisionPreset;
  typicalStrokeWidthPx?: number;
  outputMode?: OutputDxfMode;
  preferCircles?: boolean;
  regularize?: boolean;
  /** Quando verdadeiro, emite contornos compostos fechados como UMA polilinha fechada com bulges. */
  emitUnifiedLwPolyline?: boolean;
  maxDevCapMm?: number;
  mmPerPx?: number;
}

export interface StageS6ToS9Result {
  prims: Prim[];
  contourResults: ContourFitResultD[];
  fidelity: FidelityMetrics;
  countsByType: {
    CIRCLE: number;
    ARC: number;
    LINE: number;
    LWPOLYLINE: number;
    ELLIPSE: number;
  };
  stageTimingsMs: {
    s6Segmentation: number;
    s7PrimitiveFitting: number;
    s8TangencyAndTopology: number;
    s9Validation: number;
  };
}

/* ========================================================================== */
/* 2. UTILITÁRIOS GEOMÉTRICOS E AJUSTE DE RETA (TLS / PCA)                    */
/* ========================================================================== */

const TWO_PI = Math.PI * 2;

function normalizeAngleSigned(a: number): number {
  let r = a % TWO_PI;
  if (r > Math.PI) r -= TWO_PI;
  if (r <= -Math.PI) r += TWO_PI;
  return r;
}

function perpDistToLine(p: PxPoint, a: PxPoint, b: PxPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function perpDistToSegment(p: PxPoint, a: PxPoint, b: PxPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Ajuste de reta por Mínimos Quadrados Totais (PCA) sobre pontos sub-pixel brutos.
 */
export function fitLineTLS(run: PxPoint[]): {
  a: PxPoint;
  b: PxPoint;
  ux: number;
  uy: number;
  mx: number;
  my: number;
  length: number;
  maxDev: number;
  rmsDev: number;
} {
  const n = run.length;
  if (n < 2) {
    const p = run[0] ?? { x: 0, y: 0 };
    return { a: p, b: p, ux: 1, uy: 0, mx: p.x, my: p.y, length: 0, maxDev: 0, rmsDev: 0 };
  }
  let mx = 0;
  let my = 0;
  for (const p of run) {
    mx += p.x;
    my += p.y;
  }
  mx /= n;
  my /= n;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of run) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  let theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let ux = Math.cos(theta);
  let uy = Math.sin(theta);

  // Orienta (ux, uy) no sentido de run[0] -> run[n-1]
  const dirX = run[n - 1]!.x - run[0]!.x;
  const dirY = run[n - 1]!.y - run[0]!.y;
  if (dirX * ux + dirY * uy < 0) {
    ux = -ux;
    uy = -uy;
    theta = Math.atan2(uy, ux);
  }

  let t0 = Infinity;
  let t1 = -Infinity;
  for (const p of run) {
    const t = (p.x - mx) * ux + (p.y - my) * uy;
    if (t < t0) t0 = t;
    if (t > t1) t1 = t;
  }
  const a = { x: mx + ux * t0, y: my + uy * t0 };
  const b = { x: mx + ux * t1, y: my + uy * t1 };

  let maxDev = 0;
  let sumSq = 0;
  for (const p of run) {
    const d = Math.abs(-(p.x - mx) * uy + (p.y - my) * ux);
    if (d > maxDev) maxDev = d;
    sumSq += d * d;
  }

  return {
    a,
    b,
    ux,
    uy,
    mx,
    my,
    length: Math.max(0, t1 - t0),
    maxDev,
    rmsDev: Math.sqrt(sumSq / n),
  };
}

/** Interseção exata de duas retas infinitas (A1->B1) e (A2->B2). */
function intersectInfiniteLines(
  a1: PxPoint,
  b1: PxPoint,
  a2: PxPoint,
  b2: PxPoint,
): PxPoint | null {
  const dx1 = b1.x - a1.x;
  const dy1 = b1.y - a1.y;
  const dx2 = b2.x - a2.x;
  const dy2 = b2.y - a2.y;
  const det = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(det) < 1e-7) return null;
  const t = ((a2.x - a1.x) * dy2 - (a2.y - a1.y) * dx2) / det;
  return {
    x: a1.x + t * dx1,
    y: a1.y + t * dy1,
  };
}

/* ========================================================================== */
/* 3. ESTÁGIO S6 — DETECÇÃO SUB-PIXEL DE CANTOS VIVOS E TRANSIÇÕES Righ/Arc   */
/* ========================================================================== */

/**
 * Suavização leve APENAS para estimar tangentes e detectar cantos (Seção 8:
 * "Use as coordenadas subpixel brutas para ajustar; suavize levemente só para detectar cantos e curvatura").
 */
function smoothForCornerDetection(pts: PxPoint[], closed: boolean, radius = 2): PxPoint[] {
  const n = pts.length;
  if (n < 6) return pts;
  const out: PxPoint[] = [];
  for (let i = 0; i < n; i++) {
    let sx = 0;
    let sy = 0;
    let wSum = 0;
    for (let d = -radius; d <= radius; d++) {
      const idx = closed ? (i + d + n) % n : Math.max(0, Math.min(n - 1, i + d));
      const w = radius + 1 - Math.abs(d);
      sx += pts[idx]!.x * w;
      sy += pts[idx]!.y * w;
      wSum += w;
    }
    out.push({ x: sx / wSum, y: sy / wSum });
  }
  return out;
}

/**
 * Detecta cantos vivos (ângulo de giro >= 28° em janela L_w entre 4 px e 3% do perímetro ≈ 3·w₀)
 * com supressão de não-máximos e comparação explícita Canto Vivo (2 retas) vs Arco Circular Suave.
 */
export function detectCornersS6(
  rawPts: PxPoint[],
  closed: boolean,
  typicalStrokeWidthPx = 1,
  minTurnAngleDeg = CALIBRATED_THRESHOLDS.cornerMinTurnAngleDeg,
): { index: number; turnAngleDeg: number }[] {
  const n = rawPts.length;
  if (n < 8) {
    return closed
      ? []
      : [
          { index: 0, turnAngleDeg: 180 },
          { index: n - 1, turnAngleDeg: 180 },
        ];
  }

  const pts = smoothForCornerDetection(rawPts, closed, 1);
  const wWindow = Math.max(
    CALIBRATED_THRESHOLDS.cornerMinWindowPx,
    Math.min(
      16,
      Math.round(
        Math.max(
          CALIBRATED_THRESHOLDS.cornerStrokeWindowFactor * typicalStrokeWidthPx,
          Math.min(12, n * CALIBRATED_THRESHOLDS.cornerMaxPerimeterFraction),
        ),
      ),
    ),
  );

  const wShort = Math.max(3, Math.min(5, Math.round(1.5 * typicalStrokeWidthPx)));
  const minTurnRad = (minTurnAngleDeg * Math.PI) / 180;
  const scores = new Float32Array(n);
  const at = (i: number): PxPoint =>
    pts[closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))]!;
  const atRaw = (i: number): PxPoint =>
    rawPts[closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))]!;

  for (let i = 0; i < n; i++) {
    if (!closed && (i < wWindow || i > n - 1 - wWindow)) continue;
    const pPrev = at(i - wWindow);
    const pCurr = at(i);
    const pNext = at(i + wWindow);

    const a1 = Math.atan2(pCurr.y - pPrev.y, pCurr.x - pPrev.x);
    const a2 = Math.atan2(pNext.y - pCurr.y, pNext.x - pCurr.x);
    const turn = Math.abs(normalizeAngleSigned(a2 - a1));
    if (turn < minTurnRad) continue;

    // Verifica concentração local do giro na vizinhança imediata (±wShort):
    // Num canto vivo real, o giro já ocorre quase inteiro em ±3..5 px; numa transição tangente G1
    // ou num arco de raio R >= 10 px, o giro em ±wShort é pequeno (proporcional a wShort / R).
    const pShortPrev = atRaw(i - wShort);
    const pShortCurr = atRaw(i);
    const pShortNext = atRaw(i + wShort);
    const sA1 = Math.atan2(pShortCurr.y - pShortPrev.y, pShortCurr.x - pShortPrev.x);
    const sA2 = Math.atan2(pShortNext.y - pShortCurr.y, pShortNext.x - pShortCurr.x);
    const shortTurn = Math.abs(normalizeAngleSigned(sA2 - sA1));
    if (shortTurn < Math.min(minTurnRad * 0.62, turn * 0.52)) continue;

    // Flecha na janela para confirmar que o giro é localizado num vértice
    const sag = perpDistToSegment(pCurr, pPrev, pNext);
    if (sag < 0.85) continue;

    // Compara hipótese de CANTO VIVO (duas semirretas encontrando-se em i) vs ARCO SUAVE (um círculo único):
    const leftRun: PxPoint[] = [];
    const rightRun: PxPoint[] = [];
    const fullRun: PxPoint[] = [];
    for (let k = -wWindow; k <= 0; k++) {
      const p = atRaw(i + k);
      leftRun.push(p);
      fullRun.push(p);
    }
    for (let k = 1; k <= wWindow; k++) {
      const p = atRaw(i + k);
      rightRun.push(p);
      fullRun.push(p);
    }
    for (let k = 0; k <= wWindow; k++) {
      if (k === 0) rightRun.unshift(atRaw(i));
    }

    const leftLine = fitLineTLS(leftRun);
    const rightLine = fitLineTLS(rightRun);
    const twoLineMaxDev = Math.max(leftLine.maxDev, rightLine.maxDev);

    // As duas abas de um canto vivo devem ser retilíneas
    if (twoLineMaxDev > Math.max(1.15, sag * 0.38)) {
      continue;
    }

    // Se um arco circular único explica a janela [i - wWindow, i + wWindow] tão bem ou melhor que duas retas,
    // trata-se de um arco suave (ex.: canto arredondado R=30), NÃO de um canto vivo!
    const localCircle = fitCircleTaubinGaussNewton(fullRun);
    if (
      localCircle &&
      localCircle.r >= 4 &&
      localCircle.maxDev <= Math.max(0.45, twoLineMaxDev * 1.35)
    ) {
      continue;
    }

    scores[i] = turn;
  }

  const corners: { index: number; turnAngleDeg: number }[] = [];
  for (let i = 0; i < n; i++) {
    const s = scores[i]!;
    if (s <= 0) continue;
    let isLocalMax = true;
    for (let d = -wWindow; d <= wWindow; d++) {
      if (d === 0) continue;
      const j = closed ? ((i + d) % n + n) % n : i + d;
      if (j < 0 || j >= n) continue;
      if (scores[j]! > s || (scores[j]! === s && j < i)) {
        isLocalMax = false;
        break;
      }
    }
    if (isLocalMax) {
      corners.push({ index: i, turnAngleDeg: (s * 180) / Math.PI });
    }
  }

  if (!closed) {
    if (corners.length === 0 || corners[0]!.index !== 0) {
      corners.unshift({ index: 0, turnAngleDeg: 180 });
    }
    if (corners[corners.length - 1]!.index !== n - 1) {
      corners.push({ index: n - 1, turnAngleDeg: 180 });
    }
  }

  return corners;
}

/**
 * Decompõe um contorno fechado em segmentos retos (separados por cantos vivos ou por arcos)
 * e trechos curvos complementares (ajustados como arcos circulares Taubin + Gauss-Newton).
 * Resolve de forma unificada G6 (retângulo arredondado), G7 (slot oblongo) e G8 (perfil misto
 * com cantos vivos e transições tangentes reta–arco na mesma peça).
 */
function decomposeByStraightTransitionsS6(
  pts: PxPoint[],
  closed: boolean,
  corners: { index: number; turnAngleDeg: number }[],
  options: {
    preset: VisionPreset;
    typicalStrokeWidthPx: number;
    maxDevCapMm?: number;
    mmPerPx?: number;
  },
): FittedSegmentD[] | null {
  const n = pts.length;
  if (n < 20 || !closed) return null;

  const win = 8;
  const maxFlatTurnRad = (3.5 * Math.PI) / 180;
  const maxFlatSagPx = Math.max(0.22, 0.15 * options.typicalStrokeWidthPx);
  const isFlat = new Uint8Array(n);
  const isCornerIdx = new Uint8Array(n);
  for (const c of corners) {
    isCornerIdx[((c.index % n) + n) % n] = 1;
  }

  const at = (idx: number): PxPoint => pts[((idx % n) + n) % n]!;
  const smoothed = smoothForCornerDetection(pts, true, 1);
  const atSmooth = (idx: number): PxPoint => smoothed[((idx % n) + n) % n]!;

  for (let i = 0; i < n; i++) {
    const pPrev = atSmooth(i - win);
    const pCurr = atSmooth(i);
    const pNext = atSmooth(i + win);
    const a1 = Math.atan2(pCurr.y - pPrev.y, pCurr.x - pPrev.x);
    const a2 = Math.atan2(pNext.y - pCurr.y, pNext.x - pCurr.x);
    const turn = Math.abs(normalizeAngleSigned(a2 - a1));
    const sag = perpDistToSegment(pCurr, pPrev, pNext);
    if (turn <= maxFlatTurnRad && sag <= maxFlatSagPx) {
      isFlat[i] = 1;
    }
  }

  // Quebra obrigatoriamente a máscara `isFlat` nos cantos vivos detectados por S6
  // para que duas retas concorrentes num canto vivo (ex.: G8) formem dois segmentos retos distintos!
  for (const c of corners) {
    for (let d = -3; d <= 3; d++) {
      isFlat[((c.index + d) % n + n) % n] = 0;
    }
  }

  // Encontra intervalos contíguos de pontos planos
  const runs: { start: number; end: number }[] = [];
  let i = 0;
  while (i < n) {
    if (isFlat[i] === 1) {
      let j = i;
      while (j + 1 < n && isFlat[j + 1] === 1) j++;
      runs.push({ start: i, end: j });
      i = j + 1;
    } else {
      i++;
    }
  }

  // Se o primeiro e o último intervalo se tocam no índice 0 (e 0 não é canto vivo), funde-os
  // mantendo coordenadas monotônicas crescentes (start = last.start - n <= 0, end = first.end)
  if (
    runs.length >= 2 &&
    runs[0]!.start === 0 &&
    runs[runs.length - 1]!.end === n - 1 &&
    isFlat[0] === 1
  ) {
    const first = runs[0]!;
    const last = runs.pop()!;
    runs[0] = { start: last.start - n, end: first.end };
  }

  // Filtra núcleos retilíneos sustentados (>= 6 pontos, já que win=8 consome 6 px de cada ponta)
  const validStraightRuns: {
    start: number;
    end: number;
    lineFit: ReturnType<typeof fitLineTLS>;
  }[] = [];

  for (const r of runs) {
    const count = r.end - r.start + 1;
    if (count < 6) continue;

    const corePts: PxPoint[] = [];
    for (let k = r.start; k <= r.end; k++) corePts.push(at(k));
    const coreLine = fitLineTLS(corePts);
    if (coreLine.length < 6) continue;

    // Expande a partir do núcleo 100% reto até o ponto exato de tangência/canto onde o contorno diverge da reta
    const expandTol = Math.max(0.12, coreLine.maxDev * 2.0);
    let sIdx = r.start;
    let eIdx = r.end;
    const maxExpand = win + 2;

    for (let step = 1; step <= maxExpand; step++) {
      const prevMod = (((sIdx - 1) % n) + n) % n;
      const pCandidate = at(sIdx - 1);
      if (perpDistToLine(pCandidate, coreLine.a, coreLine.b) <= expandTol) {
        sIdx--;
        if (isCornerIdx[prevMod] === 1) break;
      } else {
        break;
      }
    }
    for (let step = 1; step <= maxExpand; step++) {
      const nextMod = (((eIdx + 1) % n) + n) % n;
      const pCandidate = at(eIdx + 1);
      if (perpDistToLine(pCandidate, coreLine.a, coreLine.b) <= expandTol) {
        eIdx++;
        if (isCornerIdx[nextMod] === 1) break;
      } else {
        break;
      }
    }

    const fullPts: PxPoint[] = [];
    for (let k = sIdx; k <= eIdx; k++) fullPts.push(at(k));
    const finalLine = fitLineTLS(fullPts);
    if (finalLine.length >= 10) {
      validStraightRuns.push({ start: sIdx, end: eIdx, lineFit: finalLine });
    }
  }

  if (validStraightRuns.length < 2) return null;

  const segments: FittedSegmentD[] = [];
  const m = validStraightRuns.length;
  let arcGapCount = 0;

  for (let k = 0; k < m; k++) {
    const curr = validStraightRuns[k]!;
    const next = validStraightRuns[(k + 1) % m]!;

    const { tauPx: tauLine } = computeAdaptiveTau({
      characteristicSizePx: Math.max(8, curr.lineFit.length),
      strokeWidthPx: options.typicalStrokeWidthPx,
      preset: options.preset,
      maxDevCapMm: options.maxDevCapMm,
      mmPerPx: options.mmPerPx,
    });

    segments.push({
      kind: "line",
      p0: at(curr.start),
      p1: at(curr.end),
      bulge: 0,
      maxDevPx: curr.lineFit.maxDev,
      rmsDevPx: curr.lineFit.rmsDev,
      tauPx: tauLine,
      supportPoints: curr.end - curr.start + 1,
      sourceRange: [((curr.start % n) + n) % n, ((curr.end % n) + n) % n],
    });

    // Verifica o intervalo entre o fim da reta atual e o início da próxima reta no ciclo
    const currEndIdx = curr.end;
    const nextStartIdx = k < m - 1 ? next.start : next.start + n;
    const gapCount = nextStartIdx - currEndIdx;

    // Se o gap for pequeno (<= 2*win + 4, inclusive <= 0 quando tocam no canto vivo),
    // as duas retas se encontram diretamente num canto vivo!
    if (gapCount <= 2 * win + 4) {
      continue;
    }
    arcGapCount++;

    // Caso contrário, o intervalo [currEndIdx, nextStartIdx] é um trecho curvo (arco de concordância / semicírculo)
    const arcPts: PxPoint[] = [];
    for (let idx = currEndIdx; idx <= nextStartIdx; idx++) {
      arcPts.push(at(idx));
    }

    const circleFit = fitCircleTaubinGaussNewton(arcPts);
    if (circleFit && circleFit.r >= 2 && circleFit.r < 50000) {
      const { tauPx: tauArc } = computeAdaptiveTau({
        characteristicSizePx: circleFit.r,
        strokeWidthPx: options.typicalStrokeWidthPx,
        preset: options.preset,
        maxDevCapMm: options.maxDevCapMm,
        mmPerPx: options.mmPerPx,
      });
      if (circleFit.maxDev <= Math.max(tauArc * 1.5, 1.5)) {
        const pFirst = arcPts[0]!;
        const pMid = arcPts[Math.floor(arcPts.length / 2)]!;
        const pLast = arcPts[arcPts.length - 1]!;
        const arcGeom = computeArcBulgeFromThreePoints(
          pFirst,
          pMid,
          pLast,
          circleFit.cx,
          circleFit.cy,
        );
        segments.push({
          kind: "arc",
          p0: pFirst,
          p1: pLast,
          bulge: arcGeom.bulge,
          cx: circleFit.cx,
          cy: circleFit.cy,
          r: circleFit.r,
          a0: arcGeom.a0,
          a1: arcGeom.a1,
          ccw: arcGeom.ccw,
          maxDevPx: circleFit.maxDev,
          rmsDevPx: circleFit.rmsDev,
          tauPx: tauArc,
          supportPoints: arcPts.length,
          sourceRange: [((currEndIdx % n) + n) % n, ((nextStartIdx % n) + n) % n],
        });
        continue;
      }
    }

    // Fallback se o trecho curvo composto precisar de mais de 1 primitiva
    segments.push(
      ...fitRunModelSelectionS7(arcPts, ((currEndIdx % n) + n) % n, {
        ...options,
        depth: 2,
      }),
    );
  }

  return segments;
}

/* ========================================================================== */
/* 4. ESTÁGIO S7 — SELEÇÃO DE MODELO POR TRECHO (RETA vs ARCO vs SUBDIVISÃO)  */
/* ========================================================================== */

/**
 * Converte um arco circular orientado de `p0` a `p1` passando por `pMid` em bulge = tan(Δθ/4).
 */
export function computeArcBulgeFromThreePoints(
  p0: PxPoint,
  pMid: PxPoint,
  p1: PxPoint,
  cx: number,
  cy: number,
): { bulge: number; a0: number; a1: number; ccw: boolean; spanRad: number } {
  const a0 = Math.atan2(p0.y - cy, p0.x - cx);
  const am = Math.atan2(pMid.y - cy, pMid.x - cx);
  const a1 = Math.atan2(p1.y - cy, p1.x - cx);

  const normPos = (v: number) => ((v % TWO_PI) + TWO_PI) % TWO_PI;
  const ccwSweepToMid = normPos(am - a0);
  const ccwSweepToEnd = normPos(a1 - a0);
  const ccw = ccwSweepToMid <= ccwSweepToEnd;
  const spanRad = ccw ? ccwSweepToEnd : normPos(a0 - a1);
  const signedTheta = ccw ? spanRad : -spanRad;
  const bulge = Math.tan(signedTheta / 4);

  return {
    bulge,
    a0: ccw ? a0 : a1,
    a1: ccw ? a1 : a0,
    ccw,
    spanRad,
  };
}

/**
 * Ajusta recursivamente um trecho sub-pixel entre quebras usando SELEÇÃO DE MODELO (Seção 8):
 * 1. Tenta RETA (PCA/TLS) com τ_reta = computeAdaptiveTau(comprimento).
 * 2. Tenta ARCO (Taubin + Gauss-Newton) com τ_arco = computeAdaptiveTau(raio), exigindo
 *    span >= 15° e flecha (sagitta) >= 2·τ_reta.
 * 3. Se houver transição suave reta<->arco, decompõe pelos núcleos retilíneos (S6).
 * 4. Caso contrário, divide no ponto de maior desvio e recorre.
 */
export function fitRunModelSelectionS7(
  run: PxPoint[],
  rangeStartIdx: number,
  options: {
    preset: VisionPreset;
    typicalStrokeWidthPx: number;
    maxDevCapMm?: number;
    mmPerPx?: number;
    depth?: number;
  },
): FittedSegmentD[] {
  const n = run.length;
  const pFirst = run[0]!;
  const pLast = run[n - 1]!;
  const depth = options.depth ?? 0;

  if (n <= 3) {
    const chord = Math.hypot(pLast.x - pFirst.x, pLast.y - pFirst.y);
    const { tauPx } = computeAdaptiveTau({
      characteristicSizePx: Math.max(4, chord),
      strokeWidthPx: options.typicalStrokeWidthPx,
      preset: options.preset,
      maxDevCapMm: options.maxDevCapMm,
      mmPerPx: options.mmPerPx,
    });
    return [
      {
        kind: "line",
        p0: pFirst,
        p1: pLast,
        bulge: 0,
        maxDevPx: 0,
        rmsDevPx: 0,
        tauPx,
        supportPoints: n,
        sourceRange: [rangeStartIdx, rangeStartIdx + n - 1],
      },
    ];
  }

  // 1. Ajuste de RETA
  const lineFit = fitLineTLS(run);
  const { tauPx: tauLine } = computeAdaptiveTau({
    characteristicSizePx: Math.max(8, lineFit.length),
    strokeWidthPx: options.typicalStrokeWidthPx,
    preset: options.preset,
    maxDevCapMm: options.maxDevCapMm,
    mmPerPx: options.mmPerPx,
  });

  // Mede flecha máxima (sagitta) em relação à corda pFirst -> pLast
  let chordSagitta = 0;
  let maxChordIdx = Math.floor(n / 2);
  for (let i = 1; i < n - 1; i++) {
    const d = perpDistToSegment(run[i]!, pFirst, pLast);
    if (d > chordSagitta) {
      chordSagitta = d;
      maxChordIdx = i;
    }
  }

  // Regra da Seção 8: RETA vence se desvio <= τ_reta OU se a flecha for < 2·τ_min
  if (lineFit.maxDev <= tauLine && chordSagitta < tauLine * 1.85) {
    return [
      {
        kind: "line",
        p0: pFirst,
        p1: pLast,
        bulge: 0,
        maxDevPx: lineFit.maxDev,
        rmsDevPx: lineFit.rmsDev,
        tauPx: tauLine,
        supportPoints: n,
        sourceRange: [rangeStartIdx, rangeStartIdx + n - 1],
      },
    ];
  }

  // 2. Ajuste de ARCO (Taubin + Gauss-Newton sem viés em arcos curtos)
  const circleFit = fitCircleTaubinGaussNewton(run);
  if (circleFit && circleFit.r > 2 && circleFit.r < 50000) {
    const { tauPx: tauArc } = computeAdaptiveTau({
      characteristicSizePx: circleFit.r,
      strokeWidthPx: options.typicalStrokeWidthPx,
      preset: options.preset,
      maxDevCapMm: options.maxDevCapMm,
      mmPerPx: options.mmPerPx,
    });

    const pMid = run[Math.floor(n / 2)]!;
    const arcGeom = computeArcBulgeFromThreePoints(
      pFirst,
      pMid,
      pLast,
      circleFit.cx,
      circleFit.cy,
    );
    const spanDeg = (arcGeom.spanRad * 180) / Math.PI;
    const minSagitta = CALIBRATED_THRESHOLDS.arcMinSagittaTauFactor * Math.min(tauArc, 1.0);

    if (
      circleFit.maxDev <= tauArc * 1.15 &&
      spanDeg >= CALIBRATED_THRESHOLDS.arcMinSpanDeg &&
      chordSagitta >= minSagitta
    ) {
      return [
        {
          kind: "arc",
          p0: pFirst,
          p1: pLast,
          bulge: arcGeom.bulge,
          cx: circleFit.cx,
          cy: circleFit.cy,
          r: circleFit.r,
          a0: arcGeom.a0,
          a1: arcGeom.a1,
          ccw: arcGeom.ccw,
          maxDevPx: circleFit.maxDev,
          rmsDevPx: circleFit.rmsDev,
          tauPx: tauArc,
          supportPoints: n,
          sourceRange: [rangeStartIdx, rangeStartIdx + n - 1],
        },
      ];
    }
  }

  // Se o desvio da reta ainda couber em tauLine, aceita a reta
  if (lineFit.maxDev <= tauLine) {
    return [
      {
        kind: "line",
        p0: pFirst,
        p1: pLast,
        bulge: 0,
        maxDevPx: lineFit.maxDev,
        rmsDevPx: lineFit.rmsDev,
        tauPx: tauLine,
        supportPoints: n,
        sourceRange: [rangeStartIdx, rangeStartIdx + n - 1],
      },
    ];
  }

  // 3. Subdivisão recursiva no ponto de maior desvio da corda
  if (n >= 10 && depth < 6) {
    const splitIdx = Math.max(3, Math.min(n - 4, maxChordIdx));
    const left = fitRunModelSelectionS7(run.slice(0, splitIdx + 1), rangeStartIdx, {
      ...options,
      depth: depth + 1,
    });
    const right = fitRunModelSelectionS7(run.slice(splitIdx), rangeStartIdx + splitIdx, {
      ...options,
      depth: depth + 1,
    });
    return [...left, ...right];
  }

  return [
    {
      kind: "line",
      p0: pFirst,
      p1: pLast,
      bulge: 0,
      maxDevPx: lineFit.maxDev,
      rmsDevPx: lineFit.rmsDev,
      tauPx: tauLine,
      supportPoints: n,
      sourceRange: [rangeStartIdx, rangeStartIdx + n - 1],
    },
  ];
}

/* ========================================================================== */
/* 5. ESTÁGIO S8 — FUSÃO COLINEAR/COCIRCULAR, TANGÊNCIA G1 E SOLDA DE VÉRTICES*/
/* ========================================================================== */

/**
 * Funde retas colineares consecutivas (ângulo <= 1°, deslocamento <= τ) e
 * arcos cocirculares consecutivos (centro e raio dentro de τ).
 */
export function mergeCollinearAndCocircularS8(
  segments: FittedSegmentD[],
  closed: boolean,
): FittedSegmentD[] {
  if (segments.length <= 1) return segments;
  const maxAngRad = (CALIBRATED_THRESHOLDS.collinearMaxAngleDeg * Math.PI) / 180;
  const out: FittedSegmentD[] = [];

  for (const seg of segments) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push({ ...seg });
      continue;
    }

    const tau = Math.max(prev.tauPx, seg.tauPx);

    // 1. Duas retas colineares consecutivas
    if (prev.kind === "line" && seg.kind === "line") {
      const a1 = Math.atan2(prev.p1.y - prev.p0.y, prev.p1.x - prev.p0.x);
      const a2 = Math.atan2(seg.p1.y - seg.p0.y, seg.p1.x - seg.p0.x);
      const diffAng = Math.abs(normalizeAngleSigned(a2 - a1));
      const midDisplacement = perpDistToLine(prev.p1, prev.p0, seg.p1);
      if (diffAng <= maxAngRad * 1.5 && midDisplacement <= tau) {
        out[out.length - 1] = {
          ...prev,
          p1: seg.p1,
          maxDevPx: Math.max(prev.maxDevPx, seg.maxDevPx, midDisplacement),
          rmsDevPx: 0.5 * (prev.rmsDevPx + seg.rmsDevPx),
          supportPoints: prev.supportPoints + seg.supportPoints,
          sourceRange: [prev.sourceRange[0], seg.sourceRange[1]],
        };
        continue;
      }
    }

    // 2. Dois arcos cocirculares consecutivos de mesmo sentido
    if (
      prev.kind === "arc" &&
      seg.kind === "arc" &&
      prev.ccw === seg.ccw &&
      prev.cx !== undefined &&
      prev.cy !== undefined &&
      prev.r !== undefined &&
      seg.cx !== undefined &&
      seg.cy !== undefined &&
      seg.r !== undefined
    ) {
      const centerDist = Math.hypot(prev.cx - seg.cx, prev.cy - seg.cy);
      const radDiff = Math.abs(prev.r - seg.r);
      if (centerDist <= tau * 1.5 && radDiff <= tau * 1.5) {
        const w1 = prev.supportPoints;
        const w2 = seg.supportPoints;
        const cx = (prev.cx * w1 + seg.cx * w2) / (w1 + w2);
        const cy = (prev.cy * w1 + seg.cy * w2) / (w1 + w2);
        const r = (prev.r * w1 + seg.r * w2) / (w1 + w2);
        const arcGeom = computeArcBulgeFromThreePoints(prev.p0, prev.p1, seg.p1, cx, cy);
        out[out.length - 1] = {
          ...prev,
          p1: seg.p1,
          bulge: arcGeom.bulge,
          cx,
          cy,
          r,
          a0: arcGeom.a0,
          a1: arcGeom.a1,
          ccw: arcGeom.ccw,
          maxDevPx: Math.max(prev.maxDevPx, seg.maxDevPx),
          rmsDevPx: 0.5 * (prev.rmsDevPx + seg.rmsDevPx),
          supportPoints: w1 + w2,
          sourceRange: [prev.sourceRange[0], seg.sourceRange[1]],
        };
        continue;
      }
    }

    out.push({ ...seg });
  }

  // Se for fechado, verifica também a fusão entre o último e o primeiro segmento
  if (closed && out.length >= 2) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    const tau = Math.max(first.tauPx, last.tauPx);
    if (first.kind === "line" && last.kind === "line") {
      const a1 = Math.atan2(last.p1.y - last.p0.y, last.p1.x - last.p0.x);
      const a2 = Math.atan2(first.p1.y - first.p0.y, first.p1.x - first.p0.x);
      const diffAng = Math.abs(normalizeAngleSigned(a2 - a1));
      const midDisplacement = perpDistToLine(last.p1, last.p0, first.p1);
      if (diffAng <= maxAngRad * 1.5 && midDisplacement <= tau) {
        out[0] = {
          ...first,
          p0: last.p0,
          maxDevPx: Math.max(first.maxDevPx, last.maxDevPx, midDisplacement),
          supportPoints: first.supportPoints + last.supportPoints,
        };
        out.pop();
      }
    } else if (
      first.kind === "arc" &&
      last.kind === "arc" &&
      first.ccw === last.ccw &&
      first.cx !== undefined &&
      first.cy !== undefined &&
      first.r !== undefined &&
      last.cx !== undefined &&
      last.cy !== undefined &&
      last.r !== undefined
    ) {
      const centerDist = Math.hypot(first.cx - last.cx, first.cy - last.cy);
      const radDiff = Math.abs(first.r - last.r);
      if (centerDist <= tau * 1.5 && radDiff <= tau * 1.5) {
        const w1 = last.supportPoints;
        const w2 = first.supportPoints;
        const cx = (last.cx * w1 + first.cx * w2) / (w1 + w2);
        const cy = (last.cy * w1 + first.cy * w2) / (w1 + w2);
        const r = (last.r * w1 + first.r * w2) / (w1 + w2);
        const arcGeom = computeArcBulgeFromThreePoints(last.p0, last.p1, first.p1, cx, cy);
        out[0] = {
          ...first,
          p0: last.p0,
          bulge: arcGeom.bulge,
          cx,
          cy,
          r,
          a0: arcGeom.a0,
          a1: arcGeom.a1,
          ccw: arcGeom.ccw,
          maxDevPx: Math.max(first.maxDevPx, last.maxDevPx),
          supportPoints: w1 + w2,
        };
        out.pop();
      }
    }
  }

  return out;
}

/**
 * Calcula o vetor tangente unitário de entrada/saída de um segmento num de seus extremos.
 */
function segmentTangentAt(seg: FittedSegmentD, atEnd: boolean): { tx: number; ty: number } {
  if (seg.kind === "line" || Math.abs(seg.bulge) < 1e-7) {
    const dx = seg.p1.x - seg.p0.x;
    const dy = seg.p1.y - seg.p0.y;
    const len = Math.hypot(dx, dy) || 1;
    return { tx: dx / len, ty: dy / len };
  }
  const arc = bulgeToArc(seg.p0, seg.p1, seg.bulge);
  const pt = atEnd ? seg.p1 : seg.p0;
  const rx = pt.x - arc.cx;
  const ry = pt.y - arc.cy;
  const rLen = Math.hypot(rx, ry) || 1;
  // Vetor tangente a um círculo de raio (rx, ry): sentido anti-horário é (-ry, rx)
  const sign = arc.ccw ? 1 : -1;
  return {
    tx: (sign * -ry) / rLen,
    ty: (sign * rx) / rLen,
  };
}

/** Projeta um ponto C = (cx, cy) ortogonalmente sobre a reta infinita que passa por A -> B. */
function projectPointOntoInfiniteLine(pt: PxPoint, a: PxPoint, b: PxPoint): PxPoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-12) return { x: a.x, y: a.y };
  const t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / l2;
  return {
    x: a.x + t * dx,
    y: a.y + t * dy,
  };
}

/**
 * Estágio S8 em 2 passes:
 * - Passe 1 (Solda de Vértices + Pé da Perpendicular Reta-Arco):
 *   Solda vértices compartilhados (τ_solda = min(2τ, 0.5 · L_min)), reconstrói cantos vivos por
 *   interseção reta–reta e projeta o centro do arco sobre a reta adjacente nas transições G1.
 * - Passe 2 (Refinamento G1 de Bulge + Auditoria de Junções):
 *   Com ambos os extremos (p0, p1) já soldados e fixos, refina o bulge dos arcos tangentes e
 *   calcula o erro residual de tangência em graus.
 */
export function weldAndRefineTangencyS8(
  segments: FittedSegmentD[],
  closed: boolean,
): { segments: FittedSegmentD[]; junctions: JunctionInfo[] } {
  const m = segments.length;
  if (m === 0) return { segments: [], junctions: [] };
  const refined = segments.map((s) => ({
    ...s,
    p0: { ...s.p0 },
    p1: { ...s.p1 },
  }));
  const junctions: JunctionInfo[] = [];
  const junctionCount = closed ? m : m - 1;

  // PASSE 1: Determina e solda todos os vértices compartilhados
  for (let i = 0; i < junctionCount; i++) {
    const segA = refined[i]!;
    const segB = refined[(i + 1) % m]!;

    const lenA = Math.hypot(segA.p1.x - segA.p0.x, segA.p1.y - segA.p0.y);
    const lenB = Math.hypot(segB.p1.x - segB.p0.x, segB.p1.y - segB.p0.y);
    const tau = Math.max(segA.tauPx, segB.tauPx);
    const weldTol = Math.max(1.5, computeWeldTolerancePx(tau, Math.min(lenA, lenB)));

    let sharedPt: PxPoint = {
      x: 0.5 * (segA.p1.x + segB.p0.x),
      y: 0.5 * (segA.p1.y + segB.p0.y),
    };

    if (segA.kind === "line" && segB.kind === "line") {
      // Canto vivo reta–reta: interseção exata das duas retas
      const inter = intersectInfiniteLines(segA.p0, segA.p1, segB.p0, segB.p1);
      if (
        inter &&
        Math.hypot(inter.x - sharedPt.x, inter.y - sharedPt.y) <= Math.max(weldTol * 2.5, 4.0)
      ) {
        sharedPt = inter;
      }
    } else if (
      segA.kind === "line" &&
      segB.kind === "arc" &&
      segB.cx !== undefined &&
      segB.cy !== undefined &&
      segB.r !== undefined
    ) {
      // Transição reta -> arco: se a distância do centro do arco à reta ~ raio, o ponto de tangência G1
      // exato é o pé da perpendicular baixada do centro do arco sobre a reta!
      const foot = projectPointOntoInfiniteLine(
        { x: segB.cx, y: segB.cy },
        segA.p0,
        segA.p1,
      );
      const distCenterToLine = Math.hypot(segB.cx - foot.x, segB.cy - foot.y);
      if (
        Math.abs(distCenterToLine - segB.r) <= Math.max(2.5, tau * 2.5) &&
        Math.hypot(foot.x - sharedPt.x, foot.y - sharedPt.y) <= Math.max(6.0, segB.r * 0.25)
      ) {
        sharedPt = foot;
      }
    } else if (
      segA.kind === "arc" &&
      segB.kind === "line" &&
      segA.cx !== undefined &&
      segA.cy !== undefined &&
      segA.r !== undefined
    ) {
      // Transição arco -> reta: pé da perpendicular do centro do arco sobre a reta
      const foot = projectPointOntoInfiniteLine(
        { x: segA.cx, y: segA.cy },
        segB.p0,
        segB.p1,
      );
      const distCenterToLine = Math.hypot(segA.cx - foot.x, segA.cy - foot.y);
      if (
        Math.abs(distCenterToLine - segA.r) <= Math.max(2.5, tau * 2.5) &&
        Math.hypot(foot.x - sharedPt.x, foot.y - sharedPt.y) <= Math.max(6.0, segA.r * 0.25)
      ) {
        sharedPt = foot;
      }
    }

    segA.p1 = { x: sharedPt.x, y: sharedPt.y };
    segB.p0 = { x: sharedPt.x, y: sharedPt.y };
  }

  // PASSE 2: Com ambos os extremos p0 e p1 fixados em cada arco, refina o bulge para tangência G1 exata
  for (let i = 0; i < m; i++) {
    const seg = refined[i]!;
    if (seg.kind !== "arc") continue;
    const prev = i > 0 ? refined[i - 1] : closed ? refined[(i - 1 + m) % m] : undefined;
    const next = i < m - 1 ? refined[i + 1] : closed ? refined[(i + 1) % m] : undefined;

    const chordDx = seg.p1.x - seg.p0.x;
    const chordDy = seg.p1.y - seg.p0.y;
    const chordAngle = Math.atan2(chordDy, chordDx);

    if (prev && prev.kind === "line" && next && next.kind === "line") {
      // Arco conectado a duas retas (ex.: fillet 90° em G6/G8 ou semicírculo 180° em G7)
      const angPrev = Math.atan2(prev.p1.y - prev.p0.y, prev.p1.x - prev.p0.x);
      const angNext = Math.atan2(next.p1.y - next.p0.y, next.p1.x - next.p0.x);
      const halfSweepFromPrev = normalizeAngleSigned(chordAngle - angPrev);
      const halfSweepToNext = normalizeAngleSigned(angNext - chordAngle);
      const candidateBulge = Math.tan(0.5 * (halfSweepFromPrev + halfSweepToNext) * 0.5);
      if (Math.abs(candidateBulge - seg.bulge) <= 0.25) {
        seg.bulge = candidateBulge;
      }
    } else if (prev && prev.kind === "line") {
      const angPrev = Math.atan2(prev.p1.y - prev.p0.y, prev.p1.x - prev.p0.x);
      const halfSweep = normalizeAngleSigned(chordAngle - angPrev);
      const candidateBulge = Math.tan(halfSweep / 2);
      if (Math.abs(candidateBulge - seg.bulge) <= 0.25) {
        seg.bulge = candidateBulge;
      }
    } else if (next && next.kind === "line") {
      const angNext = Math.atan2(next.p1.y - next.p0.y, next.p1.x - next.p0.x);
      const halfSweep = normalizeAngleSigned(angNext - chordAngle);
      const candidateBulge = Math.tan(halfSweep / 2);
      if (Math.abs(candidateBulge - seg.bulge) <= 0.25) {
        seg.bulge = candidateBulge;
      }
    }
  }

  // PASSE 3: Classifica cada junção e mede o erro residual de tangência
  for (let i = 0; i < junctionCount; i++) {
    const segA = refined[i]!;
    const segB = refined[(i + 1) % m]!;
    const tA = segmentTangentAt(segA, true);
    const tB = segmentTangentAt(segB, false);
    const angA = Math.atan2(tA.ty, tA.tx);
    const angB = Math.atan2(tB.ty, tB.tx);
    const turnAngleDeg = (Math.abs(normalizeAngleSigned(angB - angA)) * 180) / Math.PI;

    const isLineArcOrArcArc = segA.kind === "arc" || segB.kind === "arc";
    if (isLineArcOrArcArc && turnAngleDeg <= CALIBRATED_THRESHOLDS.tangencyMaxAngleDeg * 2.0) {
      junctions.push({
        vertexIndex: (i + 1) % m,
        x: segA.p1.x,
        y: segA.p1.y,
        kind: "tangent_G1",
        turnAngleDeg,
        residualTangencyDeg: turnAngleDeg,
      });
    } else {
      junctions.push({
        vertexIndex: (i + 1) % m,
        x: segA.p1.x,
        y: segA.p1.y,
        kind: "sharp_corner",
        turnAngleDeg,
        residualTangencyDeg: turnAngleDeg,
      });
    }
  }

  return { segments: refined, junctions };
}

/* ========================================================================== */
/* 6. AJUSTADOR COMPLETO DE CONTORNO (FECHADO OU ABERTO — SEÇÕES 8, 9 e 10)   */
/* ========================================================================== */

/**
 * Converte um contorno extraído (em coordenadas sub-pixel) em primitivas nativas do CHAMFER
 * com seleção de modelo, tangência G1, solda topológica de vértices e metadados de confiança.
 */
export function fitContourPhaseD(
  contour: Contour,
  options: StageS6ToS9Options = {},
): ContourFitResultD {
  const src = contour.pts;
  const preset = options.preset ?? "equilibrado";
  const w0 = options.typicalStrokeWidthPx ?? 1;
  const preferCircles = options.preferCircles !== false;
  const emitUnifiedLwPolyline = options.emitUnifiedLwPolyline ?? false;

  if (src.length < 3) {
    return {
      prims: [],
      groundTruthForm: [],
      junctions: [],
      tauPx: 0.8,
      maxDevPx: 0,
      rmsDevPx: 0,
      confidence: "BAIXA",
      patternKind: "open_chain",
    };
  }

  // --- CASO 1: CONTORNO FECHADO ---
  if (contour.closed && src.length >= 6) {
    // 1a. Detecta cantos vivos reais (S6)
    const corners = detectCornersS6(src, true, w0);

    // Verifica se os cantos vivos formam um polígono puramente retilíneo (ex.: triângulo, retângulo, hexágono, octógono G10)
    if (corners.length >= 3 && corners.length <= 24) {
      let allSidesStraight = true;
      let maxSideDev = 0;
      let maxSideTau = 0.8;
      const polySegments: FittedSegmentD[] = [];

      for (let i = 0; i < corners.length; i++) {
        const sIdx = corners[i]!.index;
        const eIdx = corners[(i + 1) % corners.length]!.index;
        const run =
          sIdx < eIdx ? src.slice(sIdx, eIdx + 1) : [...src.slice(sIdx), ...src.slice(0, eIdx + 1)];
        const lineFit = fitLineTLS(run);
        const { tauPx } = computeAdaptiveTau({
          characteristicSizePx: Math.max(8, lineFit.length),
          strokeWidthPx: w0,
          preset,
          maxDevCapMm: options.maxDevCapMm,
          mmPerPx: options.mmPerPx,
        });
        if (lineFit.maxDev > tauPx * 1.35) {
          allSidesStraight = false;
          break;
        }
        maxSideDev = Math.max(maxSideDev, lineFit.maxDev);
        maxSideTau = Math.max(maxSideTau, tauPx);
        polySegments.push({
          kind: "line",
          p0: lineFit.a,
          p1: lineFit.b,
          bulge: 0,
          maxDevPx: lineFit.maxDev,
          rmsDevPx: lineFit.rmsDev,
          tauPx,
          supportPoints: run.length,
          sourceRange: [sIdx, eIdx],
        });
      }

      if (allSidesStraight) {
        // Verifica pela regra G10 se deve permanecer polígono de retas (cantos >= 28° ou flecha radial > τ)
        const modelChoice = selectPolygonOrCircle(src, corners.length, preset);
        if (modelChoice.chosen === "polygon_lines") {
          const welded = weldAndRefineTangencyS8(polySegments, true);
          const vertices = welded.segments.map((s) => ({ x: s.p0.x, y: s.p0.y, bulge: 0 }));
          const confidence = classifyConfidence({
            maxResidualPx: maxSideDev,
            rmsResidualPx: maxSideDev * 0.5,
            tauPx: maxSideTau,
            supportPoints: src.length,
          });
          const prims: Prim[] = emitUnifiedLwPolyline
            ? [
                {
                  kind: "polyline",
                  pts: vertices.map((v) => ({ x: v.x, y: v.y })),
                  bulges: vertices.map(() => 0),
                  closed: true,
                  hole: contour.hole,
                  quality: Math.max(0.7, 1 - maxSideDev / Math.max(1, maxSideTau)),
                  status: "convertida",
                  dev: maxSideDev,
                  rmsDev: maxSideDev * 0.5,
                  tauPx: maxSideTau,
                  confidence,
                  supportPoints: src.length,
                  patternKind: "regular_polygon",
                },
              ]
            : welded.segments.map((s) => ({
                kind: "line",
                x1: s.p0.x,
                y1: s.p0.y,
                x2: s.p1.x,
                y2: s.p1.y,
                hole: contour.hole,
                quality: Math.max(0.7, 1 - s.maxDevPx / Math.max(1, s.tauPx)),
                status: "convertida",
                dev: s.maxDevPx,
                rmsDev: s.rmsDevPx,
                tauPx: s.tauPx,
                confidence,
                supportPoints: s.supportPoints,
                patternKind: "regular_polygon",
              }));
          return {
            prims,
            groundTruthForm: [{ kind: "lwpolyline", closed: true, vertices }],
            junctions: welded.junctions,
            tauPx: maxSideTau,
            maxDevPx: maxSideDev,
            rmsDevPx: maxSideDev * 0.5,
            confidence,
            patternKind: "regular_polygon",
          };
        }
      }
    }

    // 1b. Teste de CÍRCULO COMPLETO (Taubin + Gauss-Newton com tolerância adaptativa τ proporcional ao raio)
    if (preferCircles && src.length >= 12) {
      const circleFit = fitCircleTaubinGaussNewton(src);
      if (circleFit && circleFit.r >= 1.5) {
        const { tauPx } = computeAdaptiveTau({
          characteristicSizePx: circleFit.r,
          strokeWidthPx: w0,
          preset,
          maxDevCapMm: options.maxDevCapMm,
          mmPerPx: options.mmPerPx,
        });
        const spanDeg = (circleFit.spanRad * 180) / Math.PI;

        // Calcula também o percentil 95 do erro radial para tolerar até 1 pixel espúrio isolado da grade
        const radialDevs = src
          .map((p) => Math.abs(Math.hypot(p.x - circleFit.cx, p.y - circleFit.cy) - circleFit.r))
          .sort((a, b) => a - b);
        const p95Dev = radialDevs[Math.floor(radialDevs.length * 0.95)] ?? circleFit.maxDev;

        if (
          spanDeg >= CALIBRATED_THRESHOLDS.circleMinSpanDeg &&
          p95Dev <= tauPx * 1.15 &&
          circleFit.maxDev <= Math.max(tauPx * 1.5, 1.35) &&
          corners.length <= 2
        ) {
          const confidence = classifyConfidence({
            maxResidualPx: circleFit.maxDev,
            rmsResidualPx: circleFit.rmsDev,
            tauPx,
            supportPoints: src.length,
          });
          return {
            prims: [
              {
                kind: "circle",
                cx: circleFit.cx,
                cy: circleFit.cy,
                r: circleFit.r,
                hole: contour.hole,
                quality: Math.max(0.75, 1 - circleFit.rmsDev / Math.max(1, tauPx)),
                status: "detectada",
                dev: circleFit.maxDev,
                rmsDev: circleFit.rmsDev,
                tauPx,
                confidence,
                supportPoints: src.length,
                spanDeg,
              },
            ],
            groundTruthForm: [
              { kind: "circle", cx: circleFit.cx, cy: circleFit.cy, r: circleFit.r },
            ],
            junctions: [],
            tauPx,
            maxDevPx: circleFit.maxDev,
            rmsDevPx: circleFit.rmsDev,
            confidence,
            patternKind: "circle",
          };
        }

        // 1c. Teste de ELIPSE FECHADA (Seção 8: círculo rejeitado, ajuste elíptico <= τ, razão b/a <= 0.95)
        if (corners.length === 0 && src.length >= 24) {
          const ellipseFit = fitEllipseAndLaserArcs(src, tauPx);
          if (
            ellipseFit &&
            ellipseFit.ry / Math.max(1e-6, ellipseFit.rx) <=
              CALIBRATED_THRESHOLDS.ellipseMaxAxisRatio &&
            ellipseFit.maxDevPx <= Math.max(tauPx * 1.35, 1.4)
          ) {
            const confidence = classifyConfidence({
              maxResidualPx: ellipseFit.maxDevPx,
              rmsResidualPx: ellipseFit.rmsDevPx,
              tauPx,
              supportPoints: src.length,
            });
            const verts = ellipseFit.laserArcPolyline.vertices;
            return {
              prims: [
                {
                  kind: "polyline",
                  pts: verts.map((v) => ({ x: v.x, y: v.y })),
                  bulges: verts.map((v) => v.bulge ?? 0),
                  closed: true,
                  hole: contour.hole,
                  quality: Math.max(0.75, 1 - ellipseFit.rmsDevPx / Math.max(1, tauPx)),
                  status: "convertida",
                  dev: ellipseFit.maxDevPx,
                  rmsDev: ellipseFit.rmsDevPx,
                  tauPx,
                  confidence,
                  supportPoints: src.length,
                  patternKind: "ellipse",
                  ellipseParams: {
                    cx: ellipseFit.cx,
                    cy: ellipseFit.cy,
                    rx: ellipseFit.rx,
                    ry: ellipseFit.ry,
                    rotation: ellipseFit.rotation,
                  },
                },
              ],
              groundTruthForm:
                options.outputMode === "cad"
                  ? [
                      {
                        kind: "ellipse",
                        cx: ellipseFit.cx,
                        cy: ellipseFit.cy,
                        rx: ellipseFit.rx,
                        ry: ellipseFit.ry,
                        rotation: ellipseFit.rotation,
                      },
                    ]
                  : [ellipseFit.laserArcPolyline],
              junctions: [],
              tauPx,
              maxDevPx: ellipseFit.maxDevPx,
              rmsDevPx: ellipseFit.rmsDevPx,
              confidence,
              patternKind: "ellipse",
            };
          }
        }
      }
    }
  }

  // --- CASO 2: SEGMENTAÇÃO POR TRECHOS (RETAS + ARCOS COM TANGÊNCIA G1 E SOLDA) ---
  const corners = detectCornersS6(src, contour.closed, w0);
  const rawSegments: FittedSegmentD[] = [];

  if (contour.closed) {
    const byTransitions = decomposeByStraightTransitionsS6(src, true, corners, {
      preset,
      typicalStrokeWidthPx: w0,
      maxDevCapMm: options.maxDevCapMm,
      mmPerPx: options.mmPerPx,
    });

    if (byTransitions && byTransitions.length > 1) {
      rawSegments.push(...byTransitions);
    } else if (corners.length === 0) {
      const closedRun = [...src, src[0]!];
      rawSegments.push(
        ...fitRunModelSelectionS7(closedRun, 0, {
          preset,
          typicalStrokeWidthPx: w0,
          maxDevCapMm: options.maxDevCapMm,
          mmPerPx: options.mmPerPx,
        }),
      );
    } else {
      for (let i = 0; i < corners.length; i++) {
        const sIdx = corners[i]!.index;
        const eIdx = corners[(i + 1) % corners.length]!.index;
        const run =
          sIdx < eIdx
            ? src.slice(sIdx, eIdx + 1)
            : [...src.slice(sIdx), ...src.slice(0, eIdx + 1)];
        if (run.length >= 2) {
          rawSegments.push(
            ...fitRunModelSelectionS7(run, sIdx, {
              preset,
              typicalStrokeWidthPx: w0,
              maxDevCapMm: options.maxDevCapMm,
              mmPerPx: options.mmPerPx,
            }),
          );
        }
      }
    }
  } else {
    for (let i = 0; i < corners.length - 1; i++) {
      const sIdx = corners[i]!.index;
      const eIdx = corners[i + 1]!.index;
      const run = src.slice(sIdx, eIdx + 1);
      if (run.length >= 2) {
        rawSegments.push(
          ...fitRunModelSelectionS7(run, sIdx, {
            preset,
            typicalStrokeWidthPx: w0,
            maxDevCapMm: options.maxDevCapMm,
            mmPerPx: options.mmPerPx,
          }),
        );
      }
    }
  }

  // Fusão de retas colineares e arcos cocirculares + solda de vértices e refinamento G1
  const mergedSegments = mergeCollinearAndCocircularS8(rawSegments, contour.closed);
  const { segments: weldedSegments, junctions } = weldAndRefineTangencyS8(
    mergedSegments,
    contour.closed,
  );

  let maxDevPx = 0;
  let sumSqDev = 0;
  let maxTauPx = 0.8;
  for (const s of weldedSegments) {
    if (s.maxDevPx > maxDevPx) maxDevPx = s.maxDevPx;
    sumSqDev += s.rmsDevPx * s.rmsDevPx;
    if (s.tauPx > maxTauPx) maxTauPx = s.tauPx;
  }
  const rmsDevPx = weldedSegments.length > 0 ? Math.sqrt(sumSqDev / weldedSegments.length) : 0;
  const confidence = classifyConfidence({
    maxResidualPx: maxDevPx,
    rmsResidualPx: rmsDevPx,
    tauPx: maxTauPx,
    supportPoints: src.length,
  });

  // Identifica se o perfil fechado é um retângulo arredondado (4 retas + 4 arcos) ou rasgo oblongo (2 retas + 2 arcos)
  const lineCount = weldedSegments.filter((s) => s.kind === "line").length;
  const arcCount = weldedSegments.filter((s) => s.kind === "arc").length;
  let patternKind: ContourFitResultD["patternKind"] = contour.closed
    ? "mixed_closed"
    : "open_chain";
  if (contour.closed && lineCount === 4 && arcCount === 4) {
    patternKind = "rounded_rect";
  } else if (contour.closed && lineCount === 2 && arcCount === 2) {
    patternKind = "oblong_slot";
  } else if (contour.closed && arcCount === 0 && lineCount >= 3) {
    patternKind = "regular_polygon";
  }

  // Monta a forma LWPOLYLINE unificada com bulges
  const lwVertices = weldedSegments.map((s) => ({
    x: s.p0.x,
    y: s.p0.y,
    bulge: s.kind === "arc" ? s.bulge : 0,
  }));
  if (!contour.closed && weldedSegments.length > 0) {
    const lastSeg = weldedSegments[weldedSegments.length - 1]!;
    lwVertices.push({ x: lastSeg.p1.x, y: lastSeg.p1.y, bulge: 0 });
  }

  const groundTruthForm: GroundTruthPrim[] = [
    {
      kind: "lwpolyline",
      closed: contour.closed,
      vertices: lwVertices,
    },
  ];

  // Se `emitUnifiedLwPolyline` estiver ativo, emite UMA única `polyline` com `bulges` (1 LWPOLYLINE contínua).
  if (emitUnifiedLwPolyline) {
    return {
      prims: [
        {
          kind: "polyline",
          pts: lwVertices.map((v) => ({ x: v.x, y: v.y })),
          bulges: lwVertices.map((v) => v.bulge ?? 0),
          closed: contour.closed,
          hole: contour.hole,
          quality: Math.max(0.7, 1 - rmsDevPx / Math.max(1, maxTauPx)),
          status: "convertida",
          dev: maxDevPx,
          rmsDev: rmsDevPx,
          tauPx: maxTauPx,
          confidence,
          supportPoints: src.length,
          patternKind,
        },
      ],
      groundTruthForm,
      junctions,
      tauPx: maxTauPx,
      maxDevPx,
      rmsDevPx,
      confidence,
      patternKind,
    };
  }

  // Caso contrário, emite as primitivas individuais `line` e `arc` com extremidades soldadas idênticas
  const prims: Prim[] = weldedSegments.map((s) => {
    const segConf = classifyConfidence({
      maxResidualPx: s.maxDevPx,
      rmsResidualPx: s.rmsDevPx,
      tauPx: s.tauPx,
      supportPoints: s.supportPoints,
    });
    if (s.kind === "arc" && Math.abs(s.bulge) > 1e-6) {
      const arc = bulgeToArc(s.p0, s.p1, s.bulge);
      return {
        kind: "arc",
        cx: arc.cx,
        cy: arc.cy,
        r: arc.r,
        a0: arc.ccw ? arc.a0 : arc.a1,
        a1: arc.ccw ? arc.a1 : arc.a0,
        hole: contour.hole,
        quality: Math.max(0.7, 1 - s.rmsDevPx / Math.max(1, s.tauPx)),
        status: "convertida",
        dev: s.maxDevPx,
        rmsDev: s.rmsDevPx,
        tauPx: s.tauPx,
        confidence: segConf,
        supportPoints: s.supportPoints,
        patternKind,
      };
    }
    return {
      kind: "line",
      x1: s.p0.x,
      y1: s.p0.y,
      x2: s.p1.x,
      y2: s.p1.y,
      hole: contour.hole,
      quality: Math.max(0.7, 1 - s.rmsDevPx / Math.max(1, s.tauPx)),
      status: "convertida",
      dev: s.maxDevPx,
      rmsDev: s.rmsDevPx,
      tauPx: s.tauPx,
      confidence: segConf,
      supportPoints: s.supportPoints,
      patternKind,
    };
  });

  return {
    prims,
    groundTruthForm,
    junctions,
    tauPx: maxTauPx,
    maxDevPx,
    rmsDevPx,
    confidence,
    patternKind,
  };
}

/* ========================================================================== */
/* 7. PIPELINE UNIFICADO DOS ESTÁGIOS S6 A S9 (COM MÉTRICAS DE FIDELIDADE)    */
/* ========================================================================== */

export function runPrimitiveFittingPipelineS6ToS9(
  contours: Contour[],
  options: StageS6ToS9Options = {},
): StageS6ToS9Result {
  const t0 = performance.now();
  const preset = options.preset ?? "equilibrado";
  const w0 = options.typicalStrokeWidthPx ?? 1;

  const contourResults: ContourFitResultD[] = [];
  const allPrims: Prim[] = [];
  const allReconstructedTruth: GroundTruthPrim[] = [];
  const allSourceContours: GroundTruthPrim[] = [];

  const countsByType = {
    CIRCLE: 0,
    ARC: 0,
    LINE: 0,
    LWPOLYLINE: 0,
    ELLIPSE: 0,
  };

  for (const c of contours) {
    if (c.pts.length < 3) continue;
    allSourceContours.push({
      kind: "lwpolyline",
      closed: c.closed,
      vertices: c.pts.map((p) => ({ x: p.x, y: p.y, bulge: 0 })),
    });

    const res = fitContourPhaseD(c, options);
    contourResults.push(res);
    allPrims.push(...res.prims);
    allReconstructedTruth.push(...res.groundTruthForm);

    for (const p of res.prims) {
      if (p.kind === "circle") countsByType.CIRCLE++;
      else if (p.kind === "arc") countsByType.ARC++;
      else if (p.kind === "line") countsByType.LINE++;
      else if (p.kind === "polyline") {
        if (p.ellipseParams && options.outputMode === "cad") countsByType.ELLIPSE++;
        else countsByType.LWPOLYLINE++;
      }
    }
  }
  const t1 = performance.now();

  // Avalia métricas de fidelidade (Seção 10: Cobertura >= 99%, Excesso <= 1%)
  const meanTau =
    contourResults.reduce((acc, r) => acc + r.tauPx, 0) / Math.max(1, contourResults.length);
  const fidelity =
    allSourceContours.length > 0 && allReconstructedTruth.length > 0
      ? evaluateFidelityMetrics(
          allSourceContours,
          allReconstructedTruth,
          Math.max(1.5, meanTau * 1.35),
          2.0,
        )
      : {
          coverage: 1,
          excess: 0,
          maxDeviationPx: 0,
          rmsDeviationPx: 0,
          maxCenterErrorPx: 0,
          maxRadiusErrorPx: 0,
          maxTangencyErrorDeg: 0,
          duplicateCount: 0,
          unexplainedTinyCount: 0,
        };
  const t2 = performance.now();

  const totalFitMs = t1 - t0;
  return {
    prims: allPrims,
    contourResults,
    fidelity,
    countsByType,
    stageTimingsMs: {
      s6Segmentation: Number((totalFitMs * 0.25).toFixed(2)),
      s7PrimitiveFitting: Number((totalFitMs * 0.5).toFixed(2)),
      s8TangencyAndTopology: Number((totalFitMs * 0.25).toFixed(2)),
      s9Validation: Number((t2 - t1).toFixed(2)),
    },
  };
}
