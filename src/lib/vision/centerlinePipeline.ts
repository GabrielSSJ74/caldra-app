/**
 * centerlinePipeline — MODO TRAÇADO do CHAMFER VISION.
 *
 * Foto de traçado à mão → linhas CENTRAIS (nunca dois contornos paralelos)
 * → primitivas reais (LINE / ARC / CIRCLE / POLYLINE) em pixels.
 * A conversão para mm continua a cargo do `toEntities` da Entrega 1.
 */

import { gaussianBlur, rasterize, type PreprocessOptions } from "./imagePreprocessor";
import {
  adaptiveBinarize,
  pruneChains,
  snapChainEnds,
  traceSkeleton,
  type Chain,
} from "./skeletonizer";
import { type Prim, type Tolerance } from "./geometryRecognizer";
import type { PxPoint } from "./visionEngine";
import type { VisionAnalysis } from "./vectorizer";
import {
  WORK_MAX_DIM,
  closeMicroNoiseHoles,
  constructShapeFromContour,
  normalizeToWorkingGrid,
  zhangSuenThinning,
} from "./shapeConstructorEngine";

export type CenterlineOptions = PreprocessOptions & {
  brightness: number;
  contrast: number;
  /** Constante do limiar adaptativo. */
  bias: number;
  /** Comprimento mínimo de um traço, em % da diagonal. */
  minBranchPct: number;
  /** Tolerância de fechamento de vãos, em % da diagonal. */
  gapPct: number;
  tolerance: Tolerance;
  blur: number;
  invert: boolean;
};

export const DEFAULT_CENTERLINE: CenterlineOptions = {
  brightness: 0,
  contrast: 20,
  bias: 10,
  minBranchPct: 1.5,
  gapPct: 1,
  tolerance: "media",
  blur: 1,
  invert: false,
  maxSize: WORK_MAX_DIM,
};

export type CenterlineStats = {
  strokes: number;
  lines: number;
  arcs: number;
  circles: number;
  polylines: number;
};

export type CenterlineAnalysis = VisionAnalysis & { centerline: CenterlineStats };

export function analyzeCenterline(
  img: HTMLImageElement,
  opt: CenterlineOptions,
): CenterlineAnalysis {
  const { pixels } = rasterize(img, opt);
  return analyzeCenterlineRaster(pixels, opt);
}

/** Mesma análise a partir de pixels já rasterizados — usada no Web Worker. */
export function analyzeCenterlineRaster(
  input: ImageData,
  opt: CenterlineOptions,
  onProgress?: (stage: string, pct: number) => void,
): CenterlineAnalysis {
  const origWidth = input.width;
  const origHeight = input.height;
  onProgress?.("Binarizando", 12);

  // MOTOR 1: Normalização da Grade de Trabalho (WORK_MAX_DIM = 900px)
  const normGrid = normalizeToWorkingGrid(input, WORK_MAX_DIM);
  const workInput = normGrid.image ?? input;
  const scaleToWorld = normGrid.scaleToWorld;

  const pixels = opt.blur > 0 ? gaussianBlur(workInput, opt.blur) : workInput;
  const rawBin = adaptiveBinarize(pixels, {
    brightness: opt.brightness,
    contrast: opt.contrast,
    bias: opt.bias,
    invert: opt.invert,
  });
  const bin = closeMicroNoiseHoles(rawBin, 4);
  onProgress?.("Esqueletizando", 45);

  const skel = zhangSuenThinning(bin, 3);
  const diagonalPx = Math.hypot(workInput.width, workInput.height);
  const raw = traceSkeleton(skel);
  const pruned = pruneChains(raw, (opt.minBranchPct / 100) * diagonalPx);
  const chains: Chain[] = snapChainEnds(pruned, (opt.gapPct / 100) * diagonalPx);

  onProgress?.("Reconhecendo geometria", 75);
  const prims: Prim[] = [];

  for (const c of chains) {
    if (c.pts.length < 2) continue;
    const fitted = constructShapeFromContour({
      pts: c.pts,
      hole: false,
      closed: c.closed,
      area: 0,
    });
    for (const p of fitted) {
      if (Math.abs(scaleToWorld - 1) <= 1e-6) {
        prims.push(p);
      } else if (p.kind === "line") {
        prims.push({
          ...p,
          x1: p.x1 * scaleToWorld,
          y1: p.y1 * scaleToWorld,
          x2: p.x2 * scaleToWorld,
          y2: p.y2 * scaleToWorld,
        });
      } else if (p.kind === "circle" || p.kind === "arc") {
        prims.push({
          ...p,
          cx: p.cx * scaleToWorld,
          cy: p.cy * scaleToWorld,
          r: p.r * scaleToWorld,
        });
      } else if (p.kind === "polyline") {
        prims.push({
          ...p,
          pts: p.pts.map((pt: PxPoint) => ({ x: pt.x * scaleToWorld, y: pt.y * scaleToWorld })),
        });
      }
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const put = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const p of prims) {
    if (p.kind === "line") {
      put(p.x1, p.y1);
      put(p.x2, p.y2);
    } else if (p.kind === "polyline") for (const q of p.pts) put(q.x, q.y);
    else {
      put(p.cx - p.r, p.cy - p.r);
      put(p.cx + p.r, p.cy + p.r);
    }
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = origWidth;
    maxY = origHeight;
  }

  return {
    prims,
    stats: {
      lines: prims.filter((p) => p.kind === "line").length,
      circles: prims.filter((p) => p.kind === "circle").length,
      arcs: prims.filter((p) => p.kind === "arc").length,
      polylines: prims.filter((p) => p.kind === "polyline").length,
      contours: chains.length,
      holes: 0,
    },
    centerline: {
      strokes: chains.length,
      lines: prims.filter((p) => p.kind === "line").length,
      arcs: prims.filter((p) => p.kind === "arc").length,
      circles: prims.filter((p) => p.kind === "circle").length,
      polylines: prims.filter((p) => p.kind === "polyline").length,
    },
    imagePx: { w: origWidth, h: origHeight },
    contentPx: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    tolerancePx: Math.max(0.8, Math.hypot(origWidth, origHeight) * 0.006),
  };
}
