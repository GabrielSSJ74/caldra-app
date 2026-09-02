/**
 * vectorizer — orquestra a pipeline e converte primitivas (px) em entidades
 * do MODELO INTERNO do CHAMFER (mm). Não existe modelo paralelo.
 */

import { uid, type Entity } from "@/lib/lab2d/core";
import { binarize, denoise, rasterize, type PreprocessOptions } from "./imagePreprocessor";
import { extractContours } from "./visionEngine";
import { recognizeContour, type Prim, type Tolerance } from "./geometryRecognizer";
import type { Calibration } from "./scaleCalibrationService";

export type VisionStats = {
  lines: number;
  circles: number;
  arcs: number;
  polylines: number;
  contours: number;
  holes: number;
};

export type VisionAnalysis = {
  prims: Prim[];
  stats: VisionStats;
  /** Tamanho da imagem analisada, em px. */
  imagePx: { w: number; h: number };
  /** Extensão da geometria detectada, em px. */
  contentPx: { x: number; y: number; w: number; h: number };
  tolerancePx: number;
};

export type AnalyzeOptions = PreprocessOptions & {
  tolerance: Tolerance;
  /** Intensidade da remoção de ruído (0 = desligada). */
  noise?: number;
};

/** ETAPA COMPLETA: imagem → primitivas geométricas (ainda em pixels). */
export function analyzeImage(img: HTMLImageElement, opt: AnalyzeOptions): VisionAnalysis {
  const { pixels, width, height } = rasterize(img, opt);
  const bin = denoise(binarize(pixels, opt.invert), opt.noise ?? 1);
  const diagonalPx = Math.hypot(width, height);
  const minPixels = Math.max(12, Math.round((width * height) / 40000) * (opt.noise ?? 1 ? 2 : 1));
  const contours = extractContours(bin, { minPixels });

  const prims: Prim[] = [];
  for (const c of contours) prims.push(...recognizeContour(c, { tolerance: opt.tolerance, diagonalPx }));

  const stats: VisionStats = {
    lines: prims.filter((p) => p.kind === "line").length,
    circles: prims.filter((p) => p.kind === "circle").length,
    arcs: prims.filter((p) => p.kind === "arc").length,
    polylines: prims.filter((p) => p.kind === "polyline").length,
    contours: contours.filter((c) => !c.hole).length,
    holes: contours.filter((c) => c.hole).length,
  };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const put = (x: number, y: number) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  for (const p of prims) {
    if (p.kind === "line") { put(p.x1, p.y1); put(p.x2, p.y2); }
    else if (p.kind === "polyline") for (const q of p.pts) put(q.x, q.y);
    else { put(p.cx - p.r, p.cy - p.r); put(p.cx + p.r, p.cy + p.r); }
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = width; maxY = height; }

  return {
    prims,
    stats,
    imagePx: { w: width, h: height },
    contentPx: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    tolerancePx: Math.max(0.8, diagonalPx * 0.006),
  };
}

/** Converte primitivas em entidades do CHAMFER, já em milímetros. */
export function toEntities(
  analysis: VisionAnalysis,
  cal: Calibration,
  layer = "corte",
): Entity[] {
  const s = cal.mmPerPx;
  const ox = analysis.contentPx.x;
  const oy = analysis.contentPx.y;
  const mx = (x: number) => (x - ox) * s;
  const my = (y: number) => (y - oy) * s;

  const out: Entity[] = [];
  for (const p of analysis.prims) {
    if (p.kind === "line")
      out.push({ id: uid(), layer, type: "line", x1: mx(p.x1), y1: my(p.y1), x2: mx(p.x2), y2: my(p.y2) });
    else if (p.kind === "circle")
      out.push({ id: uid(), layer, type: "circle", cx: mx(p.cx), cy: my(p.cy), r: p.r * s });
    else if (p.kind === "arc")
      out.push({ id: uid(), layer, type: "arc", cx: mx(p.cx), cy: my(p.cy), r: p.r * s, a0: p.a0, a1: p.a1 });
    else
      out.push({
        id: uid(),
        layer,
        type: "polyline",
        closed: p.closed,
        pts: p.pts.map((q) => ({ x: mx(q.x), y: my(q.y) })),
      });
  }
  return out;
}
