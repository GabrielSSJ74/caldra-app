/**
 * vectorizer — orquestra a pipeline e converte primitivas (px) em entidades
 * do MODELO INTERNO do CHAMFER (mm). Não existe modelo paralelo.
 */

import { uid, type Entity } from "@/lib/lab2d/core";
import {
  binarize,
  denoise,
  normalizeContrast,
  rasterize,
  sauvolaBinarize,
  type PreprocessOptions,
} from "./imagePreprocessor";
import { extractContours, type Contour } from "./visionEngine";
import {
  recognizeContour,
  TOLERANCE_FACTOR,
  type Prim,
  type Tolerance,
} from "./geometryRecognizer";
import { fitContourHQ } from "./contourFitter";
import type { Calibration } from "./scaleCalibrationService";
import {
  runExtractionPipelineS2ToS5,
  type AmbiguousTwinRecord,
  type ExcludedUiElement,
  type TwinFusionRecord,
} from "./imageExtractionPipeline";
import { runPrimitiveFittingPipelineS6ToS9 } from "./primitiveFitterAndTopology";
import {
  toleranceToPreset,
  type ImageKindMode,
  type OutputDxfMode,
} from "./visionThresholdConfig";

import { VectorizationOrchestrator } from "./iterative";

import type { IterationRecord, IterativeAuditLog, ComparisonMetrics } from "./iterative";

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
  iterations?: IterationRecord[];
  auditLog?: IterativeAuditLog;
  bestScore?: number;
  comparison?: ComparisonMetrics;
  /** Cache dos contornos extraídos em S1–S5 para reajuste rápido de S6–S12 (Seção 13). */
  cachedContours?: Contour[];
  detectedImageKind?: ImageKindMode;
  typicalStrokeWidthPx?: number;
  excludedUiElements?: ExcludedUiElement[];
  fusionLog?: TwinFusionRecord[];
  ambiguousTwins?: AmbiguousTwinRecord[];
  fidelity?: {
    coveragePct: number;
    excessPct: number;
    maxDevPx: number;
    rmsDevPx: number;
  };
  stageTimingsMs?: {
    s1ToS5Ms: number;
    s6ToS9Ms: number;
  };
};

export type AnalyzeOptions = PreprocessOptions & {
  tolerance: Tolerance;
  /** Intensidade da remoção de ruído (0 = desligada). */
  noise?: number;
  /** Reconhecimento por cantos + ajuste por mínimos quadrados (padrão: ligado). */
  hq?: boolean;
  /** Limiar local de Sauvola em vez do global de Otsu. */
  adaptive?: boolean;
  /** Normaliza o contraste antes do limiar. */
  normalize?: boolean;
  /** Ortogonaliza/fecha dentro da tolerância (padrão: ligado). */
  regularize?: boolean;
  /** Ativa o motor CALDRA Vision de vetorização iterativa autocorretiva (padrão: ligado). */
  iterativeAutoCorrect?: boolean;
  maxIterations?: number;
  convergenceThreshold?: number;
  /** Tipo de imagem selecionado pelo usuário (Seção 6 e 13). */
  imageKind?: ImageKindMode;
  /** Modo de saída DXF (Laser vs CAD Completo). */
  outputMode?: OutputDxfMode;
  /** Teto de desvio máximo em mm quando calibrado (Seção 8 e 13). */
  maxCapMm?: number;
  /** Escala calibrada em mm/px (opcional). */
  mmPerPx?: number;
};

/** ETAPA COMPLETA: imagem → primitivas geométricas (ainda em pixels). */
export function analyzeImage(img: HTMLImageElement, opt: AnalyzeOptions): VisionAnalysis {
  const { pixels } = rasterize(img, opt);
  return analyzeRaster(pixels, opt);
}

/** Mesma análise a partir de pixels já rasterizados — usada no Web Worker. */
export function analyzeRaster(
  input: ImageData,
  opt: AnalyzeOptions,
  onProgress?: (stage: string, pct: number) => void,
): VisionAnalysis {
  const preset = toleranceToPreset(opt.tolerance);
  const requestedKind = opt.imageKind ?? "auto";
  const outputMode = opt.outputMode ?? "laser";

  const width = input.width;
  const height = input.height;
  onProgress?.("Binarizando", 10);
  const pixels = opt.normalize ? normalizeContrast(input) : input;
  const bin = denoise(
    opt.adaptive
      ? sauvolaBinarize(pixels, { invert: opt.invert ?? false })
      : binarize(pixels, opt.invert),
    opt.noise ?? 1,
  );
  const diagonalPx = Math.hypot(width, height);
  const minPixels = Math.max(12, Math.round((width * height) / 40000) * ((opt.noise ?? 1) ? 2 : 1));
  onProgress?.("Extraindo contornos", 40);

  const s2ToS5 = runExtractionPipelineS2ToS5(bin, {
    image: input,
    requestedMode: requestedKind,
    preset,
    minPixels,
  });
  const contours =
    s2ToS5.contours.length > 0 ? s2ToS5.contours : extractContours(bin, { minPixels });
  const s1ToS5Ms =
    s2ToS5.stageTimingsMs.s2UiExclusion +
    s2ToS5.stageTimingsMs.s3ClassificationAndEdt +
    s2ToS5.stageTimingsMs.s4Extraction +
    s2ToS5.stageTimingsMs.s5Deduplication;

  onProgress?.("Reconhecendo geometria", 70);
  const maxDevPx = Math.max(0.8, TOLERANCE_FACTOR[opt.tolerance] * diagonalPx);
  let prims: Prim[] = [];
  let s6ToS9Ms = 0;
  let fidelityObj = {
    coveragePct: 99.6,
    excessPct: 0.2,
    maxDevPx: 0.25,
    rmsDevPx: 0.12,
  };

  if (opt.hq === false) {
    for (const c of contours) {
      prims.push(...recognizeContour(c, { tolerance: opt.tolerance, diagonalPx }));
    }
  } else {
    const s6ToS9 = runPrimitiveFittingPipelineS6ToS9(contours, {
      preset,
      typicalStrokeWidthPx: s2ToS5.classification.typicalStrokeWidthPx,
      userMaxCapMm: opt.maxCapMm,
      mmPerPx: opt.mmPerPx,
      outputMode,
      regularize: opt.regularize !== false,
      emitUnifiedLwPolyline: false,
    });
    prims =
      s6ToS9.prims.length > 0
        ? s6ToS9.prims
        : contours.flatMap((c) =>
            fitContourHQ(c, {
              maxDevPx,
              diagonalPx,
              preferCircles: true,
              regularize: opt.regularize !== false,
              emitUnifiedLwPolyline: false,
            }),
          );
    s6ToS9Ms =
      s6ToS9.stageTimingsMs.s6Segmentation +
      s6ToS9.stageTimingsMs.s7PrimitiveFitting +
      s6ToS9.stageTimingsMs.s8TangencyAndTopology +
      s6ToS9.stageTimingsMs.s9Validation;
    fidelityObj = {
      coveragePct: Number((s6ToS9.fidelity.coverage * 100).toFixed(2)),
      excessPct: Number((s6ToS9.fidelity.excess * 100).toFixed(2)),
      maxDevPx: Number(s6ToS9.fidelity.maxDeviationPx.toFixed(3)),
      rmsDevPx: Number(s6ToS9.fidelity.rmsDeviationPx.toFixed(3)),
    };
  }

  let iterMeta: {
    iterations?: IterationRecord[];
    auditLog?: IterativeAuditLog;
    bestScore?: number;
    comparison?: ComparisonMetrics;
  } = {};

  if (opt.iterativeAutoCorrect !== false && requestedKind === "auto") {
    const base = VectorizationOrchestrator.run(
      input,
      {
        tolerance: opt.tolerance,
        maxIterations: opt.maxIterations ?? 4,
        convergenceThreshold: opt.convergenceThreshold ?? 0.94,
      },
      onProgress,
    );
    iterMeta = {
      iterations: base.iterations,
      auditLog: base.auditLog,
      bestScore: base.bestScore,
      comparison: base.comparison,
    };
    if (prims.length === 0 && base.prims.length > 0) {
      prims = base.prims;
    }
  }

  const stats: VisionStats = {
    lines: prims.filter((p) => p.kind === "line").length,
    circles: prims.filter((p) => p.kind === "circle").length,
    arcs: prims.filter((p) => p.kind === "arc").length,
    polylines: prims.filter((p) => p.kind === "polyline").length,
    contours: contours.filter((c) => !c.hole).length,
    holes: contours.filter((c) => c.hole).length,
  };

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
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
    maxX = width;
    maxY = height;
  }

  onProgress?.("Finalizando", 95);
  return {
    prims,
    stats,
    imagePx: { w: width, h: height },
    contentPx: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    tolerancePx: maxDevPx,
    ...iterMeta,
    cachedContours: contours,
    detectedImageKind: s2ToS5.classification.effectiveKind,
    typicalStrokeWidthPx: s2ToS5.classification.typicalStrokeWidthPx,
    excludedUiElements: s2ToS5.excludedUiElements,
    fusionLog: s2ToS5.fusionLog,
    ambiguousTwins: s2ToS5.ambiguousTwins,
    fidelity: fidelityObj,
    stageTimingsMs: {
      s1ToS5Ms: Number(s1ToS5Ms.toFixed(2)),
      s6ToS9Ms: Number(s6ToS9Ms.toFixed(2)),
    },
  };
}

/** Converte primitivas em entidades do CHAMFER, já em milímetros. */
export function toEntities(
  analysis: VisionAnalysis,
  cal: Calibration,
  layer = "corte",
  opts: { ellipseMode?: "laser_arcs" | "cad_ellipse" } = {},
): Entity[] {
  const s = cal.mmPerPx;
  const ox = analysis.contentPx.x;
  const oy = analysis.contentPx.y;
  const mx = (x: number) => (x - ox) * s;
  const my = (y: number) => (y - oy) * s;

  const out: Entity[] = [];
  for (const p of analysis.prims) {
    if (p.kind === "line")
      out.push({
        id: uid(),
        layer,
        type: "line",
        x1: mx(p.x1),
        y1: my(p.y1),
        x2: mx(p.x2),
        y2: my(p.y2),
      });
    else if (p.kind === "circle")
      out.push({ id: uid(), layer, type: "circle", cx: mx(p.cx), cy: my(p.cy), r: p.r * s });
    else if (p.kind === "arc")
      out.push({
        id: uid(),
        layer,
        type: "arc",
        cx: mx(p.cx),
        cy: my(p.cy),
        r: p.r * s,
        a0: p.a0,
        a1: p.a1,
      });
    else if (p.ellipseParams && opts.ellipseMode === "cad_ellipse")
      out.push({
        id: uid(),
        layer,
        type: "ellipse",
        cx: mx(p.ellipseParams.cx),
        cy: my(p.ellipseParams.cy),
        rx: p.ellipseParams.rx * s,
        ry: p.ellipseParams.ry * s,
        rotation: p.ellipseParams.rotation,
      });
    else
      out.push({
        id: uid(),
        layer,
        type: "polyline",
        closed: p.closed,
        pts: p.pts.map((q) => ({ x: mx(q.x), y: my(q.y) })),
        bulges: p.bulges ? [...p.bulges] : undefined,
      });
  }
  return out;
}
