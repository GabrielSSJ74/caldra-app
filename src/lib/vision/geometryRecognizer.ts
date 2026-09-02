/**
 * geometryRecognizer — etapa 3 da pipeline CHAMFER VISION.
 *
 * Converte contornos de pixels em primitivas geométricas reais:
 * CIRCLE, ARC, LINE e POLYLINE. Nada aqui depende do React nem do CHAMFER.
 */

import type { Contour, PxPoint } from "./visionEngine";

export type Prim =
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
  | { kind: "polyline"; pts: PxPoint[]; closed: boolean; hole: boolean; quality: number };

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

/** Ajuste de círculo por mínimos quadrados (Kåsa). */
export function fitCircle(pts: PxPoint[]) {
  const n = pts.length;
  if (n < 5) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxxx = 0, syyy = 0, sxyy = 0, sxxy = 0;
  for (const p of pts) {
    const { x, y } = p;
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    sxxx += x * x * x; syyy += y * y * y; sxyy += x * y * y; sxxy += x * x * y;
  }
  const C = n * sxx - sx * sx;
  const D = n * sxy - sx * sy;
  const E = n * sxxx + n * sxyy - (sxx + syy) * sx;
  const G = n * syy - sy * sy;
  const H = n * sxxy + n * syyy - (sxx + syy) * sy;
  const den = 2 * (C * G - D * D);
  if (Math.abs(den) < 1e-9) return null;
  const cx = (E * G - D * H) / den;
  const cy = (C * H - D * E) / den;
  let r = 0;
  for (const p of pts) r += Math.hypot(p.x - cx, p.y - cy);
  r /= n;
  let err = 0;
  for (const p of pts) err += Math.abs(Math.hypot(p.x - cx, p.y - cy) - r);
  return { cx, cy, r, rms: err / n };
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
    return { kind: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y, hole, quality: 1 - maxDev / (tolPx || 1) };

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

/** Divide o contorno simplificado em trechos homogêneos (retas x curvas). */
function splitRuns(pts: PxPoint[], closed: boolean, tolPx: number): PxPoint[][] {
  const runs: PxPoint[][] = [];
  const n = pts.length;
  if (n < 3) return [pts];
  let current: PxPoint[] = [pts[0]!];
  for (let i = 1; i < n; i++) {
    const p = pts[i]!;
    current.push(p);
    if (current.length >= 3) {
      const a = current[0]!;
      const mid = current[Math.floor(current.length / 2)]!;
      const straightNow = perpDistance(mid, a, p) <= tolPx;
      const next = pts[i + 1];
      if (next) {
        const wouldBend = perpDistance(p, current[current.length - 2]!, next) > tolPx * 2.5;
        if (straightNow && wouldBend) {
          runs.push(current);
          current = [p];
        }
      }
    }
  }
  if (current.length > 1) runs.push(current);
  if (closed && runs.length > 1) {
    const last = runs[runs.length - 1]!;
    if (d2(last[last.length - 1]!, pts[0]!) > 1) last.push(pts[0]!);
  }
  return runs;
}

export type RecognizeOptions = {
  tolerance: Tolerance;
  /** Diagonal da imagem em px — escala a tolerância relativa. */
  diagonalPx: number;
  /** Prioriza círculos completos (furos, flanges). */
  preferCircles?: boolean;
};

/** Converte um contorno em uma ou mais primitivas geométricas. */
export function recognizeContour(c: Contour, opt: RecognizeOptions): Prim[] {
  const tolPx = Math.max(0.8, TOLERANCE_FACTOR[opt.tolerance] * opt.diagonalPx);

  // 1) círculo completo tem prioridade absoluta
  if (opt.preferCircles !== false && c.pts.length >= 20) {
    const fit = fitCircle(c.pts);
    if (fit) {
      const { span } = angularSpan(c.pts, fit.cx, fit.cy);
      const roundness = fit.rms / Math.max(fit.r, 1);
      if (span > 5.9 && roundness < 0.06 && fit.rms < tolPx * 2)
        return [
          {
            kind: "circle",
            cx: fit.cx,
            cy: fit.cy,
            r: fit.r,
            hole: c.hole,
            quality: Math.max(0, 1 - roundness / 0.06),
          },
        ];
    }
  }

  // 2) simplificação e divisão em trechos
  const simple = simplify(c.pts, tolPx);
  if (simple.length < 3)
    return [
      {
        kind: "line",
        x1: simple[0]?.x ?? 0,
        y1: simple[0]?.y ?? 0,
        x2: simple[simple.length - 1]?.x ?? 0,
        y2: simple[simple.length - 1]?.y ?? 0,
        hole: c.hole,
        quality: 0.5,
      },
    ];

  const runs = splitRuns(simple, c.closed, tolPx);
  const prims = runs.map((r) => recognizeRun(r, tolPx, c.hole));

  // 3) contorno inteiramente poligonal vira uma única polilinha fechada
  if (c.closed && prims.every((p) => p.kind === "line") && prims.length > 2) {
    return [{ kind: "polyline", pts: simple, closed: true, hole: c.hole, quality: 0.9 }];
  }
  return prims;
}
