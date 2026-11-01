/**
 * CHAMFER VISION — MOTOR CONSTRUTOR DE FORMAS INDEPENDENTE DE RESOLUÇÃO
 *
 * Implementa os 4 Motores Matemáticos Obrigatórios para Corte a Laser (CypCut / CypDuct):
 *
 * - MOTOR 1: Normalização Invariante à Escala (`WORK_MAX_DIM = 900px`) +
 *            Afinamento Morfológico de Zhang-Suen (`zhangSuenThinning`, 1-pixel) +
 *            Colapso Topológico Pai-Filho de Fitas Paralelas (`collapseParallelRibbons`) +
 *            Varredura Espacial Final Anti-Duplicata (< 2.5x espessura média do traço).
 *
 * - MOTOR 2: Construtor de Furos, Círculos e Ovais (Zero Octógonos / Polígonos de Retas):
 *            1) Suavização Sem Encolhimento de Taubin λ/μ (4 iterações: λ = 0.50, μ = -0.52)
 *               sobre todos os pontos densos (proibido Ramer-Douglas-Peucker prévio).
 *            2) Teste 1 — Conversão Direta em `CIRCLE` nativo (Kåsa/Taubin com RMS/R <= 0.14).
 *            3) Teste 2 — Furos Ovais/Elípticos -> Oval de 4 Centros com 4 `ARC`s tangentes G1.
 *
 * - MOTOR 3: Construtor de Curvas Compostas por Ajuste Recursivo de Arcos (`ARC`) e Retas (`LINE`)
 *            (`fitBiarcAndLineChain` + `mergeCollinearAndCocircular`):
 *            1) Detecção estrita de cantos vivos apenas em picos > 35° (janela W = max(6, floor(0.025*N))).
 *            2) Teste estrito de reta (`LINE`): d_max <= max(1.2 px, 0.006 * L).
 *            3) Ajuste recursivo de arco circular de 3 pontos (`ARC`) passando exatamente por
 *               (P_ini, P_meio, P_fim) com tolerância τ_arc = max(2.0 px, 0.008 * L_contorno),
 *               garantindo distância 0.0000 mm nas junções.
 *            4) Fusão pós-ajuste de retas colineares (<= 2.5°) e arcos cocirculares (< 3%).
 */

import type { Binary } from "./imagePreprocessor";
import { thinZhangSuen, traceSkeleton } from "./skeletonizer";
import { polygonArea, type Contour, type PxPoint } from "./visionEngine";
import type { Prim } from "./geometryRecognizer";
import { fitCircleTaubinGaussNewton } from "./visionMetricsAndHarness";
import type { ExtractedContourC, TwinFusionRecord } from "./imageExtractionPipeline";

const TWO_PI = Math.PI * 2;

/** Dimensão máxima da grade de trabalho para invariância de resolução (Motor 1). */
export const WORK_MAX_DIM = 900;

/* ========================================================================== */
/* MOTOR 1 — NORMALIZAÇÃO INVARIANTE À ESCALA, ZHANG-SUEN E COLAPSO DE FITAS  */
/* ========================================================================== */

export interface NormalizedGridResult<T extends ImageData | Binary> {
  workingInput: T;
  scaleFactor: number;
  scaleToWorld: number;
  origWidth: number;
  origHeight: number;
  workWidth: number;
  workHeight: number;
}

/**
 * Redimensiona `ImageData` ou `Binary` com interpolação bilinear para que o maior
 * lado tenha no máximo `WORK_MAX_DIM = 900px`, guardando `scaleToWorld` exato.
 */
export function normalizeToWorkingGrid<T extends ImageData | Binary>(
  input: T,
  maxDim = WORK_MAX_DIM,
): NormalizedGridResult<T> {
  const origW = input.width;
  const origH = input.height;
  const maxSide = Math.max(origW, origH);

  if (maxSide <= maxDim || maxSide <= 0) {
    return {
      workingInput: input,
      scaleFactor: 1,
      scaleToWorld: 1,
      origWidth: origW,
      origHeight: origH,
      workWidth: origW,
      workHeight: origH,
    };
  }

  const scaleFactor = maxDim / maxSide;
  const workW = Math.max(1, Math.round(origW * scaleFactor));
  const workH = Math.max(1, Math.round(origH * scaleFactor));
  // Usa razão exata para reconstrução sem deriva de arredondamento
  const scaleToWorldX = origW / workW;
  const scaleToWorldY = origH / workH;
  const scaleToWorld = 0.5 * (scaleToWorldX + scaleToWorldY);

  const isRgba = input.data instanceof Uint8ClampedArray;

  if (isRgba) {
    const src = input.data as Uint8ClampedArray;
    const dst = new Uint8ClampedArray(workW * workH * 4);
    for (let y = 0; y < workH; y++) {
      const sy = Math.min(origH - 1, Math.max(0, (y + 0.5) * scaleToWorldY - 0.5));
      const y0 = Math.floor(sy);
      const y1 = Math.min(origH - 1, y0 + 1);
      const fy = sy - y0;
      for (let x = 0; x < workW; x++) {
        const sx = Math.min(origW - 1, Math.max(0, (x + 0.5) * scaleToWorldX - 0.5));
        const x0 = Math.floor(sx);
        const x1 = Math.min(origW - 1, x0 + 1);
        const fx = sx - x0;

        const i00 = (y0 * origW + x0) * 4;
        const i10 = (y0 * origW + x1) * 4;
        const i01 = (y1 * origW + x0) * 4;
        const i11 = (y1 * origW + x1) * 4;
        const outIdx = (y * workW + x) * 4;

        for (let c = 0; c < 4; c++) {
          const v0 = src[i00 + c]! * (1 - fx) + src[i10 + c]! * fx;
          const v1 = src[i01 + c]! * (1 - fx) + src[i11 + c]! * fx;
          dst[outIdx + c] = Math.round(v0 * (1 - fy) + v1 * fy);
        }
      }
    }
    return {
      workingInput: { width: workW, height: workH, data: dst } as unknown as T,
      scaleFactor,
      scaleToWorld,
      origWidth: origW,
      origHeight: origH,
      workWidth: workW,
      workHeight: workH,
    };
  }

  // Máscara binária: interpolação bilinear suave seguida de limiar 0.5
  const src = input.data as Uint8Array;
  const dst = new Uint8Array(workW * workH);
  for (let y = 0; y < workH; y++) {
    const sy = Math.min(origH - 1, Math.max(0, (y + 0.5) * scaleToWorldY - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(origH - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < workW; x++) {
      const sx = Math.min(origW - 1, Math.max(0, (x + 0.5) * scaleToWorldX - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(origW - 1, x0 + 1);
      const fx = sx - x0;

      const v00 = src[y0 * origW + x0]!;
      const v10 = src[y0 * origW + x1]!;
      const v01 = src[y1 * origW + x0]!;
      const v11 = src[y1 * origW + x1]!;
      const val = (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
      dst[y * workW + x] = val >= 0.5 ? 1 : 0;
    }
  }

  return {
    workingInput: { width: workW, height: workH, data: dst } as unknown as T,
    scaleFactor,
    scaleToWorld,
    origWidth: origW,
    origHeight: origH,
    workWidth: workW,
    workHeight: workH,
  };
}

/**
 * Fechamento morfológico de buracos de ruído <= 4 px dentro da tinta
 * para impedir que falhas de impressão/foto dividam um traço em dois.
 */
export function closeMicroNoiseHoles(bin: Binary, maxHoleAreaPx = 4): Binary {
  const { width: w, height: h, data } = bin;
  const out = new Uint8Array(data);
  const visited = new Uint8Array(w * h);
  const queue: number[] = [];

  for (let s = 0; s < w * h; s++) {
    if (out[s] !== 0 || visited[s]) continue;
    visited[s] = 1;
    queue.length = 0;
    queue.push(s);
    let touchesBorder = false;
    let head = 0;

    while (head < queue.length) {
      const idx = queue[head++]!;
      const x = idx % w;
      const y = (idx - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesBorder = true;

      const nbrs = [idx - 1, idx + 1, idx - w, idx + w];
      for (const nIdx of nbrs) {
        if (nIdx < 0 || nIdx >= w * h) continue;
        const nx = nIdx % w;
        const ny = (nIdx - nx) / w;
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
        if (out[nIdx] === 0 && !visited[nIdx]) {
          visited[nIdx] = 1;
          queue.push(nIdx);
        }
      }
    }

    if (!touchesBorder && queue.length <= maxHoleAreaPx) {
      for (const idx of queue) out[idx] = 1;
    }
  }

  return { width: w, height: h, data: out };
}

/**
 * Mede a razão entre área e perímetro da tinta para determinar a espessura média
 * da faixa w = (2 * Area) / Perimetro em relação à diagonal global da peça.
 */
export function measureInkRibbonMetrics(bin: Binary): {
  inkAreaPx: number;
  boundaryPerimeterPx: number;
  meanRibbonWidthPx: number;
  partDiagonalPx: number;
  ribbonToDiagonalRatio: number;
  isStrokeDominated: boolean;
} {
  const { width: w, height: h, data } = bin;
  let inkAreaPx = 0;
  let boundaryEdges = 0;
  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0;

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (data[row + x] !== 1) continue;
      inkAreaPx++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      if (x === 0 || data[row + x - 1] === 0) boundaryEdges++;
      if (x === w - 1 || data[row + x + 1] === 0) boundaryEdges++;
      if (y === 0 || data[row - w + x] === 0) boundaryEdges++;
      if (y === h - 1 || data[row + w + x] === 0) boundaryEdges++;
    }
  }

  if (inkAreaPx === 0) {
    return {
      inkAreaPx: 0,
      boundaryPerimeterPx: 0,
      meanRibbonWidthPx: 0,
      partDiagonalPx: Math.hypot(w, h),
      ribbonToDiagonalRatio: 0,
      isStrokeDominated: false,
    };
  }

  // Fator Cauchy-Crofton (~0.9) para converter contagem de arestas 4-conexas em perímetro euclidiano
  const boundaryPerimeterPx = Math.max(1, boundaryEdges * 0.9);
  const meanRibbonWidthPx = (2 * inkAreaPx) / boundaryPerimeterPx;
  const partDiagonalPx = Math.max(1, Math.hypot(maxX - minX + 1, maxY - minY + 1));
  const ribbonToDiagonalRatio = meanRibbonWidthPx / partDiagonalPx;

  return {
    inkAreaPx,
    boundaryPerimeterPx,
    meanRibbonWidthPx,
    partDiagonalPx,
    ribbonToDiagonalRatio,
    // Caminho A: w = 2*Area/Perimetro < 8% da diagonal da peça
    isStrokeDominated: ribbonToDiagonalRatio < 0.08,
  };
}

/**
 * Caminho A — Afinamento Morfológico de Zhang-Suen (Esqueletização 1-Pixel)
 * com poda de espinhos curtos (spurs) gerados por rugosidade de borda.
 */
export function zhangSuenThinning(bin: Binary, maxIter = 120, spurPruneLenPx = 3): Binary {
  const skel = thinZhangSuen(bin, maxIter);
  const { width: w, height: h } = skel;
  const img = Uint8Array.from(skel.data);

  const countNbrs = (x: number, y: number): [number, number] => {
    let c = 0;
    let lastN = -1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && img[ny * w + nx] === 1) {
          c++;
          lastN = ny * w + nx;
        }
      }
    }
    return [c, lastN];
  };

  // Remove pequenos espinhos (ramos terminais <= spurPruneLenPx que saem de junções grau >= 3)
  for (let pass = 0; pass < spurPruneLenPx; pass++) {
    const toClear: number[] = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        if (img[idx] !== 1) continue;
        const [deg, nIdx] = countNbrs(x, y);
        if (deg === 1 && nIdx >= 0) {
          const nx = nIdx % w;
          const ny = (nIdx - nx) / w;
          const [nDeg] = countNbrs(nx, ny);
          if (nDeg >= 3) {
            toClear.push(idx);
          }
        }
      }
    }
    if (toClear.length === 0) break;
    for (const idx of toClear) img[idx] = 0;
  }

  return { width: w, height: h, data: img };
}

/** Calcula o perímetro de uma cadeia de pontos. */
export function contourPerimeter(pts: PxPoint[], closed: boolean): number {
  const n = pts.length;
  if (n < 2) return 0;
  let perim = 0;
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const p0 = pts[i]!;
    const p1 = pts[(i + 1) % n]!;
    perim += Math.hypot(p1.x - p0.x, p1.y - p0.y);
  }
  return perim;
}

/** Ponto mais próximo sobre uma polilinha (fechada ou aberta). */
function closestPointOnChain(
  p: PxPoint,
  chain: PxPoint[],
  closed: boolean,
): { pt: PxPoint; dist: number } {
  const n = chain.length;
  if (n === 0) return { pt: p, dist: Infinity };
  if (n === 1) return { pt: chain[0]!, dist: Math.hypot(p.x - chain[0]!.x, p.y - chain[0]!.y) };

  let bestDistSq = Infinity;
  let bestX = chain[0]!.x;
  let bestY = chain[0]!.y;
  const segCount = closed ? n : n - 1;

  for (let i = 0; i < segCount; i++) {
    const a = chain[i]!;
    const b = chain[(i + 1) % n]!;
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

/** Teste de ponto dentro de polígono fechado (ray-casting). */
function isPointInsidePolygon(p: PxPoint, poly: PxPoint[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x,
      yi = poly[i]!.y;
    const xj = poly[j]!.x,
      yj = poly[j]!.y;
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Caminho B — Colapso Topológico Pai-Filho e Filtro de Contornos Paralelos (`collapseParallelRibbons`)
 * + Varredura Espacial Final Anti-Duplicata (< 2.5x espessura média do traço).
 *
 * Se dois contornos fechados ou abertos C1 e C2 têm C2 dentro de C1 (ou correndo paralelo a C1)
 * a uma distância média d_média <= 6% da diagonal global da peça (ou razão de perímetro entre 0.70 e 1.00
 * quando pertencem a um traço), funde ambos em 1 único contorno central m_i = (p_i + q_i)/2
 * e destrói imediatamente a cópia interna/paralela.
 */
export function collapseParallelRibbons(
  contours: ExtractedContourC[],
  options: {
    globalDiagonalPx: number;
    typicalStrokeWidthPx: number;
    isSilhouetteMode?: boolean;
    hasManualTwinOverrides?: boolean;
    hasOtherStrokes?: boolean;
  },
): { contours: ExtractedContourC[]; fusionLog: TwinFusionRecord[] } {
  if (contours.length <= 1) return { contours, fusionLog: [] };

  const fusionLog: TwinFusionRecord[] = [];
  const w0 = Math.max(1, options.typicalStrokeWidthPx);
  const diag = Math.max(20, options.globalDiagonalPx);
  const maxRibbonDistByDiag = 0.06 * diag; // 6% da diagonal global da peça
  const maxAntiDuplicateDist = 2.5 * w0; // 2.5x a espessura média do traço

  // Ordena por área/perímetro decrescente
  const sorted = [...contours].sort((a, b) => {
    const pa = contourPerimeter(a.pts, a.closed);
    const pb = contourPerimeter(b.pts, b.closed);
    return pb - pa;
  });

  const consumed = new Set<string>();
  const result: ExtractedContourC[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const c1 = sorted[i]!;
    if (consumed.has(c1.id)) continue;

    // Preserva pares que já foram explicitamente marcados como ambíguos ou com override manual do usuário
    if (c1.ambiguousTwinId || options.hasManualTwinOverrides) {
      result.push(c1);
      continue;
    }

    const perim1 = contourPerimeter(c1.pts, c1.closed);
    let mergedContour: ExtractedContourC = c1;

    for (let j = i + 1; j < sorted.length; j++) {
      const c2 = sorted[j]!;
      if (consumed.has(c2.id) || c2.ambiguousTwinId) continue;
      if (c1.closed !== c2.closed) continue;

      const perim2 = contourPerimeter(c2.pts, c2.closed);
      const perimRatio = perim2 / Math.max(1e-6, perim1);

      // Amostra pontos de c2 para medir a distância até c1
      const step2 = Math.max(1, Math.floor(c2.pts.length / 120));
      let distSum2to1 = 0;
      let count2 = 0;
      const dists: number[] = [];

      for (let k = 0; k < c2.pts.length; k += step2) {
        const { dist } = closestPointOnChain(c2.pts[k]!, mergedContour.pts, mergedContour.closed);
        distSum2to1 += dist;
        dists.push(dist);
        count2++;
      }
      const dMean2to1 = distSum2to1 / Math.max(1, count2);

      // E amostra pontos de c1 até c2 para garantir paralelismo bidirecional
      const step1 = Math.max(1, Math.floor(mergedContour.pts.length / 120));
      let distSum1to2 = 0;
      let count1 = 0;
      for (let k = 0; k < mergedContour.pts.length; k += step1) {
        const { dist } = closestPointOnChain(mergedContour.pts[k]!, c2.pts, c2.closed);
        distSum1to2 += dist;
        count1++;
      }
      const dMean1to2 = distSum1to2 / Math.max(1, count1);
      const dMean = 0.5 * (dMean2to1 + dMean1to2);

      const dVariance =
        dists.reduce((acc, d) => acc + (d - dMean2to1) ** 2, 0) / Math.max(1, dists.length);
      const dStd = Math.sqrt(dVariance);

      // Dois contornos são paralelos se o desvio padrão da distância entre eles for baixo
      const isParallelShape = dStd <= Math.max(2.0, 0.42 * dMean);
      if (!isParallelShape) continue;

      // Verifica se c2 está contido em c1 (para contornos fechados)
      const isContained =
        !c1.closed || isPointInsidePolygon(c2.pts[0]!, mergedContour.pts);
      if (c1.closed && !isContained) continue;

      // Caso 1: Duplicata coincidente ou quase coincidente
      if (dMean <= Math.max(1.5, 0.45 * w0)) {
        consumed.add(c2.id);
        fusionLog.push({
          outerContourId: mergedContour.id,
          innerContourId: c2.id,
          mergedContourId: mergedContour.id,
          reason: "coincident_duplicate",
          q: dMean / w0,
          bandWidthPx: dMean,
          typicalStrokeWidthPx: w0,
        });
        continue;
      }

      // Em modo SILHUETA pura (ex: arruela sólida G3 ou chapa com furos), não colapsa bordas distantes
      if (options.isSilhouetteMode && dMean > 2.2 * w0) {
        continue;
      }

      // Caso 2: Duas paredes do mesmo traço!
      // Condição A: d_média <= 6% da diagonal global da peça E compatível com a espessura do traço
      // Condição B: razão de perímetro entre 0.70 e 1.00 E distância < 2.5x espessura média do traço
      const midPerim = 0.5 * (perim1 + perim2);
      const approxMidRadius = midPerim / (2 * Math.PI);
      const qRelClosed = c1.closed ? dMean / Math.max(1, approxMidRadius) : 0;

      const withinStrokeScale = options.hasOtherStrokes
        ? dMean <= 2.2 * w0
        : dMean <= Math.max(maxRibbonDistByDiag, maxAntiDuplicateDist);

      const isTwinWall =
        withinStrokeScale &&
        (!c1.closed || qRelClosed <= 0.21) &&
        (dMean <= maxRibbonDistByDiag || (perimRatio >= 0.7 && perimRatio <= 1.0)) &&
        dMean <= maxAntiDuplicateDist;

      if (isTwinWall) {
        // Fusão obrigatória na linha central m_i = (p_i + q_i) / 2
        const centerPts: PxPoint[] = mergedContour.pts.map((p) => {
          const { pt: q } = closestPointOnChain(p, c2.pts, c2.closed);
          return {
            x: 0.5 * (p.x + q.x),
            y: 0.5 * (p.y + q.y),
          };
        });

        consumed.add(c2.id);
        const newArea = mergedContour.closed ? polygonArea(centerPts) : 0;
        mergedContour = {
          ...mergedContour,
          pts: centerPts,
          area: newArea,
          localWidthPx: dMean,
          provenance: {
            ...mergedContour.provenance,
            meanStrokeWidthPx: dMean,
            hierarchyRole: mergedContour.closed ? "centerline" : "open_stroke",
          },
        };

        fusionLog.push({
          outerContourId: c1.id,
          innerContourId: c2.id,
          mergedContourId: mergedContour.id,
          reason: "parallel_twin_stroke",
          q: dMean / w0,
          bandWidthPx: dMean,
          typicalStrokeWidthPx: w0,
        });
      }
    }

    result.push(mergedContour);
  }

  // Atualiza a flag `hole` na hierarquia final: se um contorno fechado está dentro do maior contorno fechado, é furo!
  if (result.length >= 2) {
    const closedResults = result.filter((c) => c.closed);
    if (closedResults.length >= 2) {
      const outerMain = closedResults.reduce((best, cur) => (cur.area > best.area ? cur : best));
      for (const c of result) {
        if (c.id !== outerMain.id && c.closed && c.pts.length >= 3) {
          if (isPointInsidePolygon(c.pts[0]!, outerMain.pts)) {
            c.hole = true;
          }
        }
      }
    }
  }

  return { contours: result, fusionLog };
}

/* ========================================================================== */
/* MOTOR 2 — CONSTRUTOR DE FUROS, CÍRCULOS E OVAIS (ZERO OCTÓGONOS!)          */
/* ========================================================================== */

/**
 * 1. Suavização Sem Encolhimento de Taubin λ/μ (`taubinSmoothPoints`)
 * Aplica 4 iterações com λ = 0.50 e μ = -0.52 sobre TODOS os pontos densos do contorno
 * para eliminar os degraus quadrados dos pixels sem encolher o raio.
 */
export function taubinSmoothPoints(
  pts: PxPoint[],
  closed: boolean,
  iterations = 4,
  lambda = 0.5,
  mu = -0.52,
): PxPoint[] {
  const n = pts.length;
  if (n < 4) return pts.map((p) => ({ x: p.x, y: p.y }));

  let cur = pts.map((p) => ({ x: p.x, y: p.y }));
  const next = pts.map((p) => ({ x: p.x, y: p.y }));

  const applyPass = (src: PxPoint[], dst: PxPoint[], weight: number) => {
    for (let i = 0; i < n; i++) {
      if (!closed && (i === 0 || i === n - 1)) {
        dst[i] = { x: src[i]!.x, y: src[i]!.y };
        continue;
      }
      const prevPt = src[(i - 1 + n) % n]!;
      const currPt = src[i]!;
      const nextPt = src[(i + 1) % n]!;
      const lapX = 0.5 * (prevPt.x + nextPt.x) - currPt.x;
      const lapY = 0.5 * (prevPt.y + nextPt.y) - currPt.y;
      dst[i] = {
        x: currPt.x + weight * lapX,
        y: currPt.y + weight * lapY,
      };
    }
  };

  for (let it = 0; it < iterations; it++) {
    applyPass(cur, next, lambda);
    applyPass(next, cur, mu);
  }

  return cur;
}

/**
 * Constrói uma Elipse / Oval de 4 Centros usando o método clássico de engenharia:
 * gera 4 entidades nativas `arc` (`ARC`) conectadas tangencialmente (G1 exata)
 * passando pelos 4 vértices extremos dos semi-eixos `a` (maior) e `b` (menor).
 */
export function buildFourCenterOvalArcs(params: {
  cx: number;
  cy: number;
  a: number;
  b: number;
  theta: number;
  hole: boolean;
}): Prim[] {
  const { cx, cy, hole } = params;
  const a = Math.max(params.a, params.b);
  const b = Math.min(params.a, params.b);
  const theta = params.a >= params.b ? params.theta : params.theta + Math.PI / 2;

  if (a - b < 1e-3) {
    return [
      {
        kind: "circle",
        cx,
        cy,
        r: 0.5 * (a + b),
        hole,
        quality: 0.98,
        status: "detectada",
        confidence: "ALTA",
        patternKind: "circle",
      },
    ];
  }

  const delta = a - b;
  // Raio ótimo das calotas das extremidades do eixo maior: R1 in (b^2/a, b)
  const r1 = 0.55 * ((b * b) / a) + 0.45 * b;
  const dx = a - r1; // > a - b = delta
  const u = Math.max(1e-4, dx - delta);
  // Condição algébrica exata de tangência interna G1: dx^2 + dy^2 = (r2 - r1)^2 = (dy + u)^2
  const dy = (dx * dx - u * u) / (2 * u);
  const r2 = b + dy;

  // Ângulo de transição α no referencial local da elipse (primeiro quadrante)
  const alpha = Math.atan2(dy, dx);

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const toWorld = (lx: number, ly: number): PxPoint => ({
    x: cx + lx * cosT - ly * sinT,
    y: cy + lx * sinT + ly * cosT,
  });

  // 4 centros no referencial local:
  // C_right = (+dx, 0), r = r1, varre [-alpha, +alpha]
  // C_top   = (0, -dy), r = r2, varre [+alpha, pi - alpha]
  // C_left  = (-dx, 0), r = r1, varre [pi - alpha, pi + alpha]
  // C_bot   = (0, +dy), r = r2, varre [pi + alpha, 2*pi - alpha]
  const rawArcs = [
    { cLocal: { x: dx, y: 0 }, r: r1, aStart: -alpha, aSweep: 2 * alpha },
    { cLocal: { x: 0, y: -dy }, r: r2, aStart: alpha, aSweep: Math.PI - 2 * alpha },
    { cLocal: { x: -dx, y: 0 }, r: r1, aStart: Math.PI - alpha, aSweep: 2 * alpha },
    { cLocal: { x: 0, y: dy }, r: r2, aStart: Math.PI + alpha, aSweep: Math.PI - 2 * alpha },
  ];

  return rawArcs.map((arcDef) => {
    const cWorld = toWorld(arcDef.cLocal.x, arcDef.cLocal.y);
    // Normaliza a0 para (-pi, pi] e define a1 = a0 + aSweep (sempre a1 > a0!)
    let a0 = (arcDef.aStart + theta) % TWO_PI;
    if (a0 > Math.PI) a0 -= TWO_PI;
    if (a0 <= -Math.PI) a0 += TWO_PI;
    const a1 = a0 + arcDef.aSweep;

    return {
      kind: "arc" as const,
      cx: cWorld.x,
      cy: cWorld.y,
      r: arcDef.r,
      a0,
      a1,
      hole,
      quality: 0.96,
      status: "convertida" as const,
      confidence: "ALTA" as const,
      patternKind: "ellipse" as const,
    };
  });
}

/**
 * Ajusta uma elipse por PCA (Momentos Centrais de 2ª Ordem + Ajuste Radial) sobre pontos densos
 * e calcula o erro relativo RMS.
 */
export function fitEllipsePCA(pts: PxPoint[]): {
  cx: number;
  cy: number;
  a: number;
  b: number;
  theta: number;
  rmsErrorRel: number;
  maxErrorPx: number;
  rmsErrorPx: number;
} | null {
  const n = pts.length;
  if (n < 12) return null;

  // Centroide baseado no comprimento de arco para não enviesar por densidade de pontos
  let cx = 0,
    cy = 0,
    totalLen = 0;
  for (let i = 0; i < n; i++) {
    const p0 = pts[i]!;
    const p1 = pts[(i + 1) % n]!;
    const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    cx += 0.5 * (p0.x + p1.x) * segLen;
    cy += 0.5 * (p0.y + p1.y) * segLen;
    totalLen += segLen;
  }
  if (totalLen < 1e-6) return null;
  cx /= totalLen;
  cy /= totalLen;

  let sxx = 0,
    syy = 0,
    sxy = 0;
  for (let i = 0; i < n; i++) {
    const p0 = pts[i]!;
    const p1 = pts[(i + 1) % n]!;
    const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const dx = 0.5 * (p0.x + p1.x) - cx;
    const dy = 0.5 * (p0.y + p1.y) - cy;
    sxx += dx * dx * segLen;
    syy += dy * dy * segLen;
    sxy += dx * dy * segLen;
  }
  sxx /= totalLen;
  syy /= totalLen;
  sxy /= totalLen;

  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  // Estima semi-eixos a e b por mínimos quadrados algébricos nos eixos principais (u^2/a^2 + v^2/b^2 = 1)
  let sumU2 = 0,
    sumV2 = 0,
    sumU4 = 0,
    sumV4 = 0,
    sumU2V2 = 0;
  for (const p of pts) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const u = dx * cosT + dy * sinT;
    const v = -dx * sinT + dy * cosT;
    const u2 = u * u;
    const v2 = v * v;
    sumU2 += u2;
    sumV2 += v2;
    sumU4 += u2 * u2;
    sumV4 += v2 * v2;
    sumU2V2 += u2 * v2;
  }

  const det = sumU4 * sumV4 - sumU2V2 * sumU2V2;
  let a = Math.sqrt(Math.max(1, 2 * sxx));
  let b = Math.sqrt(Math.max(1, 2 * syy));
  if (Math.abs(det) > 1e-6) {
    const invA2 = (sumU2 * sumV4 - sumV2 * sumU2V2) / det;
    const invB2 = (sumV2 * sumU4 - sumU2 * sumU2V2) / det;
    if (invA2 > 1e-9 && invB2 > 1e-9) {
      a = 1 / Math.sqrt(invA2);
      b = 1 / Math.sqrt(invB2);
    }
  }

  let finalTheta = theta;
  if (b > a) {
    const tmp = a;
    a = b;
    b = tmp;
    finalTheta += Math.PI / 2;
  }

  const cosF = Math.cos(finalTheta);
  const sinF = Math.sin(finalTheta);
  let sumSqErr = 0;
  let maxErrorPx = 0;
  for (const p of pts) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const u = dx * cosF + dy * sinF;
    const v = -dx * sinF + dy * cosF;
    const norm = Math.sqrt((u * u) / (a * a) + (v * v) / (b * b));
    const rPt = Math.hypot(dx, dy);
    const rEllipse = norm > 1e-6 ? rPt / norm : a;
    const err = Math.abs(rPt - rEllipse);
    if (err > maxErrorPx) maxErrorPx = err;
    sumSqErr += err * err;
  }

  const rmsErrorPx = Math.sqrt(sumSqErr / n);
  const meanAxis = 0.5 * (a + b);
  const rmsErrorRel = rmsErrorPx / Math.max(1, meanAxis);

  return {
    cx,
    cy,
    a,
    b,
    theta: finalTheta,
    rmsErrorRel,
    maxErrorPx,
    rmsErrorPx,
  };
}

/* ========================================================================== */
/* MOTOR 3 — CONSTRUTOR DE CURVAS COMPOSTAS (`fitBiarcAndLineChain`)          */
/* ========================================================================== */

/**
 * Detecta APENAS quinas vivas reais (deflexão > 35° em janela W = max(6, floor(0.025 * N))).
 * Distingue picos agudos localizados da curvatura suave constante de um círculo/arco!
 */
export function detectStrictSharpCorners(
  smoothedPts: PxPoint[],
  closed: boolean,
  minCornerAngleDeg = 35,
): number[] {
  const n = smoothedPts.length;
  if (n < 12) return closed ? [] : [0, Math.max(0, n - 1)];

  const W = Math.max(6, Math.min(Math.floor(n / 4), Math.floor(0.025 * n)));
  const anglesDeg = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    if (!closed && (i < W || i >= n - W)) {
      anglesDeg[i] = 0;
      continue;
    }
    const pPrev = smoothedPts[(i - W + n) % n]!;
    const pCurr = smoothedPts[i]!;
    const pNext = smoothedPts[(i + W) % n]!;

    const v1x = pCurr.x - pPrev.x;
    const v1y = pCurr.y - pPrev.y;
    const v2x = pNext.x - pCurr.x;
    const v2y = pNext.y - pCurr.y;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    if (l1 < 1e-6 || l2 < 1e-6) continue;

    const dot = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)));
    anglesDeg[i] = (Math.acos(dot) * 180) / Math.PI;
  }

  // Encontra máximos locais acima de 35° que sejam picos reais (e não curvatura constante de um círculo pequeno)
  const rawPeaks: { idx: number; angle: number }[] = [];
  const suppressRadius = Math.max(4, Math.floor(W * 0.85));

  for (let i = 0; i < n; i++) {
    const val = anglesDeg[i]!;
    if (val <= minCornerAngleDeg) continue;

    let isLocalMax = true;
    for (let d = -suppressRadius; d <= suppressRadius; d++) {
      if (d === 0) continue;
      const j = closed ? (i + d + n) % n : i + d;
      if (j < 0 || j >= n) continue;
      if (anglesDeg[j]! > val || (anglesDeg[j]! === val && d < 0)) {
        isLocalMax = false;
        break;
      }
    }
    if (!isLocalMax) continue;

    // Verifica a deflexão média nas regiões vizinhas fora do canto (em i - 2W e i + 2W).
    // Num círculo/arco suave de raio R, a deflexão é ~constante em todo o contorno (flank ~ val).
    // Numa quina viva entre retas ou curvas, a deflexão no pico é muito maior que nos flancos!
    const flankLeftIdx = closed ? (i - 2 * W + n) % n : Math.max(W, i - 2 * W);
    const flankRightIdx = closed ? (i + 2 * W) % n : Math.min(n - 1 - W, i + 2 * W);
    const flankMean = 0.5 * (anglesDeg[flankLeftIdx]! + anglesDeg[flankRightIdx]!);

    if (val >= 58 || val > flankMean * 1.85 + 8) {
      rawPeaks.push({ idx: i, angle: val });
    }
  }

  if (!closed) {
    const indices = [0, ...rawPeaks.map((p) => p.idx).filter((idx) => idx > W && idx < n - 1 - W), n - 1];
    return Array.from(new Set(indices)).sort((a, b) => a - b);
  }

  return rawPeaks.map((p) => p.idx).sort((a, b) => a - b);
}

/**
 * Calcula o arco circular EXATO que passa pelos 3 pontos (pIni, pMeio, pFim).
 * Retorna null se os 3 pontos forem colineares.
 * Garante sempre `a1 = a0 + sweepRad` com `sweepRad > 0` para o arco orientado no sentido positivo,
 * além de informar `ccw` (se o percurso pIni -> pMeio -> pFim é anti-horário no referencial da imagem).
 */
export function fitExactThreePointArc(
  pIni: PxPoint,
  pMeio: PxPoint,
  pFim: PxPoint,
): {
  cx: number;
  cy: number;
  r: number;
  a0: number;
  a1: number;
  ccw: boolean;
  sweepRad: number;
  bulge: number;
} | null {
  const ax = pIni.x,
    ay = pIni.y;
  const bx = pMeio.x,
    by = pMeio.y;
  const cxPt = pFim.x,
    cyPt = pFim.y;

  const d = 2 * (ax * (by - cyPt) + bx * (cyPt - ay) + cxPt * (ay - by));
  if (Math.abs(d) < 1e-7) return null;

  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cxPt * cxPt + cyPt * cyPt;

  const cx = (a2 * (by - cyPt) + b2 * (cyPt - ay) + c2 * (ay - by)) / d;
  const cy = (a2 * (cxPt - bx) + b2 * (ax - cxPt) + c2 * (bx - ax)) / d;
  const r = Math.hypot(ax - cx, ay - cy);
  if (!Number.isFinite(r) || r <= 0.5 || r > 1e6) return null;

  const angIni = Math.atan2(ay - cy, ax - cx);
  const angMeio = Math.atan2(by - cy, bx - cx);
  const angFim = Math.atan2(cyPt - cy, cxPt - cx);

  const normPos = (v: number) => ((v % TWO_PI) + TWO_PI) % TWO_PI;
  const ccwToMid = normPos(angMeio - angIni);
  const ccwToEnd = normPos(angFim - angIni);
  const ccw = ccwToMid <= ccwToEnd;
  const sweepRad = ccw ? ccwToEnd : normPos(angIni - angFim);

  if (sweepRad < 1e-4 || sweepRad >= TWO_PI - 1e-4) return null;

  // Em CHAMFER CAD, a entidade `arc` varre sempre no sentido positivo de `a0` para `a1 = a0 + sweepRad`
  const startBase = ccw ? angIni : angFim;
  let a0 = startBase % TWO_PI;
  if (a0 > Math.PI) a0 -= TWO_PI;
  if (a0 <= -Math.PI) a0 += TWO_PI;
  const a1 = a0 + sweepRad;
  const signedTheta = ccw ? sweepRad : -sweepRad;
  const bulge = Math.tan(signedTheta / 4);

  return {
    cx,
    cy,
    r,
    a0,
    a1,
    ccw,
    sweepRad,
    bulge,
  };
}

export interface ChainPrimitiveSpan {
  kind: "line" | "arc";
  p0: PxPoint;
  p1: PxPoint;
  cx?: number;
  cy?: number;
  r?: number;
  a0?: number;
  a1?: number;
  ccw?: boolean;
  bulge: number;
  maxDevPx: number;
  rmsDevPx: number;
  supportPoints: number;
}

function perpDistPointToSegment(p: PxPoint, a: PxPoint, b: PxPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function perpDistPointToInfiniteLine(p: PxPoint, a: PxPoint, b: PxPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * MOTOR 3 — Ajuste Recursivo de Cadeia de Arcos (`ARC`) e Retas (`LINE`) (`fitBiarcAndLineChain`).
 *
 * Para um trecho contínuo S entre duas quinas:
 * - Passo A (Teste Estrito de Reta): só emite `LINE` se d_max <= max(1.2 px, 0.006 * L).
 * - Passo B (Ajuste Recursivo de Arco de 3 Pontos): calcula o arco exato por (P_ini, P_meio, P_fim).
 *   Se o erro radial máximo e_arc <= τ_arc = max(2.0 px, 0.008 * L_contorno), emite 1 único `ARC` nativo.
 *   Caso contrário, divide S no ponto de maior desvio e aplica recursivamente `fitBiarcAndLineChain`.
 *   Como cada arco passa exatamente por P_ini e P_fim, a continuidade nas junções é 0.0000 mm!
 */
export function fitBiarcAndLineChain(
  span: PxPoint[],
  options: {
    contourCharacteristicLengthPx: number;
    maxArcTolPx?: number;
    depth?: number;
  },
): ChainPrimitiveSpan[] {
  const n = span.length;
  const depth = options.depth ?? 0;
  if (n < 2) return [];

  const pIni = span[0]!;
  const pFim = span[n - 1]!;
  const chordL = Math.hypot(pFim.x - pIni.x, pFim.y - pIni.y);

  // Passo A — Teste Estrito de Reta (`LINE`)
  let dMaxLine = 0;
  let sumSqLine = 0;
  let maxLineDevIdx = Math.floor(n / 2);

  for (let i = 1; i < n - 1; i++) {
    const d = perpDistPointToSegment(span[i]!, pIni, pFim);
    sumSqLine += d * d;
    if (d > dMaxLine) {
      dMaxLine = d;
      maxLineDevIdx = i;
    }
  }
  const rmsLine = Math.sqrt(sumSqLine / n);
  const strictLineTol = Math.max(1.2, 0.006 * chordL);

  if (n <= 3 || (chordL > 1e-3 && dMaxLine <= strictLineTol)) {
    return [
      {
        kind: "line",
        p0: pIni,
        p1: pFim,
        bulge: 0,
        maxDevPx: dMaxLine,
        rmsDevPx: rmsLine,
        supportPoints: n,
      },
    ];
  }

  // Passo B — Ajuste Recursivo de Arco Circular (`ARC` Nativo por 3 Pontos Exatos)
  const midIdx = Math.floor(n / 2);
  const pMeio = span[midIdx]!;
  const arc3 = fitExactThreePointArc(pIni, pMeio, pFim);

  const tauArc =
    options.maxArcTolPx ?? Math.max(2.0, 0.008 * Math.max(20, options.contourCharacteristicLengthPx));

  if (arc3) {
    let eArcMax = 0;
    let sumSqArc = 0;
    let maxArcDevIdx = midIdx;

    for (let i = 1; i < n - 1; i++) {
      const p = span[i]!;
      const radialErr = Math.abs(Math.hypot(p.x - arc3.cx, p.y - arc3.cy) - arc3.r);
      sumSqArc += radialErr * radialErr;
      if (radialErr > eArcMax) {
        eArcMax = radialErr;
        maxArcDevIdx = i;
      }
    }
    const rmsArc = Math.sqrt(sumSqArc / n);

    if (eArcMax <= tauArc || (depth >= 6 && eArcMax <= dMaxLine)) {
      return [
        {
          kind: "arc",
          p0: pIni,
          p1: pFim,
          cx: arc3.cx,
          cy: arc3.cy,
          r: arc3.r,
          a0: arc3.a0,
          a1: arc3.a1,
          ccw: arc3.ccw,
          bulge: arc3.bulge,
          maxDevPx: eArcMax,
          rmsDevPx: rmsArc,
          supportPoints: n,
        },
      ];
    }

    // Se e_arc > τ_arc (ex: parábola, espiral ou curva em S), divide no ponto de maior desvio (ou meio) e recorre
    if (n >= 6 && depth < 7) {
      const minSplit = Math.max(2, Math.floor(n * 0.2));
      const maxSplit = Math.min(n - 3, Math.ceil(n * 0.8));
      const splitIdx =
        maxArcDevIdx >= minSplit && maxArcDevIdx <= maxSplit ? maxArcDevIdx : midIdx;

      const left = fitBiarcAndLineChain(span.slice(0, splitIdx + 1), {
        ...options,
        depth: depth + 1,
      });
      const right = fitBiarcAndLineChain(span.slice(splitIdx), {
        ...options,
        depth: depth + 1,
      });
      return [...left, ...right];
    }

    // Mesmo no limite de recursão, prefere emitir o arco de 3 pontos se ele explicar melhor a curva do que uma reta
    if (eArcMax < dMaxLine) {
      return [
        {
          kind: "arc",
          p0: pIni,
          p1: pFim,
          cx: arc3.cx,
          cy: arc3.cy,
          r: arc3.r,
          a0: arc3.a0,
          a1: arc3.a1,
          ccw: arc3.ccw,
          bulge: arc3.bulge,
          maxDevPx: eArcMax,
          rmsDevPx: rmsArc,
          supportPoints: n,
        },
      ];
    }
  }

  // Se pIni e pFim coincidirem (laço fechado sem quinas que caiu aqui) ou 3 pontos forem colineares numa curva em S:
  // divide ao meio para que cada metade possa ser ajustada por arcos de 3 pontos!
  if (n >= 6 && depth < 7) {
    const splitIdx =
      maxLineDevIdx >= 2 && maxLineDevIdx <= n - 3 ? maxLineDevIdx : midIdx;
    const left = fitBiarcAndLineChain(span.slice(0, splitIdx + 1), {
      ...options,
      depth: depth + 1,
    });
    const right = fitBiarcAndLineChain(span.slice(splitIdx), {
      ...options,
      depth: depth + 1,
    });
    return [...left, ...right];
  }

  return [
    {
      kind: "line",
      p0: pIni,
      p1: pFim,
      bulge: 0,
      maxDevPx: dMaxLine,
      rmsDevPx: rmsLine,
      supportPoints: n,
    },
  ];
}

function normalizeSignedAngle(a: number): number {
  let r = a % TWO_PI;
  if (r > Math.PI) r -= TWO_PI;
  if (r <= -Math.PI) r += TWO_PI;
  return r;
}

/**
 * Fusão Pós-Ajuste (`mergeCollinearAndCocircular`):
 * - Funde retas consecutivas se a diferença de ângulo entre elas for <= 2.5°.
 * - Funde arcos consecutivos se seus centros e raios diferirem em < 3% e tiverem o mesmo sentido de curvatura.
 */
export function mergeCollinearAndCocircularSpans(
  spans: ChainPrimitiveSpan[],
  closed: boolean,
): ChainPrimitiveSpan[] {
  if (spans.length <= 1) return spans;
  const maxLineAngleRad = (2.5 * Math.PI) / 180;
  const out: ChainPrimitiveSpan[] = [];

  const tryMergeTwo = (
    a: ChainPrimitiveSpan,
    b: ChainPrimitiveSpan,
  ): ChainPrimitiveSpan | null => {
    // 1. Duas retas consecutivas com diferença angular <= 2.5°
    if (a.kind === "line" && b.kind === "line") {
      const angA = Math.atan2(a.p1.y - a.p0.y, a.p1.x - a.p0.x);
      const angB = Math.atan2(b.p1.y - b.p0.y, b.p1.x - b.p0.x);
      const diff = Math.abs(normalizeSignedAngle(angB - angA));
      const midOff = perpDistPointToInfiniteLine(a.p1, a.p0, b.p1);
      const combinedChord = Math.hypot(b.p1.x - a.p0.x, b.p1.y - a.p0.y);
      if (diff <= maxLineAngleRad && midOff <= Math.max(1.5, 0.006 * combinedChord)) {
        return {
          kind: "line",
          p0: a.p0,
          p1: b.p1,
          bulge: 0,
          maxDevPx: Math.max(a.maxDevPx, b.maxDevPx, midOff),
          rmsDevPx: 0.5 * (a.rmsDevPx + b.rmsDevPx),
          supportPoints: a.supportPoints + b.supportPoints,
        };
      }
    }

    // 2. Dois arcos consecutivos de mesmo sentido com centros e raios diferindo em < 3%
    if (
      a.kind === "arc" &&
      b.kind === "arc" &&
      a.ccw === b.ccw &&
      a.cx !== undefined &&
      a.cy !== undefined &&
      a.r !== undefined &&
      b.cx !== undefined &&
      b.cy !== undefined &&
      b.r !== undefined
    ) {
      const meanR = 0.5 * (a.r + b.r);
      const rDiffRatio = Math.abs(a.r - b.r) / Math.max(1, meanR);
      const cDiffRatio = Math.hypot(a.cx - b.cx, a.cy - b.cy) / Math.max(1, meanR);
      if (rDiffRatio < 0.03 && cDiffRatio < 0.03) {
        const mergedArc = fitExactThreePointArc(a.p0, a.p1, b.p1);
        if (mergedArc && mergedArc.ccw === a.ccw && mergedArc.sweepRad < Math.PI * 1.85) {
          return {
            kind: "arc",
            p0: a.p0,
            p1: b.p1,
            cx: mergedArc.cx,
            cy: mergedArc.cy,
            r: mergedArc.r,
            a0: mergedArc.a0,
            a1: mergedArc.a1,
            ccw: mergedArc.ccw,
            bulge: mergedArc.bulge,
            maxDevPx: Math.max(a.maxDevPx, b.maxDevPx),
            rmsDevPx: 0.5 * (a.rmsDevPx + b.rmsDevPx),
            supportPoints: a.supportPoints + b.supportPoints,
          };
        }
      }
    }

    return null;
  };

  for (const s of spans) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push({ ...s });
      continue;
    }
    const merged = tryMergeTwo(prev, s);
    if (merged) {
      out[out.length - 1] = merged;
    } else {
      out.push({ ...s });
    }
  }

  if (closed && out.length >= 2) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    const mergedWrap = tryMergeTwo(last, first);
    if (mergedWrap) {
      out[0] = mergedWrap;
      out.pop();
    }
  }

  return out;
}

/**
 * Reconstrói um contorno único (fechado ou aberto) aplicando na ordem:
 * 1) Suavização de Taubin λ/μ (4 iterações, λ = 0.50, μ = -0.52) nos pontos densos.
 * 2) Motor 2 — Teste 1: Círculo nativo (`CIRCLE`) quando fechado sem quinas vivas e RMS/R <= 0.14.
 * 3) Motor 2 — Teste 2: Furo/Contorno Oval -> Oval de 4 Centros (4 `ARC`s tangentes) quando erro elíptico <= 0.12.
 * 4) Motor 3 — Decomposição em quinas > 35° + `fitBiarcAndLineChain` + `mergeCollinearAndCocircularSpans`.
 */
export function constructShapeFromContour(
  contour: Contour,
  options: {
    preferCircles?: boolean;
    maxArcTolPx?: number;
  } = {},
): {
  prims: Prim[];
  patternKind:
    | "circle"
    | "ellipse"
    | "regular_polygon"
    | "rounded_rect"
    | "oblong_slot"
    | "mixed_closed"
    | "open_chain";
  maxDevPx: number;
  rmsDevPx: number;
} {
  const rawPts = contour.pts;
  if (rawPts.length < 3) {
    return { prims: [], patternKind: "open_chain", maxDevPx: 0, rmsDevPx: 0 };
  }

  // 1. Suavização Sem Encolhimento de Taubin λ/μ (4 iterações, λ=0.50, μ=-0.52)
  const smoothed = taubinSmoothPoints(rawPts, contour.closed, 4, 0.5, -0.52);

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of smoothed) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const contourDiagPx = Math.max(10, Math.hypot(maxX - minX, maxY - minY));

  // Detecta quinas vivas estritas (> 35°)
  const sharpCornerIndices = detectStrictSharpCorners(smoothed, contour.closed, 35);

  if (contour.closed && smoothed.length >= 8 && options.preferCircles !== false) {
    // Verifica se as quinas detectadas formam um polígono puramente retilíneo (ex: quadrado, retângulo, hexágono/octógono grande)
    let isStrictStraightPolygon = false;
    if (sharpCornerIndices.length >= 3 && sharpCornerIndices.length <= 12) {
      let allSpansStraight = true;
      for (let k = 0; k < sharpCornerIndices.length; k++) {
        const sIdx = sharpCornerIndices[k]!;
        const eIdx = sharpCornerIndices[(k + 1) % sharpCornerIndices.length]!;
        const span =
          sIdx < eIdx
            ? smoothed.slice(sIdx, eIdx + 1)
            : [...smoothed.slice(sIdx), ...smoothed.slice(0, eIdx + 1)];
        const p0 = span[0]!;
        const p1 = span[span.length - 1]!;
        const chord = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        let dMax = 0;
        for (let m = 1; m < span.length - 1; m++) {
          const d = perpDistPointToSegment(span[m]!, p0, p1);
          if (d > dMax) dMax = d;
        }
        // Para um polígono retilíneo real, cada lado deve ter comprimento significativo e ser estritamente reto
        if (chord < 14 || dMax > Math.max(1.1, 0.005 * chord)) {
          allSpansStraight = false;
          break;
        }
      }
      if (allSpansStraight) {
        isStrictStraightPolygon = true;
      }
    }

    if (!isStrictStraightPolygon) {
      // MOTOR 2 — Teste 1: Conversão Direta em `CIRCLE` Nativo (RMS / R <= 0.14)
      const circleFit = fitCircleTaubinGaussNewton(smoothed);
      if (circleFit && circleFit.r >= 1.5) {
        const relRms = circleFit.rmsDev / Math.max(1, circleFit.r);
        const spanDeg = (circleFit.spanRad * 180) / Math.PI;
        // Só aceita como círculo direto se não for uma elipse fortemente alongada (onde relRms > 0.075 e ajuste elíptico é muito superior)
        const ellipseCandidate = relRms > 0.055 ? fitEllipsePCA(smoothed) : null;
        const isStronglyElongatedOval =
          ellipseCandidate !== null &&
          ellipseCandidate.b / Math.max(1, ellipseCandidate.a) <= 0.86 &&
          ellipseCandidate.rmsErrorRel <= relRms * 0.55;

        if (
          !isStronglyElongatedOval &&
          spanDeg >= 300 &&
          relRms <= 0.14 &&
          sharpCornerIndices.length <= 2
        ) {
          return {
            prims: [
              {
                kind: "circle",
                cx: circleFit.cx,
                cy: circleFit.cy,
                r: circleFit.r,
                hole: contour.hole,
                quality: Math.max(0.8, 1 - relRms),
                status: "detectada",
                dev: circleFit.maxDev,
                rmsDev: circleFit.rmsDev,
                confidence: relRms <= 0.06 ? "ALTA" : "MEDIA",
                supportPoints: rawPts.length,
                spanDeg,
                patternKind: "circle",
              },
            ],
            patternKind: "circle",
            maxDevPx: circleFit.maxDev,
            rmsDevPx: circleFit.rmsDev,
          };
        }
      }

      // MOTOR 2 — Teste 2: Furos / Contornos Ovais ou Elípticos -> 4 `ARC`s Tangentes (Oval de 4 Centros)
      if (sharpCornerIndices.length <= 1 && smoothed.length >= 16) {
        const ellipseFit = fitEllipsePCA(smoothed);
        if (
          ellipseFit &&
          ellipseFit.b >= 2.0 &&
          ellipseFit.b / Math.max(1, ellipseFit.a) <= 0.94 &&
          ellipseFit.rmsErrorRel <= 0.12
        ) {
          const ovalArcs = buildFourCenterOvalArcs({
            cx: ellipseFit.cx,
            cy: ellipseFit.cy,
            a: ellipseFit.a,
            b: ellipseFit.b,
            theta: ellipseFit.theta,
            hole: contour.hole,
          });
          // Anexa ellipseParams no primeiro arco para permitir ELLIPSE nativa se o usuário escolher modo CAD
          if (ovalArcs[0]) {
            ovalArcs[0].ellipseParams = {
              cx: ellipseFit.cx,
              cy: ellipseFit.cy,
              rx: ellipseFit.a,
              ry: ellipseFit.b,
              rotation: ellipseFit.theta,
            };
          }
          return {
            prims: ovalArcs,
            patternKind: "ellipse",
            maxDevPx: ellipseFit.maxErrorPx,
            rmsDevPx: ellipseFit.rmsErrorPx,
          };
        }
      }
    }
  }

  // MOTOR 3 — Construtor de Curvas Compostas por Ajuste Recursivo de `ARC` e `LINE`
  const rawSpans: ChainPrimitiveSpan[] = [];

  if (contour.closed) {
    if (sharpCornerIndices.length === 0) {
      // Contorno fechado suave sem quinas: divide em 2 meios-contornos nos extremos opostos para ajustar bi-arcos fechados
      const half = Math.floor(smoothed.length / 2);
      const span1 = smoothed.slice(0, half + 1);
      const span2 = [...smoothed.slice(half), smoothed[0]!];
      rawSpans.push(
        ...fitBiarcAndLineChain(span1, {
          contourCharacteristicLengthPx: contourDiagPx,
          maxArcTolPx: options.maxArcTolPx,
        }),
        ...fitBiarcAndLineChain(span2, {
          contourCharacteristicLengthPx: contourDiagPx,
          maxArcTolPx: options.maxArcTolPx,
        }),
      );
    } else if (sharpCornerIndices.length === 1) {
      const cIdx = sharpCornerIndices[0]!;
      const ordered = [...smoothed.slice(cIdx), ...smoothed.slice(0, cIdx + 1)];
      const half = Math.floor(ordered.length / 2);
      rawSpans.push(
        ...fitBiarcAndLineChain(ordered.slice(0, half + 1), {
          contourCharacteristicLengthPx: contourDiagPx,
          maxArcTolPx: options.maxArcTolPx,
        }),
        ...fitBiarcAndLineChain(ordered.slice(half), {
          contourCharacteristicLengthPx: contourDiagPx,
          maxArcTolPx: options.maxArcTolPx,
        }),
      );
    } else {
      for (let i = 0; i < sharpCornerIndices.length; i++) {
        const sIdx = sharpCornerIndices[i]!;
        const eIdx = sharpCornerIndices[(i + 1) % sharpCornerIndices.length]!;
        const span =
          sIdx < eIdx
            ? smoothed.slice(sIdx, eIdx + 1)
            : [...smoothed.slice(sIdx), ...smoothed.slice(0, eIdx + 1)];
        rawSpans.push(
          ...fitBiarcAndLineChain(span, {
            contourCharacteristicLengthPx: contourDiagPx,
            maxArcTolPx: options.maxArcTolPx,
          }),
        );
      }
    }
  } else {
    const breaks =
      sharpCornerIndices.length >= 2 ? sharpCornerIndices : [0, smoothed.length - 1];
    for (let i = 0; i < breaks.length - 1; i++) {
      const sIdx = breaks[i]!;
      const eIdx = breaks[i + 1]!;
      const span = smoothed.slice(sIdx, eIdx + 1);
      rawSpans.push(
        ...fitBiarcAndLineChain(span, {
          contourCharacteristicLengthPx: contourDiagPx,
          maxArcTolPx: options.maxArcTolPx,
        }),
      );
    }
  }

  const mergedSpans = mergeCollinearAndCocircularSpans(rawSpans, contour.closed);

  // Se após fundir arcos cocirculares um contorno fechado virou 1 ou 2 arcos do mesmo círculo, converte em 1 CIRCLE!
  if (
    contour.closed &&
    mergedSpans.length >= 1 &&
    mergedSpans.length <= 3 &&
    mergedSpans.every((s) => s.kind === "arc" && s.cx !== undefined && s.r !== undefined)
  ) {
    const r0 = mergedSpans[0]!.r!;
    const cx0 = mergedSpans[0]!.cx!;
    const cy0 = mergedSpans[0]!.cy!;
    const allSameCircle = mergedSpans.every(
      (s) =>
        Math.abs(s.r! - r0) / Math.max(1, r0) < 0.05 &&
        Math.hypot(s.cx! - cx0, s.cy! - cy0) / Math.max(1, r0) < 0.05,
    );
    if (allSameCircle) {
      return {
        prims: [
          {
            kind: "circle",
            cx: cx0,
            cy: cy0,
            r: r0,
            hole: contour.hole,
            quality: 0.95,
            status: "detectada",
            dev: Math.max(...mergedSpans.map((s) => s.maxDevPx)),
            rmsDev: mergedSpans[0]!.rmsDevPx,
            confidence: "ALTA",
            supportPoints: rawPts.length,
            spanDeg: 360,
            patternKind: "circle",
          },
        ],
        patternKind: "circle",
        maxDevPx: Math.max(...mergedSpans.map((s) => s.maxDevPx)),
        rmsDevPx: mergedSpans[0]!.rmsDevPx,
      };
    }
  }

  let maxDevPx = 0;
  let sumSq = 0;
  for (const s of mergedSpans) {
    if (s.maxDevPx > maxDevPx) maxDevPx = s.maxDevPx;
    sumSq += s.rmsDevPx * s.rmsDevPx;
  }
  const rmsDevPx = mergedSpans.length > 0 ? Math.sqrt(sumSq / mergedSpans.length) : 0;

  const lineCount = mergedSpans.filter((s) => s.kind === "line").length;
  const arcCount = mergedSpans.filter((s) => s.kind === "arc").length;
  let patternKind:
    | "circle"
    | "ellipse"
    | "regular_polygon"
    | "rounded_rect"
    | "oblong_slot"
    | "mixed_closed"
    | "open_chain" = contour.closed ? "mixed_closed" : "open_chain";

  if (contour.closed && lineCount === 4 && arcCount === 4) patternKind = "rounded_rect";
  else if (contour.closed && lineCount === 2 && arcCount === 2) patternKind = "oblong_slot";
  else if (contour.closed && arcCount === 0 && lineCount >= 3) patternKind = "regular_polygon";

  const prims: Prim[] = mergedSpans.map((s) => {
    if (s.kind === "arc" && s.cx !== undefined && s.cy !== undefined && s.r !== undefined) {
      return {
        kind: "arc" as const,
        cx: s.cx,
        cy: s.cy,
        r: s.r,
        a0: s.a0!,
        a1: s.a1!,
        hole: contour.hole,
        quality: Math.max(0.75, 1 - s.rmsDevPx / Math.max(2, s.maxDevPx + 1)),
        status: "convertida" as const,
        dev: s.maxDevPx,
        rmsDev: s.rmsDevPx,
        confidence: s.maxDevPx <= 2.5 ? ("ALTA" as const) : ("MEDIA" as const),
        supportPoints: s.supportPoints,
        patternKind,
      };
    }
    return {
      kind: "line" as const,
      x1: s.p0.x,
      y1: s.p0.y,
      x2: s.p1.x,
      y2: s.p1.y,
      hole: contour.hole,
      quality: Math.max(0.75, 1 - s.rmsDevPx / Math.max(2, s.maxDevPx + 1)),
      status: "convertida" as const,
      dev: s.maxDevPx,
      rmsDev: s.rmsDevPx,
      confidence: s.maxDevPx <= 2.0 ? ("ALTA" as const) : ("MEDIA" as const),
      supportPoints: s.supportPoints,
      patternKind,
    };
  });

  return {
    prims,
    patternKind,
    maxDevPx,
    rmsDevPx,
  };
}
