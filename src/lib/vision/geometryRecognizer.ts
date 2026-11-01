/**
 * geometryRecognizer — etapa 3 da pipeline CHAMFER VISION.
 *
 * Converte contornos de pixels em primitivas geométricas reais:
 * CIRCLE, ARC, LINE e POLYLINE. Nada aqui depende do React nem do CHAMFER.
 */

import type { Contour, PxPoint } from "./visionEngine";
import type { ConfidenceLevel } from "./visionThresholdConfig";
import { fitCircleTaubinGaussNewton } from "./visionMetricsAndHarness";

/** Confiança da primitiva: detectada direto, ajustada ou aproximada. */
export type PrimStatus = "detectada" | "convertida" | "aproximada";

/** Metadados de qualidade, proveniência e confiança (Seções 8, 9 e 10). */
export type PrimMeta = {
  status?: PrimStatus;
  /** Desvio máximo medido em relação aos pontos sub-pixel originais (px). */
  dev?: number;
  /** Desvio RMS medido (px). */
  rmsDev?: number;
  /** Tolerância adaptativa τ usada no ajuste (px). */
  tauPx?: number;
  /** Nível de confiança da reconstrução (ALTA / MEDIA / BAIXA). */
  confidence?: ConfidenceLevel;
  /** Número de pontos de suporte no contorno original. */
  supportPoints?: number;
  /** Cobertura angular em graus (para círculos e arcos). */
  spanDeg?: number;
  /** Padrão geométrico reconhecido. */
  patternKind?:
    | "circle"
    | "ellipse"
    | "regular_polygon"
    | "rounded_rect"
    | "oblong_slot"
    | "mixed_closed"
    | "open_chain";
  /** Parâmetros analíticos de elipse quando o contorno fechado é uma elipse (modo CAD vs Laser). */
  ellipseParams?: {
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    rotation: number;
  };
};

export type Prim = (
  | { kind: "circle"; cx: number; cy: number; r: number; hole: boolean; quality: number }
  | {
      kind: "arc";
      cx: number;
      cy: number;
      r: number;
      a0: number;
      a1: number;
      hole: boolean;
      quality: number;
    }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; hole: boolean; quality: number }
  | {
      kind: "polyline";
      pts: PxPoint[];
      /** Bulge opcional por vértice: tan(Δθ/4) para o segmento i -> i+1 (grupo 42 da LWPOLYLINE). */
      bulges?: number[];
      closed: boolean;
      hole: boolean;
      quality: number;
    }
) &
  PrimMeta;

export type Tolerance = "baixa" | "media" | "alta";

/** Fator de simplificação (px) por nível de tolerância, relativo ao tamanho. */
export const TOLERANCE_FACTOR: Record<Tolerance, number> = {
  baixa: 0.0025,
  media: 0.006,
  alta: 0.014,
};

/* ------------------------------------------------------------ utilidades */

const d2 = (a: PxPoint, b: PxPoint) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

function perpDistance(p: PxPoint, a: PxPoint, b: PxPoint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.sqrt(d2(p, a));
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Ramer–Douglas–Peucker. */
export function simplify(pts: PxPoint[], tol: number): PxPoint[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const dd = perpDistance(pts[i]!, pts[s]!, pts[e]!);
      if (dd > maxD) {
        maxD = dd;
        idx = i;
      }
    }
    if (idx > 0 && maxD > tol) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Mesma simplificação, devolvendo os ÍNDICES mantidos no contorno original. */
export function simplifyIndices(pts: PxPoint[], tol: number): number[] {
  if (pts.length < 3) return pts.map((_, i) => i);
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const dd = perpDistance(pts[i]!, pts[s]!, pts[e]!);
      if (dd > maxD) {
        maxD = dd;
        idx = i;
      }
    }
    if (idx > 0 && maxD > tol) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(i);
  return out;
}

/** Ajuste de círculo sem viés para arcos parciais (Taubin + refino ortogonal de Gauss–Newton). */
export function fitCircle(pts: PxPoint[]) {
  const fit = fitCircleTaubinGaussNewton(pts);
  if (!fit) return null;
  return { cx: fit.cx, cy: fit.cy, r: fit.r, rms: fit.rmsDev, maxDev: fit.maxDev };
}

/** Cobertura angular dos pontos em torno de um centro (rad). */
function angularSpan(pts: PxPoint[], cx: number, cy: number) {
  const angs = pts.map((p) => Math.atan2(p.y - cy, p.x - cx)).sort((a, b) => a - b);
  let maxGap = angs[0]! + 2 * Math.PI - angs[angs.length - 1]!;
  let gapAt = angs.length - 1;
  for (let i = 1; i < angs.length; i++) {
    const g = angs[i]! - angs[i - 1]!;
    if (g > maxGap) {
      maxGap = g;
      gapAt = i - 1;
    }
  }
  return {
    span: 2 * Math.PI - maxGap,
    a0: angs[(gapAt + 1) % angs.length]!,
    a1: angs[gapAt]!,
  };
}

/* ------------------------------------------------- reconhecimento por trecho */

function recognizeRun(run: PxPoint[], tolPx: number, hole: boolean): Prim {
  const a = run[0]!;
  const b = run[run.length - 1]!;

  // reta?
  let maxDev = 0;
  for (const p of run) maxDev = Math.max(maxDev, perpDistance(p, a, b));
  if (maxDev <= tolPx)
    return {
      kind: "line",
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      hole,
      quality: 1 - maxDev / (tolPx || 1),
    };

  // arco?
  const fit = fitCircle(run);
  if (fit && fit.rms <= tolPx * 1.2 && fit.r > tolPx * 2 && fit.r < 1e6) {
    const { span, a0, a1 } = angularSpan(run, fit.cx, fit.cy);
    if (span > 0.15) {
      return {
        kind: "arc",
        cx: fit.cx,
        cy: fit.cy,
        r: fit.r,
        a0,
        a1,
        hole,
        quality: Math.max(0, 1 - fit.rms / (tolPx * 1.2)),
      };
    }
  }

  return { kind: "polyline", pts: run, closed: false, hole, quality: 0.6 };
}

export type RecognizeOptions = {
  tolerance: Tolerance;
  /** Diagonal da imagem em px — escala a tolerância relativa. */
  diagonalPx: number;
  /** Prioriza círculos completos (furos, flanges). */
  preferCircles?: boolean;
};

/** Flecha (sagitta) máxima de um trecho em relação à sua corda. */
function sagitta(pts: PxPoint[]) {
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  let m = 0;
  for (const p of pts) m = Math.max(m, perpDistance(p, a, b));
  return m;
}

import { constructShapeFromContour } from "./shapeConstructorEngine";

/** Converte um contorno em uma ou mais primitivas geométricas nativas (CIRCLE, ARC, LINE). */
export function recognizeContour(c: Contour, _opt?: RecognizeOptions): Prim[] {
  if (!c.pts || c.pts.length < 2) return [];
  const fitted = constructShapeFromContour(c);
  if (fitted.length > 0) return fitted;
  const a = c.pts[0]!;
  const b = c.pts[c.pts.length - 1]!;
  return [{ kind: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y, hole: c.hole, quality: 0.5 }];
}

