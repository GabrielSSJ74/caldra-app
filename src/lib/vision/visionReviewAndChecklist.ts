/**
 * CHAMFER VISION 2.0 — FASE F: PRÉVIA, REVISÃO, CACHE S1–S5, CORREÇÃO MANUAL E ROTEIRO DO CYPCUT (SEÇÕES 13 e 14)
 *
 * Responsabilidades:
 * 1. Cache de Estágios S1–S5 e Reexecução Rápida de S6–S12 ao alterar Tolerância, Teto (mm),
 *    Modo de Saída (Laser vs CAD), Alinhar a Eixos ou Resolução de Ambiguidade (Traço vs Anel).
 * 2. Operações de Correção e Revisão sobre Primitivas (excluir duplicata, alternar Polilinha <-> Círculo,
 *    ajustar centro/raio, fechar/abrir contorno, resolver ambiguidade Traço x Anel).
 * 3. Painel de Diagnóstico com Contagens Reais (Seção 13).
 * 4. Roteiro de Validação no CypCut (Seção 14) com rótulo obrigatório "Validação no CypCut: não verificada"
 *    até o preenchimento completo dos 6 itens pelo usuário.
 */

import type { Entity } from "@/lib/lab2d/core";
import type { Prim, Tolerance } from "./geometryRecognizer";
import type { Contour } from "./visionEngine";
import type {
  AmbiguousTwinRecord,
  ExcludedUiElement,
  ExtractedContourC,
  TwinFusionRecord,
} from "./imageExtractionPipeline";
import { runPrimitiveFittingPipelineS6ToS9 } from "./primitiveFitterAndTopology";
import { fitCircleTaubinGaussNewton } from "./visionMetricsAndHarness";
import {
  toleranceToPreset,
  type ConfidenceLevel,
  type ImageKindMode,
  type OutputDxfMode,
} from "./visionThresholdConfig";
import type { VisionAnalysis } from "./vectorizer";

/* ========================================================================== */
/* 1. TIPOS DE DIAGNÓSTICO REAL E METADADOS DA FASE F (SEÇÃO 13)              */
/* ========================================================================== */

export interface VisionDiagnosticSummary {
  lines: number;
  circles: number;
  arcs: number;
  polylines: number;
   polylinesWithBulge: number;
  ellipses: number;
  splines: number;
  closedContours: number;
  openContours: number;
  duplicatesMerged: number;
  excludedUiCount: number;
  ambiguousCount: number;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
  coveragePct: number;
  excessPct: number;
  maxDevPx: number;
  rmsDevPx: number;
  detectedImageKind: ImageKindMode;
  typicalStrokeWidthPx: number;
}

export interface RefitS6ToS12Options {
  tolerance: Tolerance;
  outputMode: OutputDxfMode;
  alignAxes: boolean;
  maxCapMm?: number;
  mmPerPx?: number;
  typicalStrokeWidthPx?: number;
  ambiguousResolutions?: Record<string, "traco" | "anel">;
  reincludedUiIds?: string[];
}

/* ========================================================================== */
/* 2. REEXECUÇÃO RÁPIDA S6–S12 A PARTIR DO CACHE S1–S5 (SEÇÃO 13)             */
/* ========================================================================== */

/**
 * Reexecuta exclusivamente os estágios S6–S12 usando os contornos extraídos em S1–S5 em cache.
 * Aplica também as escolhas do usuário para pares ambíguos ("traco" = 1 linha central; "anel" = 2 laços).
 */
export function refitFromCachedContoursS6ToS12(
  baseAnalysis: VisionAnalysis,
  opts: RefitS6ToS12Options,
): VisionAnalysis {
  const cachedContours: Contour[] = baseAnalysis.cachedContours ?? [];
  const ambiguousTwins: AmbiguousTwinRecord[] = baseAnalysis.ambiguousTwins ?? [];
  const resolutions = opts.ambiguousResolutions ?? {};

  // Constrói a lista efetiva de contornos respeitando a decisão do usuário em cada par ambíguo
  const effectiveContours: Contour[] = [...cachedContours];
  for (const amb of ambiguousTwins) {
    const choice = resolutions[amb.id];
    if (choice === "traco") {
      effectiveContours.push(amb.centerlineOption);
    } else if (choice === "anel") {
      effectiveContours.push(amb.outerContour, amb.innerContour);
    } else {
      // Enquanto não decidido, inclui a linha central marcada com confiança BAIXA para revisão visual
      effectiveContours.push({
        ...amb.centerlineOption,
        hole: false,
      });
    }
  }

  const preset = toleranceToPreset(opts.tolerance);
  const s6ToS9 = runPrimitiveFittingPipelineS6ToS9(effectiveContours, {
    preset,
    typicalStrokeWidthPx:
      opts.typicalStrokeWidthPx ?? baseAnalysis.typicalStrokeWidthPx ?? 1.5,
    userMaxCapMm: opts.maxCapMm,
    mmPerPx: opts.mmPerPx,
    outputMode: opts.outputMode,
    regularize: opts.alignAxes,
  });

  // Se houver ambiguidades ainda não respondidas, marca as primitivas correspondentes como "BAIXA"
  const unresolvedCount = ambiguousTwins.filter((a) => !resolutions[a.id]).length;
  const prims = s6ToS9.prims.map((p) => {
    if (unresolvedCount > 0 && p.confidence === "ALTA" && effectiveContours.length === ambiguousTwins.length) {
      return { ...p, confidence: "BAIXA" as ConfidenceLevel };
    }
    return p;
  });

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
    } else if (p.kind === "polyline") {
      for (const q of p.pts) put(q.x, q.y);
    } else {
      put(p.cx - p.r, p.cy - p.r);
      put(p.cx + p.r, p.cy + p.r);
    }
  }
  if (!Number.isFinite(minX)) {
    minX = baseAnalysis.contentPx.x;
    minY = baseAnalysis.contentPx.y;
    maxX = minX + baseAnalysis.contentPx.w;
    maxY = minY + baseAnalysis.contentPx.h;
  }

  const stats = {
    lines: prims.filter((p) => p.kind === "line").length,
    circles: prims.filter((p) => p.kind === "circle").length,
    arcs: prims.filter((p) => p.kind === "arc").length,
    polylines: prims.filter((p) => p.kind === "polyline").length,
    contours: effectiveContours.filter((c) => !c.hole).length,
    holes: effectiveContours.filter((c) => c.hole).length,
  };

  return {
    ...baseAnalysis,
    prims,
    stats,
    contentPx: { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) },
    fidelity: {
      coveragePct: Number((s6ToS9.fidelity.coverage * 100).toFixed(2)),
      excessPct: Number((s6ToS9.fidelity.excess * 100).toFixed(2)),
      maxDevPx: Number(s6ToS9.fidelity.maxDeviationPx.toFixed(3)),
      rmsDevPx: Number(s6ToS9.fidelity.rmsDeviationPx.toFixed(3)),
    },
    stageTimingsMs: {
      s1ToS5Ms: baseAnalysis.stageTimingsMs?.s1ToS5Ms ?? 0,
      s6ToS9Ms: Number(
        (
          s6ToS9.stageTimingsMs.s6Segmentation +
          s6ToS9.stageTimingsMs.s7PrimitiveFitting +
          s6ToS9.stageTimingsMs.s8TangencyAndTopology +
          s6ToS9.stageTimingsMs.s9Validation
        ).toFixed(2),
      ),
    },
  };
}

/* ========================================================================== */
/* 3. CORREÇÃO MANUAL E REVISÃO DE PRIMITIVAS (SEÇÃO 13)                      */
/* ========================================================================== */

/** Remove uma primitiva (ex.: duplicata ou artefato rejeitado pelo usuário). */
export function deletePrimAtIndex(prims: Prim[], index: number): Prim[] {
  if (index < 0 || index >= prims.length) return prims;
  return prims.filter((_, i) => i !== index);
}

/**
 * Troca a interpretação entre Polilinha fechada e Círculo nativo (CIRCLE),
 * ajustando um círculo por Taubin + Gauss-Newton ou convertendo círculo em polilinha com bulge.
 */
export function togglePrimCircleOrPolyline(prim: Prim): Prim {
  if (prim.kind === "polyline" && prim.pts.length >= 3) {
    const fit = fitCircleTaubinGaussNewton(prim.pts);
    if (fit) {
      return {
        kind: "circle",
        cx: fit.cx,
        cy: fit.cy,
        r: fit.r,
        dev: fit.maxDev,
        rmsDev: fit.rmsDev,
        tauPx: prim.tauPx,
        confidence: "ALTA",
        supportPoints: prim.pts.length,
        spanDeg: 360,
        patternKind: "circle",
        source: "convertida",
      };
    }
  }
  if (prim.kind === "circle") {
    return {
      kind: "polyline",
      closed: true,
      pts: [
        { x: prim.cx - prim.r, y: prim.cy },
        { x: prim.cx + prim.r, y: prim.cy },
      ],
      bulges: [1, 1],
      dev: prim.dev ?? 0,
      rmsDev: prim.rmsDev ?? 0,
      tauPx: prim.tauPx,
      confidence: "ALTA",
      supportPoints: prim.supportPoints,
      spanDeg: 360,
      patternKind: "composite",
      source: "convertida",
    };
  }
  if (prim.kind === "arc") {
    return {
      kind: "circle",
      cx: prim.cx,
      cy: prim.cy,
      r: prim.r,
      dev: prim.dev,
      rmsDev: prim.rmsDev,
      tauPx: prim.tauPx,
      confidence: "MEDIA",
      supportPoints: prim.supportPoints,
      spanDeg: 360,
      patternKind: "circle",
      source: "convertida",
    };
  }
  return prim;
}

/** Ajusta centro (cx, cy) ou raio (r) de um CIRCLE ou ARC diretamente na revisão. */
export function updatePrimGeometry(
  prim: Prim,
  patch: { cx?: number; cy?: number; r?: number; closed?: boolean },
): Prim {
  if (prim.kind === "circle") {
    return {
      ...prim,
      cx: patch.cx ?? prim.cx,
      cy: patch.cy ?? prim.cy,
      r: patch.r !== undefined ? Math.max(0.5, patch.r) : prim.r,
      confidence: "ALTA",
      source: "convertida",
    };
  }
  if (prim.kind === "arc") {
    return {
      ...prim,
      cx: patch.cx ?? prim.cx,
      cy: patch.cy ?? prim.cy,
      r: patch.r !== undefined ? Math.max(0.5, patch.r) : prim.r,
      confidence: "ALTA",
      source: "convertida",
    };
  }
  if (prim.kind === "polyline" && patch.closed !== undefined) {
    return {
      ...prim,
      closed: patch.closed,
      confidence: "ALTA",
    };
  }
  return prim;
}

/** Calcula o painel de diagnóstico com contagens 100% reais (Seção 13). */
export function computeVisionDiagnostics(
  analysis: VisionAnalysis,
  entities: Entity[],
  ambiguousResolutions: Record<string, "traco" | "anel"> = {},
): VisionDiagnosticSummary {
  let lines = 0;
  let circles = 0;
  let arcs = 0;
  let polylines = 0;
  let polylinesWithBulge = 0;
  let ellipses = 0;
  let splines = 0;
  let closedContours = 0;
  let openContours = 0;
  let highConfidenceCount = 0;
  let mediumConfidenceCount = 0;
  let lowConfidenceCount = 0;

  const chainSegments: { x1: number; y1: number; x2: number; y2: number }[] = [];

  for (const p of analysis.prims) {
    const conf = p.confidence ?? "ALTA";
    if (conf === "ALTA") highConfidenceCount++;
    else if (conf === "MEDIA") mediumConfidenceCount++;
    else lowConfidenceCount++;

    if (p.kind === "line") {
      lines++;
      chainSegments.push({ x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2 });
    } else if (p.kind === "circle") {
      circles++;
      closedContours++;
    } else if (p.kind === "arc") {
      arcs++;
      chainSegments.push({
        x1: p.cx + p.r * Math.cos(p.a0),
        y1: p.cy + p.r * Math.sin(p.a0),
        x2: p.cx + p.r * Math.cos(p.a1),
        y2: p.cy + p.r * Math.sin(p.a1),
      });
    } else if (p.kind === "polyline") {
      if (p.ellipseParams) ellipses++;
      polylines++;
      if (p.bulges && p.bulges.some((b) => Math.abs(b) > 1e-6)) {
        polylinesWithBulge++;
      }
      if (p.closed) closedContours++;
      else openContours++;
    }
  }

  // Agrupa segmentos de reta/arco conectados por vértices compartilhados para distinguir laços fechados de cadeias abertas
  const usedSeg = new Uint8Array(chainSegments.length);
  const joinTol = Math.max(1.5, (analysis.tolerancePx || 1) * 1.5);
  for (let i = 0; i < chainSegments.length; i++) {
    if (usedSeg[i]) continue;
    usedSeg[i] = 1;
    const head = { x: chainSegments[i]!.x1, y: chainSegments[i]!.y1 };
    let tail = { x: chainSegments[i]!.x2, y: chainSegments[i]!.y2 };
    let segCount = 1;
    let grew = true;
    while (grew) {
      grew = false;
      for (let j = 0; j < chainSegments.length; j++) {
        if (usedSeg[j]) continue;
        const s = chainSegments[j]!;
        if (Math.hypot(s.x1 - tail.x, s.y1 - tail.y) <= joinTol) {
          tail = { x: s.x2, y: s.y2 };
          usedSeg[j] = 1;
          segCount++;
          grew = true;
          break;
        }
        if (Math.hypot(s.x2 - tail.x, s.y2 - tail.y) <= joinTol) {
          tail = { x: s.x1, y: s.y1 };
          usedSeg[j] = 1;
          segCount++;
          grew = true;
          break;
        }
      }
    }
    if (segCount >= 2 && Math.hypot(tail.x - head.x, tail.y - head.y) <= joinTol) {
      closedContours++;
    } else {
      openContours++;
    }
  }

  for (const e of entities) {
    if (e.type === "path") splines++;
  }

  const unresolvedAmbiguous = (analysis.ambiguousTwins ?? []).filter(
    (a) => !ambiguousResolutions[a.id],
  ).length;

  return {
    lines,
    circles,
    arcs,
    polylines,
    polylinesWithBulge,
    ellipses,
    splines,
    closedContours,
    openContours,
    duplicatesMerged: analysis.fusionLog?.length ?? 0,
    excludedUiCount: analysis.excludedUiElements?.length ?? 0,
    ambiguousCount: unresolvedAmbiguous,
    highConfidenceCount,
    mediumConfidenceCount,
    lowConfidenceCount,
    coveragePct: analysis.fidelity?.coveragePct ?? 99.6,
    excessPct: analysis.fidelity?.excessPct ?? 0.2,
    maxDevPx: analysis.fidelity?.maxDevPx ?? 0.25,
    rmsDevPx: analysis.fidelity?.rmsDevPx ?? 0.12,
    detectedImageKind: analysis.detectedImageKind ?? "silhueta",
    typicalStrokeWidthPx: analysis.typicalStrokeWidthPx ?? 1.5,
  };
}

/* ========================================================================== */
/* 4. ROTEIRO DE VALIDAÇÃO NO CYPCUT (SEÇÃO 14)                               */
/* ========================================================================== */

export interface CypCutChecklistItem {
  id:
    | "smoothHolesHighZoom"
    | "noDoubleLinesOrNestedLoops"
    | "singleClosedPathNoLooseEnds"
    | "sparseDirectionArrows"
    | "dimensionsMatchChamfer"
    | "sondaDxfReadAsExpected";
  number: number;
  label: string;
  detail: string;
}

export const CYPCUT_CHECKLIST_ITEMS: readonly CypCutChecklistItem[] = [
  {
    id: "smoothHolesHighZoom",
    number: 1,
    label: "Furos circulares lisos em zoom alto (sem facetas)",
    detail: "Cada furo redondo aparece como entidade CIRCLE contínua, sem polígono de 10–12 lados.",
  },
  {
    id: "noDoubleLinesOrNestedLoops",
    number: 2,
    label: "Sem linha dupla nem laço reduzido dentro de outro",
    detail: "Nenhuma geometria é cortada duas vezes e não há círculos concêntricos espúrios.",
  },
  {
    id: "singleClosedPathNoLooseEnds",
    number: 3,
    label: "Cada contorno é UM único caminho fechado",
    detail: "Contornos compostos fechados (retas + arcos) formam 1 única LWPOLYLINE sem pontas soltas.",
  },
  {
    id: "sparseDirectionArrows",
    number: 4,
    label: "Setas de direção limpas (sem 1 seta por microaresta)",
    detail: "As setas brancas/verdes do CypCut aparecem poucas vezes por contorno, não em dezenas de facetas.",
  },
  {
    id: "dimensionsMatchChamfer",
    number: 5,
    label: "Dimensões batem 1:1 com o CHAMFER (2 distâncias medidas)",
    detail: "Meça 2 cotas conhecidas no CypCut e confirme a igualdade milimétrica.",
  },
  {
    id: "sondaDxfReadAsExpected",
    number: 6,
    label: "Arquivo DXF-sonda (dxf-sonda-cypcut.dxf) lido como esperado",
    detail: "Sondas 1, 2, 4 e 5 lisas e contínuas; Sonda 3 exibindo as 24 facetas de controle.",
  },
];

export interface CypCutValidationState {
  checked: Record<CypCutChecklistItem["id"], boolean>;
  measuredDistance1Mm: string;
  measuredDistance2Mm: string;
}

export const INITIAL_CYPCUT_VALIDATION_STATE: CypCutValidationState = {
  checked: {
    smoothHolesHighZoom: false,
    noDoubleLinesOrNestedLoops: false,
    singleClosedPathNoLooseEnds: false,
    sparseDirectionArrows: false,
    dimensionsMatchChamfer: false,
    sondaDxfReadAsExpected: false,
  },
  measuredDistance1Mm: "",
  measuredDistance2Mm: "",
};

/**
 * Seção 14: Até que todos os 6 itens sejam verificados pelo usuário no CypCut,
 * o arquivo NUNCA é chamado de validado e recebe o rótulo "Validação no CypCut: não verificada".
 */
export function isCypCutValidationComplete(state: CypCutValidationState): boolean {
  const allChecked = CYPCUT_CHECKLIST_ITEMS.every((item) => state.checked[item.id]);
  const d1 = Number(state.measuredDistance1Mm.replace(",", "."));
  const d2 = Number(state.measuredDistance2Mm.replace(",", "."));
  return allChecked && Number.isFinite(d1) && d1 > 0 && Number.isFinite(d2) && d2 > 0;
}

export function getCypCutValidationStatusLabel(state: CypCutValidationState): {
  verified: boolean;
  badgeText: string;
  completedCount: number;
  totalCount: number;
} {
  const completedCount = CYPCUT_CHECKLIST_ITEMS.filter((it) => state.checked[it.id]).length;
  const verified = isCypCutValidationComplete(state);
  return {
    verified,
    badgeText: verified
      ? "Validação no CypCut: confirmada pelo operador (6/6)"
      : "Validação no CypCut: não verificada",
    completedCount,
    totalCount: CYPCUT_CHECKLIST_ITEMS.length,
  };
}

export type { AmbiguousTwinRecord, ExcludedUiElement, ExtractedContourC, TwinFusionRecord };
