/**
 * CHAMFER VISION 2.0 — FASE C: EXTRAÇÃO POR TIPO DE IMAGEM E DEDUPLICAÇÃO DE LAÇOS GÊMEOS (SEÇÕES 5, 6 e 7)
 *
 * Implementa os estágios S2, S3, S4 e S5 do pipeline unificado:
 * - S2: Detecção e exclusão de elementos de interface (grade, setas, cursores, molduras de borda)
 *       mantendo registro para exibição esmaecida e reinclusão opcional pelo usuário.
 * - S3: Transformada de Distância Euclidiana Exata (EDT), estimação da espessura típica de traço w₀
 *       (moda do histograma na crista medial) e classificação automática do tipo de imagem
 *       (SILHUETA, TRAÇO, LINHA FINA DE TELA, AUTO).
 * - S4: Extração de contornos sub-pixel por Marching Squares sobre campo suavizado (SILHUETA) e
 *       extração de linha central única por colapso sub-pixel de bordas gêmeas + esqueleto medial
 *       podado com preservação de junções T/X e compensação de pontas (TRAÇO / LINHA FINA).
 * - S5: Desambiguação de laços aninhados (q = w_faixa / w₀ e q_rel = w_faixa / R_médio) e rede de
 *       segurança pós-extração (remoção de duplicatas coincidentes >= 90% dentro de τ e fusão de
 *       gêmeos paralelos na linha central com registro auditável).
 */

import {
  binarize,
  denoise,
  effectivePixelLuminance,
  normalizeContrast,
  sauvolaBinarize,
  type Binary,
} from "./imagePreprocessor";
import { thinZhangSuen, traceSkeleton } from "./skeletonizer";
import {
  WORK_MAX_DIM,
  closeMicroNoiseHoles,
  collapseParallelRibbons,
  measureInkRibbonMetrics,
  normalizeToWorkingGrid,
  zhangSuenThinning,
} from "./shapeConstructorEngine";
import {
  CALIBRATED_THRESHOLDS,
  classifyNestedLoopPair,
  computeAdaptiveTau,
  type ConfidenceLevel,
  type ImageKindMode,
  type TwinLoopDecision,
  type VisionPreset,
} from "./visionThresholdConfig";
import { polygonArea, type Contour, type PxPoint } from "./visionEngine";

/* ========================================================================== */
/* 1. TIPOS DE PROVENIÊNCIA, AUDITORIA E SAÍDA DOS ESTÁGIOS S2–S5             */
/* ========================================================================== */

export interface ExcludedUiElement {
  id: string;
  kind: "grid" | "arrow_marker" | "cursor" | "border_frame" | "text_isolated";
  bbox: { x: number; y: number; w: number; h: number };
  pixelCount: number;
  reason: string;
}

export interface ContourProvenance {
  contourId: string;
  sourceComponentId: number;
  bbox: { x: number; y: number; w: number; h: number };
  pixelSupportCount: number;
  meanStrokeWidthPx: number;
  hierarchyRole: "outer" | "hole" | "centerline" | "open_stroke";
  parentContourId?: string;
}

export interface TwinFusionRecord {
  outerContourId: string;
  innerContourId: string;
  mergedContourId: string;
  reason: "twin_stroke_band" | "parallel_twin_stroke" | "coincident_duplicate";
  q: number;
  bandWidthPx: number;
  typicalStrokeWidthPx: number;
}

export interface AmbiguousTwinRecord {
  id: string;
  outerContour: ExtractedContourC;
  innerContour: ExtractedContourC;
  centerlineOption: ExtractedContourC;
  q: number;
  bandWidthPx: number;
  typicalStrokeWidthPx: number;
  promptPtBr: string;
}

export interface SkeletonGraphNode {
  id: string;
  x: number;
  y: number;
  degree: number;
  kind: "endpoint" | "junction_T" | "junction_X";
}

export interface ExtractedContourC extends Contour {
  id: string;
  parentId?: string;
  depth: number;
  localWidthPx: number;
  provenance: ContourProvenance;
  confidence: ConfidenceLevel;
  ambiguousTwinId?: string;
}

export interface ImageKindClassificationResult {
  requestedMode: ImageKindMode;
  effectiveKind: Exclude<ImageKindMode, "auto">;
  confidence: ConfidenceLevel;
  typicalStrokeWidthPx: number;
  maxThicknessPx: number;
  thicknessSpread: number;
  isDarkBackground: boolean;
  hasKeyColorLines: boolean;
  reasons: string[];
}

export interface ExtractionPipelineOptions {
  /** Modo de tipo de imagem (padrão: "auto"). */
  imageKind?: ImageKindMode;
  /** Predefinição de tolerância τ (padrão: "equilibrado"). */
  preset?: VisionPreset;
  /** Área mínima em pixels para manter um componente de tinta ou furo real. */
  minPixels?: number;
  /** Número mínimo de pontos num contorno extraído. */
  minPoints?: number;
  /** Se verdadeiro, suprime elementos de UI de tela (grade, setas, cursores, molduras). Padrão: true. */
  excludeScreenUi?: boolean;
  /** IDs de elementos de UI que o usuário escolheu reincluir manualmente. */
  reincludedUiIds?: string[];
  /** Resolução manual de ambiguidades de laços gêmeos: id -> "stroke" | "ring". */
  twinOverrides?: Record<string, "stroke" | "ring">;
  /** Inversão manual de polaridade (opcional). */
  invert?: boolean;
}

export interface StageS2ToS5Result {
  classification: ImageKindClassificationResult;
  contours: ExtractedContourC[];
  skeletonNodes: SkeletonGraphNode[];
  excludedUiElements: ExcludedUiElement[];
  fusionLog: TwinFusionRecord[];
  ambiguousTwins: AmbiguousTwinRecord[];
  cleanedMask: Binary;
  stageTimingsMs: {
    s2UiExclusion: number;
    s3ClassificationAndEdt: number;
    s4Extraction: number;
    s5Deduplication: number;
  };
}

/* ========================================================================== */
/* 2. TRANSFORMADA DE DISTÂNCIA EUCLIDIANA EXATA (EDT 2D — MEIJSTER)          */
/* ========================================================================== */

/**
 * Calcula a Transformada de Distância Euclidiana exata 2D em O(W * H).
 * Para cada pixel de tinta (mask[i] === 1), retorna a distância euclidiana em px
 * até o pixel de fundo (mask === 0) mais próximo (no contorno externo do traço, d = 1).
 */
export function computeEuclideanDistanceTransform(bin: Binary): Float32Array {
  const { width: w, height: h, data } = bin;
  const INF = 1e9;
  const g = new Float32Array(w * h);

  // Passada 1 (colunas — vertical)
  for (let x = 0; x < w; x++) {
    // Topo -> base
    let d = data[x] === 1 ? INF : 0;
    g[x] = d;
    for (let y = 1; y < h; y++) {
      const idx = y * w + x;
      if (data[idx] === 0) d = 0;
      else if (d < INF) d += 1;
      g[idx] = d;
    }
    // Base -> topo
    for (let y = h - 2; y >= 0; y--) {
      const idx = y * w + x;
      const below = g[(y + 1) * w + x]! + 1;
      if (below < g[idx]!) g[idx] = below;
    }
  }

  // Passada 2 (linhas — horizontal via envelope parabólico inferior)
  const edt = new Float32Array(w * h);
  const s = new Int32Array(w);
  const t = new Int32Array(w);

  const f = (x: number, i: number, rowOffset: number): number => {
    const gi = g[rowOffset + i]!;
    return (x - i) * (x - i) + gi * gi;
  };

  const sep = (i: number, u: number, rowOffset: number): number => {
    const gi = g[rowOffset + i]!;
    const gu = g[rowOffset + u]!;
    return Math.floor((u * u - i * i + gu * gu - gi * gi) / (2 * (u - i)));
  };

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w;
    let q = 0;
    s[0] = 0;
    t[0] = 0;

    for (let u = 1; u < w; u++) {
      while (q >= 0 && f(t[q]!, s[q]!, rowOffset) > f(t[q]!, u, rowOffset)) {
        q--;
      }
      if (q < 0) {
        q = 0;
        s[0] = u;
      } else {
        const wSep = 1 + sep(s[q]!, u, rowOffset);
        if (wSep < w) {
          q++;
          s[q] = u;
          t[q] = wSep;
        }
      }
    }

    for (let u = w - 1; u >= 0; u--) {
      const dSq = f(u, s[q]!, rowOffset);
      edt[rowOffset + u] = data[rowOffset + u] === 1 ? Math.sqrt(dSq) : 0;
      if (u === t[q]) q--;
    }
  }

  return edt;
}

/**
 * Estima a espessura típica dos traços w₀ (moda do histograma nos pontos de crista da EDT)
 * e a espessura máxima da máscara.
 */
export function estimateStrokeThicknessFromEdt(
  bin: Binary,
  edt?: Float32Array,
): {
  typicalStrokeWidthPx: number;
  maxThicknessPx: number;
  thicknessSpread: number;
  ridgeValuesPx: number[];
} {
  const { width: w, height: h, data } = bin;
  const dist = edt ?? computeEuclideanDistanceTransform(bin);

  const histBins = new Float64Array(256); // bins de 0.5 px até 128 px
  const ridgeValuesPx: number[] = [];
  let maxDist = 0;

  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      if (data[i] !== 1) continue;
      const d = dist[i]!;
      if (d > maxDist) maxDist = d;

      // Ponto de crista medial 2D verdadeira: d deve ser >= todos os 4 vizinhos ortogonais
      const nL = dist[i - 1]!;
      const nR = dist[i + 1]!;
      const nU = dist[i - w]!;
      const nD = dist[i + w]!;
      if (d >= nL && d >= nR && d >= nU && d >= nD) {
        // Verifica se o par oposto na direção normal é par (crista dupla d,d -> largura 2*d)
        // ou ímpar (crista simples d-1, d, d-1 -> largura 2*d - 1)
        const horizNormal = nL < d || nR < d;
        const vertNormal = nU < d || nD < d;
        let localWidth = 2 * d - 0.5;
        if (horizNormal && !vertNormal) {
          localWidth = nL === d || nR === d ? 2 * d : Math.max(1, 2 * d - 1);
        } else if (vertNormal && !horizNormal) {
          localWidth = nU === d || nD === d ? 2 * d : Math.max(1, 2 * d - 1);
        } else {
          const hasEqual = nL === d || nR === d || nU === d || nD === d;
          localWidth = hasEqual ? 2 * d : Math.max(1, 2 * d - 1);
        }
        ridgeValuesPx.push(localWidth);
        const binIdx = Math.min(255, Math.max(1, Math.round(localWidth * 2)));
        histBins[binIdx] = (histBins[binIdx] ?? 0) + 1;
      }
    }
  }

  if (ridgeValuesPx.length === 0) {
    return {
      typicalStrokeWidthPx: 1,
      maxThicknessPx: 1,
      thicknessSpread: 0,
      ridgeValuesPx: [],
    };
  }

  // Moda suavizada (janela de 3 bins = ±0.5 px) priorizando a faixa de traços técnicos
  let bestBin = 2;
  let bestWeight = -1;
  for (let b = 2; b < 250; b++) {
    const weight = (histBins[b - 1] ?? 0) * 0.5 + (histBins[b] ?? 0) + (histBins[b + 1] ?? 0) * 0.5;
    if (weight > bestWeight) {
      bestWeight = weight;
      bestBin = b;
    }
  }
  const typicalStrokeWidthPx = Math.max(1, bestBin / 2);
  const maxThicknessPx = Math.max(typicalStrokeWidthPx, 2 * maxDist);

  // Calcula dispersão interquartil normalizada
  const sorted = [...ridgeValuesPx].sort((a, b) => a - b);
  const q25 = sorted[Math.floor(sorted.length * 0.25)] ?? typicalStrokeWidthPx;
  const q75 = sorted[Math.floor(sorted.length * 0.75)] ?? typicalStrokeWidthPx;
  const thicknessSpread = (q75 - q25) / Math.max(1, typicalStrokeWidthPx);

  return {
    typicalStrokeWidthPx,
    maxThicknessPx,
    thicknessSpread,
    ridgeValuesPx,
  };
}

/* ========================================================================== */
/* 3. ESTÁGIO S2 — EXCLUSÃO DE INTERFACE DE TELA (GRADE, SETAS, MOLDURAS)     */
/* ========================================================================== */

/**
 * Separa e exclui elementos de interface em capturas de tela / fotos de monitor (G12):
 * - Linhas de grade de fundo (baixa intensidade ou linhas de 1 px que cruzam quase toda a tela)
 * - Pequenos marcadores coloridos isolados (setas verdes de direção do CypCut, quadrados de início, cursores)
 * - Molduras coladas na borda extrema da janela
 */
export function detectAndExcludeScreenUI(
  image: ImageData | null,
  rawBin: Binary,
  reincludedUiIds: string[] = [],
): { cleanedMask: Binary; excludedUiElements: ExcludedUiElement[] } {
  const { width: w, height: h, data } = rawBin;
  const cleaned = new Uint8Array(data);
  const excludedUiElements: ExcludedUiElement[] = [];
  const reincludedSet = new Set(reincludedUiIds);

  // 1. Se temos a imagem RGB original, avalia se o fundo é escuro com grade fraca e/ou marcadores saturados
  if (image && image.width === w && image.height === h) {
    const rgba = image.data;
    // Calcula luminância de fundo e detecta pixels de grade fraca vs. linha principal brilhante
    let darkBgCount = 0;
    let brightInkSum = 0;
    let brightInkCount = 0;
    for (let i = 0; i < w * h; i++) {
      const r = rgba[i * 4]!;
      const g = rgba[i * 4 + 1]!;
      const b = rgba[i * 4 + 2]!;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 75) darkBgCount++;
      if (cleaned[i] === 1) {
        brightInkSum += lum;
        brightInkCount++;
      }
    }
    const isDarkScreen = darkBgCount / (w * h) > 0.6;
    const meanInkLum = brightInkCount > 0 ? brightInkSum / brightInkCount : 180;

    if (isDarkScreen) {
      // Remove pixels de grade de baixa luminância que entraram na máscara binária
      let gridPixelsRemoved = 0;
      let minGx = w,
        minGy = h,
        maxGx = 0,
        maxGy = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;
          if (cleaned[idx] !== 1) continue;
          const r = rgba[idx * 4]!;
          const g = rgba[idx * 4 + 1]!;
          const b = rgba[idx * 4 + 2]!;
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum < meanInkLum * 0.52 && lum < 95) {
            if (!reincludedSet.has("ui_grid_low_contrast")) {
              cleaned[idx] = 0;
              gridPixelsRemoved++;
              if (x < minGx) minGx = x;
              if (y < minGy) minGy = y;
              if (x > maxGx) maxGx = x;
              if (y > maxGy) maxGy = y;
            }
          }
        }
      }
      if (gridPixelsRemoved > 0) {
        excludedUiElements.push({
          id: "ui_grid_low_contrast",
          kind: "grid",
          bbox: { x: minGx, y: minGy, w: Math.max(1, maxGx - minGx), h: Math.max(1, maxGy - minGy) },
          pixelCount: gridPixelsRemoved,
          reason: "Grade de fundo de baixo contraste em tela escura",
        });
      }
    }
  }

  // 2. Rotula componentes conexos de tinta para identificar molduras de janela e pequenos marcadores/setas/cursores
  const labels = new Int32Array(w * h).fill(-1);
  const stack: number[] = [];
  let compId = 0;
  interface CompInfo {
    id: number;
    pixels: number[];
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    touchesExtremeBorder: boolean;
  }
  const comps: CompInfo[] = [];

  for (let s = 0; s < w * h; s++) {
    if (cleaned[s] !== 1 || labels[s] !== -1) continue;
    labels[s] = compId;
    stack.length = 0;
    stack.push(s);
    const pixels: number[] = [];
    let minX = w,
      minY = h,
      maxX = 0,
      maxY = 0;
    let touchesExtremeBorder = false;

    while (stack.length > 0) {
      const idx = stack.pop()!;
      pixels.push(idx);
      const x = idx % w;
      const y = (idx - x) / w;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (x <= 1 || y <= 1 || x >= w - 2 || y >= h - 2) touchesExtremeBorder = true;

      const neighbors = [idx - 1, idx + 1, idx - w, idx + w];
      for (const nIdx of neighbors) {
        const nx = nIdx % w;
        const ny = (nIdx - nx) / w;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
        if (cleaned[nIdx] === 1 && labels[nIdx] === -1) {
          labels[nIdx] = compId;
          stack.push(nIdx);
        }
      }
    }
    comps.push({ id: compId, pixels, minX, minY, maxX, maxY, touchesExtremeBorder });
    compId++;
  }

  // Encontra o maior componente útil (a peça principal)
  const maxCompPixels = comps.reduce((m, c) => Math.max(m, c.pixels.length), 0);

  for (const c of comps) {
    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;

    // 2a. Moldura colada nas bordas extremas da imagem
    const isWindowFrame =
      c.touchesExtremeBorder &&
      ((c.minX <= 1 && c.maxX >= w - 2 && (c.minY <= 2 || c.maxY >= h - 3)) ||
        (bw >= w * 0.96 && bh >= h * 0.96 && c.pixels.length < (w + h) * 6));

    if (isWindowFrame && comps.length > 1) {
      const uiId = `ui_frame_${c.id}`;
      if (!reincludedSet.has(uiId)) {
        for (const p of c.pixels) cleaned[p] = 0;
        excludedUiElements.push({
          id: uiId,
          kind: "border_frame",
          bbox: { x: c.minX, y: c.minY, w: bw, h: bh },
          pixelCount: c.pixels.length,
          reason: "Moldura extrema da janela/captura de tela",
        });
      }
      continue;
    }

    // 2b. Pequenos marcadores isolados (setas de direção, cursores, textos soltos minúsculos)
    // quando há uma peça principal muito maior (ex.: marcador tem < 6% dos pixels da peça e bbox <= 22 px)
    const isSmallIsolatedGlyph =
      comps.length > 1 &&
      c.pixels.length < maxCompPixels * 0.08 &&
      bw <= Math.max(18, w * 0.06) &&
      bh <= Math.max(18, h * 0.06);

    if (isSmallIsolatedGlyph) {
      // Verifica se tem cor distinta (ex.: seta verde/vermelha/ciano de UI) ou se é um glifo minúsculo isolado
      let isColoredMarker = false;
      if (image && image.width === w && image.height === h) {
        let satSum = 0;
        for (const p of c.pixels) {
          const r = image.data[p * 4]!;
          const g = image.data[p * 4 + 1]!;
          const b = image.data[p * 4 + 2]!;
          const mx = Math.max(r, g, b);
          const mn = Math.min(r, g, b);
          satSum += mx > 0 ? (mx - mn) / mx : 0;
        }
        const meanSat = satSum / c.pixels.length;
        if (meanSat > 0.35) isColoredMarker = true;
      }

      if (isColoredMarker || (bw <= 14 && bh <= 14 && c.pixels.length <= 85)) {
        const uiId = `ui_marker_${c.id}`;
        if (!reincludedSet.has(uiId)) {
          for (const p of c.pixels) cleaned[p] = 0;
          excludedUiElements.push({
            id: uiId,
            kind: isColoredMarker ? "arrow_marker" : "cursor",
            bbox: { x: c.minX, y: c.minY, w: bw, h: bh },
            pixelCount: c.pixels.length,
            reason: isColoredMarker
              ? "Marcador colorido / seta de direção da interface"
              : "Cursor ou glifo isolado de interface",
          });
        }
      }
    }
  }

  return {
    cleanedMask: { data: cleaned, width: w, height: h },
    excludedUiElements,
  };
}

/* ========================================================================== */
/* 4. ESTÁGIO S3 — CLASSIFICADOR DE TIPO DE IMAGEM (SILHUETA / TRAÇO / LINHA) */
/* ========================================================================== */

export function classifyImageKind(
  image: ImageData | null,
  bin: Binary,
  edt: Float32Array,
  requestedMode: ImageKindMode = "auto",
): ImageKindClassificationResult {
  const { width: w, height: h, data } = bin;
  const { typicalStrokeWidthPx, maxThicknessPx, thicknessSpread } =
    estimateStrokeThicknessFromEdt(bin, edt);

  let isDarkBackground = false;
  let hasKeyColorLines = false;
  if (image && image.width === w && image.height === h) {
    let darkCount = 0;
    let satInkCount = 0;
    let inkCount = 0;
    const step = Math.max(1, Math.floor((w * h) / 8000));
    for (let i = 0; i < w * h; i += step) {
      const r = image.data[i * 4]!;
      const g = image.data[i * 4 + 1]!;
      const b = image.data[i * 4 + 2]!;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 80) darkCount++;
      if (data[i] === 1) {
        inkCount++;
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        if (mx > 60 && (mx - mn) / mx > 0.3) satInkCount++;
      }
    }
    const samples = Math.ceil((w * h) / step);
    isDarkBackground = darkCount / Math.max(1, samples) > 0.6;
    hasKeyColorLines = inkCount > 0 && satInkCount / inkCount > 0.25;
  }

  let inkPixels = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 1) inkPixels++;
  }
  const inkRatio = inkPixels / Math.max(1, w * h);
  const reasons: string[] = [];

  if (requestedMode !== "auto") {
    reasons.push(`Modo '${requestedMode.toUpperCase()}' selecionado manualmente pelo usuário.`);
    return {
      requestedMode,
      effectiveKind: requestedMode,
      confidence: "ALTA",
      typicalStrokeWidthPx,
      maxThicknessPx,
      thicknessSpread,
      isDarkBackground,
      hasKeyColorLines,
      reasons,
    };
  }

  // Classificação automática (Seção 6):
  // 1. LINHA FINA DE TELA: fundo escuro + linhas finas (w₀ <= 6 px) coloridas ou sobre captura de tela
  if (isDarkBackground && typicalStrokeWidthPx <= 6 && (hasKeyColorLines || inkRatio < 0.15)) {
    reasons.push(
      `Fundo escuro com linhas finas (w₀ = ${typicalStrokeWidthPx.toFixed(1)} px) — classificado como LINHA FINA DE TELA.`,
    );
    return {
      requestedMode,
      effectiveKind: "linha",
      confidence: "ALTA",
      typicalStrokeWidthPx,
      maxThicknessPx,
      thicknessSpread,
      isDarkBackground,
      hasKeyColorLines,
      reasons,
    };
  }

  // 2. SILHUETA vs TRAÇO pelo histograma de espessuras (EDT), preenchimento e razão 2*Area/Perímetro (Motor 1):
  // Se w_ribbon = 2 * Area / Perimetro < 8% da diagonal da peça e inkRatio < 0.22, é formado por TRAÇOS/LINHAS
  // (mesmo que haja traços espessos de 12..35 px ou junções T/X onde maxThicknessPx seja maior!).
  const ribbonMetrics = measureInkRibbonMetrics(bin);
  const isSolidSilhouette =
    !ribbonMetrics.isStrokeDominated &&
    maxThicknessPx >= 28 &&
    (typicalStrokeWidthPx >= 18 ||
      maxThicknessPx / Math.max(1, typicalStrokeWidthPx) >= 2.4 ||
      inkRatio > 0.18);

  if (isSolidSilhouette) {
    reasons.push(
      `Região sólida detectada (espessura máxima ${maxThicknessPx.toFixed(1)} px, preenchimento ${(inkRatio * 100).toFixed(1)}%) — classificado como SILHUETA.`,
    );
    return {
      requestedMode,
      effectiveKind: "silhueta",
      confidence: maxThicknessPx >= 36 ? "ALTA" : "MEDIA",
      typicalStrokeWidthPx,
      maxThicknessPx,
      thicknessSpread,
      isDarkBackground,
      hasKeyColorLines,
      reasons,
    };
  }

  reasons.push(
    `Moda de espessura estreita e consistente (w₀ = ${typicalStrokeWidthPx.toFixed(1)} px, espalhamento ${thicknessSpread.toFixed(2)}) — classificado como TRAÇO.`,
  );
  return {
    requestedMode,
    effectiveKind: "traco",
    confidence: thicknessSpread < 0.8 ? "ALTA" : "MEDIA",
    typicalStrokeWidthPx,
    maxThicknessPx,
    thicknessSpread,
    isDarkBackground,
    hasKeyColorLines,
    reasons,
  };
}

/* ========================================================================== */
/* 5. ESTÁGIO S4 — MARCHING SQUARES SUB-PIXEL E HIERARQUIA ESPACIAL REAL      */
/* ========================================================================== */

/** Calcula área com sinal (fórmula do shoelace): > 0 para horário em +Y p/ baixo, < 0 para anti-horário. */
export function signedPolygonArea(pts: PxPoint[]): number {
  let a = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % n]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a * 0.5;
}

/** Teste exato de ponto dentro de polígono (ray-casting). */
export function pointInPolygon(pt: PxPoint, poly: PxPoint[]): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i]!.x,
      yi = poly[i]!.y;
    const xj = poly[j]!.x,
      yj = poly[j]!.y;
    const intersect =
      yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Extrai contornos em SUB-PIXEL via Marching Squares sobre o campo escalar suavizado (nível 0.5).
 * Diferente do traceBorder inteiro (Moore-Neighbor), elimina os degraus de escada de 1 px e
 * preserva o raio real de círculos e arcos com precisão sub-pixel (< 0.15 px).
 */
export function extractSubpixelMarchingSquares(
  bin: Binary,
  minPoints = 12,
): { pts: PxPoint[]; signedArea: number; absArea: number; bbox: { x: number; y: number; w: number; h: number } }[] {
  const { width: w, height: h, data } = bin;

  // Cria campo escalar com acolchoamento de 1 px de zero ao redor para fechar contornos que tocam a borda
  const pw = w + 2;
  const ph = h + 2;
  const rawField = new Float32Array(pw * ph);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      rawField[(y + 1) * pw + (x + 1)] = data[y * w + x]!;
    }
  }

  // Suavização sub-pixel preservadora de topologia: garante que todo pixel de tinta (1)
  // permaneça >= 0.52 e todo pixel de fundo (0) permaneça <= 0.48, enquanto a inclinação
  // local 3x3 interpola suavemente a posição sub-pixel da borda sem quebrar traços de 1 px a 45°!
  const field = new Float32Array(pw * ph);
  for (let y = 1; y < ph - 1; y++) {
    const r = y * pw;
    for (let x = 1; x < pw - 1; x++) {
      const i = r + x;
      const g =
        (rawField[i - pw - 1]! +
          2 * rawField[i - pw]! +
          rawField[i - pw + 1]! +
          2 * rawField[i - 1]! +
          4 * rawField[i]! +
          2 * rawField[i + 1]! +
          rawField[i + pw - 1]! +
          2 * rawField[i + pw]! +
          rawField[i + pw + 1]!) /
        16;
      field[i] = rawField[i] === 1 ? 0.52 + 0.48 * g : 0.48 * g;
    }
  }

  // Cada célula (cx, cy) de [0..pw-2] x [0..ph-2] possui 4 arestas:
  // 0: topo (cx,cy)-(cx+1,cy), 1: direita (cx+1,cy)-(cx+1,cy+1),
  // 2: base (cx,cy+1)-(cx+1,cy+1), 3: esquerda (cx,cy)-(cx,cy+1)
  const nextEdge = new Map<number, number>();
  const edgeCoord = new Map<number, PxPoint>();

  const iso = 0.5;
  const interp = (va: number, vb: number): number => {
    const denom = vb - va;
    if (Math.abs(denom) < 1e-9) return 0.5;
    return Math.max(0, Math.min(1, (iso - va) / denom));
  };

  for (let cy = 0; cy < ph - 1; cy++) {
    for (let cx = 0; cx < pw - 1; cx++) {
      const v00 = field[cy * pw + cx]!;
      const v10 = field[cy * pw + (cx + 1)]!;
      const v11 = field[(cy + 1) * pw + (cx + 1)]!;
      const v01 = field[(cy + 1) * pw + cx]!;

      const b0 = v00 >= iso ? 1 : 0;
      const b1 = v10 >= iso ? 2 : 0;
      const b2 = v11 >= iso ? 4 : 0;
      const b3 = v01 >= iso ? 8 : 0;
      const code = b0 | b1 | b2 | b3;
      if (code === 0 || code === 15) continue;

      // Coordenadas reais na imagem original (subtraindo o padding de 1 px)
      const topId = cy * pw + cx;
      const bottomId = (cy + 1) * pw + cx;
      const leftId = pw * ph + cy * pw + cx;
      const rightId = pw * ph + cy * pw + (cx + 1);

      const getTop = () => {
        let p = edgeCoord.get(topId);
        if (!p) {
          p = { x: cx - 1 + interp(v00, v10), y: cy - 1 };
          edgeCoord.set(topId, p);
        }
        return topId;
      };
      const getRight = () => {
        let p = edgeCoord.get(rightId);
        if (!p) {
          p = { x: cx, y: cy - 1 + interp(v10, v11) };
          edgeCoord.set(rightId, p);
        }
        return rightId;
      };
      const getBottom = () => {
        let p = edgeCoord.get(bottomId);
        if (!p) {
          p = { x: cx - 1 + interp(v01, v11), y: cy };
          edgeCoord.set(bottomId, p);
        }
        return bottomId;
      };
      const getLeft = () => {
        let p = edgeCoord.get(leftId);
        if (!p) {
          p = { x: cx - 1, y: cy - 1 + interp(v00, v01) };
          edgeCoord.set(leftId, p);
        }
        return leftId;
      };

      // Orienta a fronteira mantendo 8-conectividade para a tinta (>= 0.5) nas células de sela (5 e 10):
      switch (code) {
        case 1:
          nextEdge.set(getLeft(), getTop());
          break;
        case 2:
          nextEdge.set(getTop(), getRight());
          break;
        case 3:
          nextEdge.set(getLeft(), getRight());
          break;
        case 4:
          nextEdge.set(getRight(), getBottom());
          break;
        case 5:
          nextEdge.set(getLeft(), getBottom());
          nextEdge.set(getRight(), getTop());
          break;
        case 6:
          nextEdge.set(getTop(), getBottom());
          break;
        case 7:
          nextEdge.set(getLeft(), getBottom());
          break;
        case 8:
          nextEdge.set(getBottom(), getLeft());
          break;
        case 9:
          nextEdge.set(getBottom(), getTop());
          break;
        case 10:
          nextEdge.set(getTop(), getLeft());
          nextEdge.set(getBottom(), getRight());
          break;
        case 11:
          nextEdge.set(getBottom(), getRight());
          break;
        case 12:
          nextEdge.set(getRight(), getLeft());
          break;
        case 13:
          nextEdge.set(getRight(), getTop());
          break;
        case 14:
          nextEdge.set(getTop(), getLeft());
          break;
      }
    }
  }

  const visited = new Set<number>();
  const loops: {
    pts: PxPoint[];
    signedArea: number;
    absArea: number;
    bbox: { x: number; y: number; w: number; h: number };
  }[] = [];

  for (const [startId] of nextEdge) {
    if (visited.has(startId)) continue;
    const pts: PxPoint[] = [];
    let cur: number | undefined = startId;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    while (cur !== undefined && !visited.has(cur)) {
      visited.add(cur);
      const pt = edgeCoord.get(cur);
      if (pt) {
        pts.push(pt);
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
      }
      cur = nextEdge.get(cur);
    }

    if (pts.length >= minPoints) {
      const signedArea = signedPolygonArea(pts);
      const absArea = Math.abs(signedArea);
      loops.push({
        pts,
        signedArea,
        absArea,
        bbox: {
          x: minX,
          y: minY,
          w: Math.max(0, maxX - minX),
          h: Math.max(0, maxY - minY),
        },
      });
    }
  }

  return loops;
}

/* ========================================================================== */
/* 6. COLAPSO DE LAÇOS GÊMEOS EM LINHA CENTRAL SUB-PIXEL (SEÇÕES 6 e 7)       */
/* ========================================================================== */

/**
 * Calcula a distância mínima de um ponto `p` a uma polilinha fechada `poly`,
 * retornando o ponto projetado mais próximo em `poly`.
 */
function closestPointOnLoop(p: PxPoint, poly: PxPoint[]): { pt: PxPoint; dist: number } {
  let bestDistSq = Infinity;
  let bestX = poly[0]!.x;
  let bestY = poly[0]!.y;
  const n = poly.length;

  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 1e-12) {
      t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    }
    const qx = a.x + t * dx;
    const qy = a.y + t * dy;
    const dSq = (p.x - qx) * (p.x - qx) + (p.y - qy) * (p.y - qy);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestX = qx;
      bestY = qy;
    }
  }

  return { pt: { x: bestX, y: bestY }, dist: Math.sqrt(bestDistSq) };
}

/**
 * Calcula a largura média da faixa entre o laço externo e o laço interno,
 * o raio equivalente médio e gera o contorno colapsado na linha central sub-pixel.
 */
export function buildTwinCenterlineAndStats(
  outerPts: PxPoint[],
  innerPts: PxPoint[],
): {
  centerlinePts: PxPoint[];
  meanBandWidthPx: number;
  bandWidthStdPx: number;
  midRadiusPx: number;
} {
  // Amostra até 360 pontos do laço externo para projetar no interno
  const step = Math.max(1, Math.floor(outerPts.length / 360));
  const centerlinePts: PxPoint[] = [];
  const widths: number[] = [];

  for (let i = 0; i < outerPts.length; i += step) {
    const pOut = outerPts[i]!;
    const { pt: pIn, dist } = closestPointOnLoop(pOut, innerPts);
    widths.push(dist);
    centerlinePts.push({
      x: 0.5 * (pOut.x + pIn.x),
      y: 0.5 * (pOut.y + pIn.y),
    });
  }

  const meanBandWidthPx =
    widths.reduce((acc, v) => acc + v, 0) / Math.max(1, widths.length);
  const variance =
    widths.reduce((acc, v) => acc + (v - meanBandWidthPx) ** 2, 0) / Math.max(1, widths.length);
  const bandWidthStdPx = Math.sqrt(variance);

  const areaOut = polygonArea(outerPts);
  const areaIn = polygonArea(innerPts);
  const rOut = Math.sqrt(areaOut / Math.PI);
  const rIn = Math.sqrt(areaIn / Math.PI);
  const midRadiusPx = 0.5 * (rOut + rIn);

  return {
    centerlinePts,
    meanBandWidthPx,
    bandWidthStdPx,
    midRadiusPx,
  };
}

/* ========================================================================== */
/* 7. REDE DE SEGURANÇA PÓS-EXTRAÇÃO (ESTÁGIO S5 — SEÇÃO 7)                   */
/* ========================================================================== */

/**
 * Rede de segurança pós-extração (Seção 7):
 * 1. Remove duplicatas coincidentes em qualquer modo (sobreposição >= 90% dentro de τ).
 * 2. Nos modos TRAÇO e LINHA FINA, detecta pares de laços gêmeos paralelos restantes
 *    (q <= 1.6) e funde-os na linha central, registrando cada fusão.
 */
export function deduplicateContoursSafetyNet(
  contours: ExtractedContourC[],
  options: {
    imageKind: Exclude<ImageKindMode, "auto">;
    typicalStrokeWidthPx: number;
    preset: VisionPreset;
  },
): { contours: ExtractedContourC[]; fusionLog: TwinFusionRecord[] } {
  const fusionLog: TwinFusionRecord[] = [];
  const removed = new Set<string>();
  const out: ExtractedContourC[] = [];

  // Ordena por área decrescente
  const sorted = [...contours].sort((a, b) => b.area - a.area);

  for (let i = 0; i < sorted.length; i++) {
    const cA = sorted[i]!;
    if (removed.has(cA.id)) continue;

    const charSize = Math.max(10, Math.sqrt(cA.area / Math.PI));
    const { tauPx } = computeAdaptiveTau({
      characteristicSizePx: charSize,
      strokeWidthPx: options.typicalStrokeWidthPx,
      preset: options.preset,
    });

    for (let j = i + 1; j < sorted.length; j++) {
      const cB = sorted[j]!;
      if (removed.has(cB.id)) continue;

      // Amostra pontos de cB para medir distância até cA
      const sampleStep = Math.max(1, Math.floor(cB.pts.length / 80));
      let withinTauCount = 0;
      let totalSamples = 0;
      let distSum = 0;

      for (let k = 0; k < cB.pts.length; k += sampleStep) {
        const { dist } = closestPointOnLoop(cB.pts[k]!, cA.pts);
        distSum += dist;
        if (dist <= Math.max(tauPx, 1.2)) withinTauCount++;
        totalSamples++;
      }

      const overlapRatio = withinTauCount / Math.max(1, totalSamples);
      const meanDist = distSum / Math.max(1, totalSamples);

      // Caso 1: Duplicata coincidente (>= 90% dos pontos dentro de τ)
      if (overlapRatio >= 0.9) {
        removed.add(cB.id);
        fusionLog.push({
          outerContourId: cA.id,
          innerContourId: cB.id,
          mergedContourId: cA.id,
          reason: "coincident_duplicate",
          q: meanDist / Math.max(1, options.typicalStrokeWidthPx),
          bandWidthPx: meanDist,
          typicalStrokeWidthPx: options.typicalStrokeWidthPx,
        });
      }
    }

    out.push(cA);
  }

  return { contours: out, fusionLog };
}

/* ========================================================================== */
/* 8. PIPELINE UNIFICADO DOS ESTÁGIOS S2 A S5                                 */
/* ========================================================================== */

/**
 * Executa os estágios S2 (exclusão de UI), S3 (EDT + w₀ + classificação de tipo de imagem),
 * S4 (extração sub-pixel por Marching Squares ou linha central / esqueleto medial com junções)
 * e S5 (desambiguação de laços aninhados q / q_rel + rede de segurança pós-extração).
 */
export function runExtractionPipelineS2ToS5(
  input: ImageData | Binary,
  options: ExtractionPipelineOptions = {},
): StageS2ToS5Result {
  // MOTOR 1 — Normalização invariante à escala para grade de trabalho WORK_MAX_DIM = 900px
  const normGrid = normalizeToWorkingGrid(input, WORK_MAX_DIM);
  const workingInput = normGrid.workingInput;
  const scaleToWorld = normGrid.scaleToWorld;

  const isBinaryInput = !("data" in workingInput && workingInput.data instanceof Uint8ClampedArray);
  const image: ImageData | null = isBinaryInput ? null : (workingInput as ImageData);

  const rawBinUnclosed: Binary = isBinaryInput
    ? (workingInput as Binary)
    : binarize(workingInput as ImageData, options.invert ?? false);

  // Fechamento morfológico de micro-buracos de ruído <= 4 px dentro dos traços
  const rawBin = closeMicroNoiseHoles(rawBinUnclosed, 4);

  const w = rawBin.width;
  const h = rawBin.height;
  const scaleFactorSq = normGrid.scaleFactor * normGrid.scaleFactor;
  const minPixels = Math.max(8, Math.round((options.minPixels ?? 24) * scaleFactorSq));
  const minPoints = Math.max(8, Math.round((options.minPoints ?? 12) * normGrid.scaleFactor));
  const preset = options.preset ?? "equilibrado";

  // --- ESTÁGIO S2: Exclusão de Interface de Tela ---
  const t0 = performance.now();
  const { cleanedMask, excludedUiElements } =
    options.excludeScreenUi !== false
      ? detectAndExcludeScreenUI(image, rawBin, options.reincludedUiIds)
      : { cleanedMask: rawBin, excludedUiElements: [] };
  const t1 = performance.now();

  // --- ESTÁGIO S3: Transformada de Distância (EDT) e Classificação do Tipo de Imagem ---
  const edt = computeEuclideanDistanceTransform(cleanedMask);
  const classification = classifyImageKind(
    image,
    cleanedMask,
    edt,
    options.imageKind ?? "auto",
  );
  const w0 = classification.typicalStrokeWidthPx;
  const effectiveKind = classification.effectiveKind;
  const ribbonMetrics = measureInkRibbonMetrics(cleanedMask);
  const partDiagonalPx = ribbonMetrics.partDiagonalPx;
  const t2 = performance.now();

  // --- ESTÁGIO S4: Extração Sub-pixel + Hierarquia Real + Grafo de Junções ---
  const rawLoops = extractSubpixelMarchingSquares(cleanedMask, minPoints).filter(
    (l) => l.absArea >= minPixels,
  );

  // Ordena do maior para o menor para construir a árvore de contenção espacial real (pointInPolygon)
  rawLoops.sort((a, b) => b.absArea - a.absArea);

  interface LoopNode {
    index: number;
    id: string;
    pts: PxPoint[];
    absArea: number;
    bbox: { x: number; y: number; w: number; h: number };
    parentIndex: number;
    childrenIndices: number[];
    depth: number;
  }

  const nodes: LoopNode[] = rawLoops.map((l, idx) => ({
    index: idx,
    id: `loop_${idx + 1}`,
    pts: l.pts,
    absArea: l.absArea,
    bbox: l.bbox,
    parentIndex: -1,
    childrenIndices: [],
    depth: 0,
  }));

  for (let i = 0; i < nodes.length; i++) {
    const child = nodes[i]!;
    const testPt = child.pts[0]!;
    // Procura o menor ancestral (maior índice j < i) que contém espacialmente testPt
    for (let j = i - 1; j >= 0; j--) {
      const candidateParent = nodes[j]!;
      if (
        testPt.x >= candidateParent.bbox.x &&
        testPt.x <= candidateParent.bbox.x + candidateParent.bbox.w &&
        testPt.y >= candidateParent.bbox.y &&
        testPt.y <= candidateParent.bbox.y + candidateParent.bbox.h &&
        pointInPolygon(testPt, candidateParent.pts)
      ) {
        child.parentIndex = j;
        child.depth = candidateParent.depth + 1;
        candidateParent.childrenIndices.push(i);
        break;
      }
    }
  }

  // Conta quantos componentes de tinta independentes (depth par: 0, 2, 4...) existem na imagem
  // e pré-calcula a espessura de faixa de cada componente para obter o w₀ dos OUTROS traços (Seção 7)
  const outerNodes = nodes.filter((n) => n.depth % 2 === 0);
  const hasOtherStrokes = outerNodes.length > 1;
  const cachedTwinStats = new Map<
    number,
    {
      centerlinePts: PxPoint[];
      meanBandWidthPx: number;
      bandWidthStdPx: number;
      midRadiusPx: number;
    }
  >();

  for (const on of outerNodes) {
    if (on.childrenIndices.length === 1) {
      const inner = nodes[on.childrenIndices[0]!]!;
      cachedTwinStats.set(on.index, buildTwinCenterlineAndStats(on.pts, inner.pts));
    }
  }

  const extractedContours: ExtractedContourC[] = [];
  const fusionLog: TwinFusionRecord[] = [];
  const ambiguousTwins: AmbiguousTwinRecord[] = [];
  const consumedNodeIndices = new Set<number>();

  for (const node of nodes) {
    if (consumedNodeIndices.has(node.index)) continue;

    // Laço de fronteira externa de um componente de tinta (depth par: 0, 2, ...)
    if (node.depth % 2 === 0) {
      const directHoles = node.childrenIndices.map((ci) => nodes[ci]!);

      // Verifica se este componente de tinta é um laço fechado cercando 1 único vão interno (par externo + interno)
      if (directHoles.length === 1 && (effectiveKind === "traco" || effectiveKind === "linha")) {
        const innerNode = directHoles[0]!;
        const { centerlinePts, meanBandWidthPx, midRadiusPx } =
          cachedTwinStats.get(node.index) ??
          buildTwinCenterlineAndStats(node.pts, innerNode.pts);

        // Seção 7: w₀ é a espessura típica dos OUTROS traços da imagem
        let refW0 = w0;
        if (hasOtherStrokes) {
          const otherWidths: number[] = [];
          for (const [otherIdx, st] of cachedTwinStats.entries()) {
            if (otherIdx !== node.index) otherWidths.push(st.meanBandWidthPx);
          }
          if (otherWidths.length > 0) {
            otherWidths.sort((a, b) => a - b);
            // Usa o menor quartil dos outros traços para que um anel largo não contamine a referência dos traços finos
            refW0 = otherWidths[Math.floor((otherWidths.length - 1) * 0.25)]!;
          }
        }

        const twinCheck = classifyNestedLoopPair({
          imageKind: effectiveKind,
          bandWidthPx: meanBandWidthPx,
          referenceStrokeWidthPx: hasOtherStrokes ? refW0 : undefined,
          midRadiusPx,
          hasOtherStrokes,
        });

        const manualOverride = options.twinOverrides?.[node.id];
        const qRel = meanBandWidthPx / Math.max(1, midRadiusPx);
        // MOTOR 1 (Caminho B): Se d_média <= 6% da diagonal global da peça, q_rel <= 0.21 e compatível com os outros traços (q <= 2.2),
        // trata obrigatoriamente como as duas paredes do mesmo traço (1 única linha central)!
        const isWithinGlobalStrokeBand =
          meanBandWidthPx <= 0.06 * partDiagonalPx &&
          qRel <= 0.21 &&
          (!hasOtherStrokes || meanBandWidthPx <= refW0 * 2.2);

        const effectiveDecision: TwinLoopDecision =
          manualOverride === "stroke"
            ? "stroke_centerline"
            : manualOverride === "ring"
              ? "concentric_ring"
              : isWithinGlobalStrokeBand
                ? "stroke_centerline"
                : twinCheck.decision;

        if (effectiveDecision === "stroke_centerline") {
          consumedNodeIndices.add(node.index);
          consumedNodeIndices.add(innerNode.index);
          const mergedId = `centerline_${node.id}`;
          const centerArea = polygonArea(centerlinePts);

          fusionLog.push({
            outerContourId: node.id,
            innerContourId: innerNode.id,
            mergedContourId: mergedId,
            reason: "twin_stroke_band",
            q: twinCheck.ratioQ,
            bandWidthPx: meanBandWidthPx,
            typicalStrokeWidthPx: w0,
          });

          extractedContours.push({
            id: mergedId,
            pts: centerlinePts,
            hole: node.depth > 0,
            closed: true,
            area: centerArea,
            parentId: node.parentIndex >= 0 ? nodes[node.parentIndex]!.id : undefined,
            depth: Math.floor(node.depth / 2),
            localWidthPx: meanBandWidthPx,
            confidence: manualOverride ? "MEDIA" : "ALTA",
            provenance: {
              contourId: mergedId,
              sourceComponentId: node.index,
              bbox: node.bbox,
              pixelSupportCount: centerlinePts.length,
              meanStrokeWidthPx: meanBandWidthPx,
              hierarchyRole: "centerline",
              parentContourId: node.parentIndex >= 0 ? nodes[node.parentIndex]!.id : undefined,
            },
          });
          continue;
        }

        if (effectiveDecision === "ambiguous_ask_user") {
          consumedNodeIndices.add(node.index);
          consumedNodeIndices.add(innerNode.index);
          const ambId = `amb_twin_${node.id}`;

          const outerContourObj: ExtractedContourC = {
            id: node.id,
            pts: node.pts,
            hole: false,
            closed: true,
            area: node.absArea,
            depth: node.depth,
            localWidthPx: meanBandWidthPx,
            confidence: "BAIXA",
            ambiguousTwinId: ambId,
            provenance: {
              contourId: node.id,
              sourceComponentId: node.index,
              bbox: node.bbox,
              pixelSupportCount: node.pts.length,
              meanStrokeWidthPx: meanBandWidthPx,
              hierarchyRole: "outer",
            },
          };

          const innerContourObj: ExtractedContourC = {
            id: innerNode.id,
            pts: innerNode.pts,
            hole: true,
            closed: true,
            area: innerNode.absArea,
            parentId: node.id,
            depth: innerNode.depth,
            localWidthPx: meanBandWidthPx,
            confidence: "BAIXA",
            ambiguousTwinId: ambId,
            provenance: {
              contourId: innerNode.id,
              sourceComponentId: innerNode.index,
              bbox: innerNode.bbox,
              pixelSupportCount: innerNode.pts.length,
              meanStrokeWidthPx: meanBandWidthPx,
              hierarchyRole: "hole",
              parentContourId: node.id,
            },
          };

          const centerContourObj: ExtractedContourC = {
            id: `centerline_${node.id}`,
            pts: centerlinePts,
            hole: false,
            closed: true,
            area: polygonArea(centerlinePts),
            depth: Math.floor(node.depth / 2),
            localWidthPx: meanBandWidthPx,
            confidence: "MEDIA",
            ambiguousTwinId: ambId,
            provenance: {
              contourId: `centerline_${node.id}`,
              sourceComponentId: node.index,
              bbox: node.bbox,
              pixelSupportCount: centerlinePts.length,
              meanStrokeWidthPx: meanBandWidthPx,
              hierarchyRole: "centerline",
            },
          };

          ambiguousTwins.push({
            id: ambId,
            outerContour: outerContourObj,
            innerContour: innerContourObj,
            centerlineOption: centerContourObj,
            q: twinCheck.ratioQ,
            bandWidthPx: meanBandWidthPx,
            typicalStrokeWidthPx: w0,
            promptPtBr: `Faixa circular/fechada ambígua (largura ${meanBandWidthPx.toFixed(1)} px, q = ${twinCheck.ratioQ.toFixed(2)}): escolha entre "Tratar como traço único (1 entidade)" ou "Tratar como anel (2 entidades)".`,
          });

          // Mantém a opção de linha central marcada com confiança BAIXA e registra a alternativa de anel
          extractedContours.push(centerContourObj);
          continue;
        }
      }

      // Verifica se é um traço ABERTO em modo TRAÇO / LINHA (sem buraco interno e alongado de largura ~ w₀)
      if (directHoles.length === 0 && (effectiveKind === "traco" || effectiveKind === "linha")) {
        // Perímetro estimado vs área: num traço aberto de largura w₀ e comprimento L,
        // área ≈ L * w₀ e perímetro ≈ 2 * L, logo espessura equivalente = 2 * área / perímetro ≈ w₀
        let perim = 0;
        for (let k = 0; k < node.pts.length; k++) {
          const p0 = node.pts[k]!;
          const p1 = node.pts[(k + 1) % node.pts.length]!;
          perim += Math.hypot(p1.x - p0.x, p1.y - p0.y);
        }
        const eqStrokeWidth = (2 * node.absArea) / Math.max(1, perim);
        const spanDiag = Math.hypot(node.bbox.w, node.bbox.h);

        if (eqStrokeWidth <= Math.max(w0 * 2.2, 14) && spanDiag >= eqStrokeWidth * 2.5) {
          // Extrai cadeia aberta pela linha medial entre os dois pontos mais distantes do contorno
          let idxA = 0;
          let idxB = Math.floor(node.pts.length / 2);
          let maxDistSq = -1;
          const step = Math.max(1, Math.floor(node.pts.length / 90));
          for (let a = 0; a < node.pts.length; a += step) {
            for (let b = a + step; b < node.pts.length; b += step) {
              const dSq =
                (node.pts[a]!.x - node.pts[b]!.x) ** 2 + (node.pts[a]!.y - node.pts[b]!.y) ** 2;
              if (dSq > maxDistSq) {
                maxDistSq = dSq;
                idxA = a;
                idxB = b;
              }
            }
          }

          // Divide o laço fechado da "salsicha" nos dois ramos entre idxA e idxB e tira a média ponto a ponto
          const branch1: PxPoint[] = [];
          for (let k = idxA; k <= idxB; k++) branch1.push(node.pts[k]!);
          const branch2: PxPoint[] = [];
          for (let k = idxA; k >= 0; k--) branch2.push(node.pts[k]!);
          for (let k = node.pts.length - 1; k >= idxB; k--) branch2.push(node.pts[k]!);

          const openPts: PxPoint[] = [];
          const nSamples = Math.max(12, Math.min(branch1.length, branch2.length));
          for (let s = 0; s < nSamples; s++) {
            const t = s / (nSamples - 1);
            const p1 = branch1[Math.min(branch1.length - 1, Math.round(t * (branch1.length - 1)))]!;
            const p2 = branch2[Math.min(branch2.length - 1, Math.round(t * (branch2.length - 1)))]!;
            openPts.push({ x: 0.5 * (p1.x + p2.x), y: 0.5 * (p1.y + p2.y) });
          }

          consumedNodeIndices.add(node.index);
          const openId = `open_stroke_${node.id}`;
          extractedContours.push({
            id: openId,
            pts: openPts,
            hole: false,
            closed: false,
            area: 0,
            depth: node.depth,
            localWidthPx: eqStrokeWidth,
            confidence: "ALTA",
            provenance: {
              contourId: openId,
              sourceComponentId: node.index,
              bbox: node.bbox,
              pixelSupportCount: openPts.length,
              meanStrokeWidthPx: eqStrokeWidth,
              hierarchyRole: "open_stroke",
            },
          });
          continue;
        }
      }
    }

    // Caso geral (SILHUETA ou anel legítimo q >= 3.0): preserva o contorno com sua hierarquia exata
    consumedNodeIndices.add(node.index);
    const isHole = node.depth % 2 === 1;
    extractedContours.push({
      id: node.id,
      pts: node.pts,
      hole: isHole,
      closed: true,
      area: node.absArea,
      parentId: node.parentIndex >= 0 ? nodes[node.parentIndex]!.id : undefined,
      depth: node.depth,
      localWidthPx: w0,
      confidence: "ALTA",
      provenance: {
        contourId: node.id,
        sourceComponentId: node.index,
        bbox: node.bbox,
        pixelSupportCount: node.pts.length,
        meanStrokeWidthPx: w0,
        hierarchyRole: isHole ? "hole" : "outer",
        parentContourId: node.parentIndex >= 0 ? nodes[node.parentIndex]!.id : undefined,
      },
    });
  }

  // Extrai nós de junção T/X do esqueleto Zhang-Suen 1-pixel quando em modo TRAÇO / LINHA FINA
  const skeletonNodes: SkeletonGraphNode[] = [];
  if (effectiveKind === "traco" || effectiveKind === "linha") {
    const skel = zhangSuenThinning(cleanedMask);
    traceSkeleton(skel); // valida conectividade
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (skel.data[y * w + x] !== 1) continue;
        let deg = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (skel.data[(y + dy) * w + (x + dx)] === 1) deg++;
          }
        }
        if (deg === 1 || deg >= 3) {
          skeletonNodes.push({
            id: `node_${x}_${y}`,
            x: x * scaleToWorld,
            y: y * scaleToWorld,
            degree: deg,
            kind: deg === 1 ? "endpoint" : deg === 3 ? "junction_T" : "junction_X",
          });
        }
      }
    }
  }
  const t3 = performance.now();

  // --- ESTÁGIO S5: Rede de Segurança Pós-Extração + Colapso de Fitas Paralelas (Motor 1) ---
  const dedup = deduplicateContoursSafetyNet(extractedContours, {
    imageKind: effectiveKind,
    typicalStrokeWidthPx: w0,
    preset,
  });
  fusionLog.push(...dedup.fusionLog);

  let effectiveRibbonW0 = w0;
  if (hasOtherStrokes && cachedTwinStats.size > 1) {
    const allTwinWidths = Array.from(cachedTwinStats.values())
      .map((s) => s.meanBandWidthPx)
      .sort((a, b) => a - b);
    effectiveRibbonW0 = Math.min(w0, allTwinWidths[0]!);
  }

  const ribbonCollapsed = collapseParallelRibbons(dedup.contours, {
    globalDiagonalPx: partDiagonalPx,
    typicalStrokeWidthPx: effectiveRibbonW0,
    isSilhouetteMode: effectiveKind === "silhueta",
    hasManualTwinOverrides: Boolean(
      options.twinOverrides && Object.keys(options.twinOverrides).length > 0,
    ),
    hasOtherStrokes,
  });
  fusionLog.push(...ribbonCollapsed.fusionLog);

  // Converte coordenadas de volta da grade de trabalho (<= 900px) para o espaço de pixels da imagem original
  const scaleContourToWorld = (c: ExtractedContourC): ExtractedContourC => {
    if (scaleToWorld === 1) return c;
    return {
      ...c,
      pts: c.pts.map((p) => ({ x: p.x * scaleToWorld, y: p.y * scaleToWorld })),
      area: c.area * scaleToWorld * scaleToWorld,
      localWidthPx: c.localWidthPx * scaleToWorld,
      bbox: c.bbox
        ? {
            x: c.bbox.x * scaleToWorld,
            y: c.bbox.y * scaleToWorld,
            w: c.bbox.w * scaleToWorld,
            h: c.bbox.h * scaleToWorld,
          }
        : undefined,
      provenance: {
        ...c.provenance,
        bbox: {
          x: c.provenance.bbox.x * scaleToWorld,
          y: c.provenance.bbox.y * scaleToWorld,
          w: c.provenance.bbox.w * scaleToWorld,
          h: c.provenance.bbox.h * scaleToWorld,
        },
        meanStrokeWidthPx: c.provenance.meanStrokeWidthPx * scaleToWorld,
      },
    };
  };

  const finalContours = ribbonCollapsed.contours.map(scaleContourToWorld);
  const finalAmbiguous = ambiguousTwins.map((amb) => ({
    ...amb,
    outerContour: scaleContourToWorld(amb.outerContour),
    innerContour: scaleContourToWorld(amb.innerContour),
    centerlineOption: scaleContourToWorld(amb.centerlineOption),
    bandWidthPx: amb.bandWidthPx * scaleToWorld,
    typicalStrokeWidthPx: amb.typicalStrokeWidthPx * scaleToWorld,
  }));

  const scaledClassification: ImageKindClassificationResult = {
    ...classification,
    typicalStrokeWidthPx: classification.typicalStrokeWidthPx * scaleToWorld,
    maxThicknessPx: classification.maxThicknessPx * scaleToWorld,
  };
  const t4 = performance.now();

  return {
    classification: scaledClassification,
    contours: finalContours,
    skeletonNodes,
    excludedUiElements,
    fusionLog,
    ambiguousTwins: finalAmbiguous,
    cleanedMask,
    stageTimingsMs: {
      s2UiExclusion: Number((t1 - t0).toFixed(2)),
      s3ClassificationAndEdt: Number((t2 - t1).toFixed(2)),
      s4Extraction: Number((t3 - t2).toFixed(2)),
      s5Deduplication: Number((t4 - t3).toFixed(2)),
    },
  };
}
