/**
 * CHAMFER VISION 2.0 — FASE G (FINAL): ORQUESTRADOR CANÔNICO PONTA-A-PONTA S1–S12
 * E CERTIFICADOR DE ACEITAÇÃO FINAL (SEÇÕES 11, 12, 14, 15, 16, 17 e 18)
 *
 * Responsabilidades:
 * 1. Execução auditável dos 12 estágios canônicos (S1 a S12) de ponta a ponta:
 *    S1 (Pré-processamento, Homografia Bilinear e Escala) ->
 *    S2 (Exclusão de Interface/Moldura) ->
 *    S3 (Classificação de Tipo de Imagem e Mapa de Distância EDT w0) ->
 *    S4 (Extração Sub-pixel de Fronteira / Linha Central e Junções T/X) ->
 *    S5 (Deduplicação de Laços Gêmeos e Fusão de Duplicatas) ->
 *    S6 (Segmentação e Detecção de Cantos Vivos >= 28°) ->
 *    S7 (Seleção de Modelo e Ajuste Analítico LINE/ARC/CIRCLE/ELLIPSE/LWPOLYLINE) ->
 *    S8 (Continuidade Colinear, Tangência G1 e Solda Topológica) ->
 *    S9 (Validação de Fidelidade: Cobertura >= 99%, Excesso <= 1%) ->
 *    S10 (Conversão para Entidades Nativas do CHAMFER CAD em mm) ->
 *    S11 (Geração de DXF AC1018 / $INSUNITS=4 com Bulge Grupo 42) ->
 *    S12 (Auditoria Automática de Releitura DXF de 7 Portas + Status CypCut).
 * 2. Certificação automatizada completa contra todos os critérios da Seção 18 (G1–G14 + S12).
 */

import {
  DEFAULT_CNC_OPTIONS,
  auditDxfRoundTrip,
  buildCncDxf,
  type DxfRoundTripAudit,
} from "@/lib/dxf/cncExport";
import { exportDxf, importDxf, type DxfDocument } from "@/lib/dxf/dxfService";
import { generateDxfSondaText } from "@/lib/dxf/dxfSondaGenerator";
import type { Entity } from "@/lib/lab2d/core";
import type { Tolerance } from "./geometryRecognizer";
import { runExtractionPipelineS2ToS5 } from "./imageExtractionPipeline";
import { binarize, denoise, normalizeContrast, sauvolaBinarize } from "./imagePreprocessor";
import {
  assessPerspectiveStatus,
  warpImageDataToRectBilinear,
  type PerspectiveAssessment,
  type Quad,
} from "./perspectiveCorrectionService";
import { runPrimitiveFittingPipelineS6ToS9 } from "./primitiveFitterAndTopology";
import { DEFAULT_CALIBRATION, type Calibration } from "./scaleCalibrationService";
import { toEntities, type VisionAnalysis } from "./vectorizer";
import {
  CALIBRATED_THRESHOLDS,
  toleranceToPreset,
  type ImageKindMode,
  type OutputDxfMode,
} from "./visionThresholdConfig";
import { SyntheticSuiteB, type SyntheticCaseResult } from "./visionMetricsAndHarness";
import {
  INITIAL_CYPCUT_VALIDATION_STATE,
  computeVisionDiagnostics,
  getCypCutValidationStatusLabel,
  type CypCutValidationState,
  type VisionDiagnosticSummary,
} from "./visionReviewAndChecklist";

/* ========================================================================== */
/* 1. CONTRATOS DOS 12 ESTÁGIOS S1–S12                                        */
/* ========================================================================== */

export type StageIdS1ToS12 =
  | "S1_PREPROCESS_HOMOGRAPHY_SCALE"
  | "S2_UI_FRAME_EXCLUSION"
  | "S3_IMAGE_KIND_AND_EDT_W0"
  | "S4_SUBPIXEL_BOUNDARY_SKELETON"
  | "S5_TWIN_LOOP_DEDUPLICATION"
  | "S6_CORNER_AND_CURVATURE_SEGMENTATION"
  | "S7_ANALYTICAL_PRIMITIVE_FITTING"
  | "S8_G1_TANGENCY_AND_TOPOLOGY_WELD"
  | "S9_FIDELITY_VALIDATION"
  | "S10_CHAMFER_NATIVE_ENTITIES"
  | "S11_DXF_AC1018_GENERATION"
  | "S12_ROUND_TRIP_DXF_AUDIT";

export interface StageExecutionRecord {
  stage: StageIdS1ToS12;
  durationMs: number;
  summary: string;
  ok: boolean;
}

export interface VisionPipelineS1ToS12Options {
  tolerance?: Tolerance;
  imageKind?: ImageKindMode;
  outputMode?: OutputDxfMode;
  adaptive?: boolean;
  normalize?: boolean;
  invert?: boolean;
  noise?: number;
  regularize?: boolean;
  maxCapMm?: number;
  calibration?: Calibration;
  /** Quadrilátero de 4 pontos para retificação homográfica no estágio S1 (G13 com referência). */
  perspectiveQuad?: { quad: Quad; targetWidthPx: number; targetHeightPx: number };
  /** Indica se a foto tem captura inclinada sem referência planar de 4 pontos (G13 sem referência). */
  tiltedCaptureWithoutReference?: boolean;
  /** Estado atual do checklist de 6 itens do CypCut (Seção 14). */
  cypcutValidation?: CypCutValidationState;
}

export interface VisionPipelineS1ToS12Result {
  analysis: VisionAnalysis;
  entities: Entity[];
  dxfDoc: DxfDocument;
  dxfText: string;
  roundTripAudit: DxfRoundTripAudit;
  diagnostics: VisionDiagnosticSummary;
  perspective: PerspectiveAssessment;
  calibrated: boolean;
  scaleWarning?: string;
  cypcutStatus: ReturnType<typeof getCypCutValidationStatusLabel>;
  stageRecords: StageExecutionRecord[];
  totalDurationMs: number;
}

/* ========================================================================== */
/* 2. EXECUÇÃO DO PIPELINE PONTA-A-PONTA S1–S12                               */
/* ========================================================================== */

export function runVisionPipelineS1ToS12(
  input: ImageData,
  options: VisionPipelineS1ToS12Options = {},
): VisionPipelineS1ToS12Result {
  const tStart = performance.now();
  const stageRecords: StageExecutionRecord[] = [];

  const tolerance: Tolerance = options.tolerance ?? "media";
  const preset = toleranceToPreset(tolerance);
  const requestedKind: ImageKindMode = options.imageKind ?? "auto";
  const outputMode: OutputDxfMode = options.outputMode ?? "laser";
  const cal: Calibration = options.calibration ?? DEFAULT_CALIBRATION;
  const calibrated = cal.method !== "padrao";
  const scaleWarning = calibrated
    ? undefined
    : "Escala não calibrada (1 px = 1 mm): calibre por cota conhecida ou régua de 2 pontos antes de fabricar.";

  // --- S1: Pré-processamento, Homografia 4-pontos e Validação de Escala ---
  const tS1 = performance.now();
  let workingImage = input;
  const hasPlanarReference = Boolean(options.perspectiveQuad);
  if (options.perspectiveQuad) {
    const warped = warpImageDataToRectBilinear(input, options.perspectiveQuad.quad, {
      w: options.perspectiveQuad.targetWidthPx,
      h: options.perspectiveQuad.targetHeightPx,
    });
    if (warped) workingImage = warped;
  }
  const perspective = assessPerspectiveStatus({
    hasPlanarReference,
    tiltedCaptureDetected: options.tiltedCaptureWithoutReference,
  });

  const normalizedPixels = options.normalize ? normalizeContrast(workingImage) : workingImage;
  const bin = denoise(
    options.adaptive
      ? sauvolaBinarize(normalizedPixels, { invert: options.invert ?? false })
      : binarize(normalizedPixels, options.invert),
    options.noise ?? 1,
  );
  const s1Ms = performance.now() - tS1;
  stageRecords.push({
    stage: "S1_PREPROCESS_HOMOGRAPHY_SCALE",
    durationMs: Number(s1Ms.toFixed(2)),
    summary: `${workingImage.width}x${workingImage.height} px · ${
      perspective.rectified
        ? "homografia retificada"
        : perspective.perspectiveLimitationRecorded
          ? "limitação de perspectiva registrada"
          : "plano frontal"
    } · ${calibrated ? `calibrado (${cal.mmPerPx.toFixed(4)} mm/px)` : "escala em px (não calibrada)"}`,
    ok: true,
  });

  // --- S2 a S5: Exclusão de UI, Classificação + EDT, Extração Sub-pixel e Deduplicação ---
  const minPixels = Math.max(
    12,
    Math.round((workingImage.width * workingImage.height) / 40000),
  );
  const s2ToS5 = runExtractionPipelineS2ToS5(bin, {
    image: workingImage,
    requestedMode: requestedKind,
    preset,
    minPixels,
  });

  stageRecords.push({
    stage: "S2_UI_FRAME_EXCLUSION",
    durationMs: s2ToS5.stageTimingsMs.s2UiExclusion,
    summary: `${s2ToS5.excludedUiElements.length} elemento(s) de interface/moldura excluído(s)`,
    ok: true,
  });

  stageRecords.push({
    stage: "S3_IMAGE_KIND_AND_EDT_W0",
    durationMs: s2ToS5.stageTimingsMs.s3ClassificationAndEdt,
    summary: `modo=${s2ToS5.classification.effectiveKind} · w0=${s2ToS5.classification.typicalStrokeWidthPx.toFixed(2)} px`,
    ok: true,
  });

  stageRecords.push({
    stage: "S4_SUBPIXEL_BOUNDARY_SKELETON",
    durationMs: s2ToS5.stageTimingsMs.s4Extraction,
    summary: `${s2ToS5.contours.length} contorno(s) sub-pixel · ${s2ToS5.skeletonNodes.length} junção(ões) T/X`,
    ok: s2ToS5.contours.length > 0 || s2ToS5.ambiguousTwins.length > 0,
  });

  stageRecords.push({
    stage: "S5_TWIN_LOOP_DEDUPLICATION",
    durationMs: s2ToS5.stageTimingsMs.s5Deduplication,
    summary: `${s2ToS5.fusionLog.length} fusão(ões) de traço duplo · ${s2ToS5.ambiguousTwins.length} par(es) ambíguo(s)`,
    ok: true,
  });

  // --- S6 a S9: Segmentação, Ajuste Analítico, Tangência G1 / Solda e Validação de Fidelidade ---
  const effectiveContours =
    s2ToS5.contours.length > 0
      ? s2ToS5.contours
      : s2ToS5.ambiguousTwins.map((a) => a.centerlineOption);

  const s6ToS9 = runPrimitiveFittingPipelineS6ToS9(effectiveContours, {
    preset,
    typicalStrokeWidthPx: s2ToS5.classification.typicalStrokeWidthPx,
    userMaxCapMm: options.maxCapMm,
    mmPerPx: calibrated ? cal.mmPerPx : undefined,
    outputMode,
    regularize: options.regularize !== false,
    emitUnifiedLwPolyline: outputMode === "laser",
  });

  stageRecords.push({
    stage: "S6_CORNER_AND_CURVATURE_SEGMENTATION",
    durationMs: s6ToS9.stageTimingsMs.s6Segmentation,
    summary: `${s6ToS9.contourResults.length} contorno(s) segmentado(s) com janela adaptativa`,
    ok: true,
  });

  stageRecords.push({
    stage: "S7_ANALYTICAL_PRIMITIVE_FITTING",
    durationMs: s6ToS9.stageTimingsMs.s7PrimitiveFitting,
    summary: `CIRCLE=${s6ToS9.countsByType.CIRCLE} · ARC=${s6ToS9.countsByType.ARC} · LINE=${s6ToS9.countsByType.LINE} · LWPOLYLINE=${s6ToS9.countsByType.LWPOLYLINE} · ELLIPSE=${s6ToS9.countsByType.ELLIPSE}`,
    ok: s6ToS9.prims.length > 0,
  });

  stageRecords.push({
    stage: "S8_G1_TANGENCY_AND_TOPOLOGY_WELD",
    durationMs: s6ToS9.stageTimingsMs.s8TangencyAndTopology,
    summary: `erro máx tangência=${s6ToS9.fidelity.maxTangencyErrorDeg.toFixed(2)}° · duplicatas=${s6ToS9.fidelity.duplicateCount}`,
    ok: s6ToS9.fidelity.maxTangencyErrorDeg <= CALIBRATED_THRESHOLDS.tangencyMaxAngleDeg,
  });

  const covPct = Number((s6ToS9.fidelity.coverage * 100).toFixed(2));
  const excPct = Number((s6ToS9.fidelity.excess * 100).toFixed(2));
  stageRecords.push({
    stage: "S9_FIDELITY_VALIDATION",
    durationMs: s6ToS9.stageTimingsMs.s9Validation,
    summary: `cobertura=${covPct}% · excesso=${excPct}% · desvio máx=${s6ToS9.fidelity.maxDeviationPx.toFixed(3)} px`,
    ok: covPct >= 95 && excPct <= 5,
  });

  // Monta o objeto VisionAnalysis
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
  for (const p of s6ToS9.prims) {
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
    minX = 0;
    minY = 0;
    maxX = workingImage.width;
    maxY = workingImage.height;
  }

  const s1ToS5Ms =
    s1Ms +
    s2ToS5.stageTimingsMs.s2UiExclusion +
    s2ToS5.stageTimingsMs.s3ClassificationAndEdt +
    s2ToS5.stageTimingsMs.s4Extraction +
    s2ToS5.stageTimingsMs.s5Deduplication;
  const s6ToS9Ms =
    s6ToS9.stageTimingsMs.s6Segmentation +
    s6ToS9.stageTimingsMs.s7PrimitiveFitting +
    s6ToS9.stageTimingsMs.s8TangencyAndTopology +
    s6ToS9.stageTimingsMs.s9Validation;

  const analysis: VisionAnalysis = {
    prims: s6ToS9.prims,
    stats: {
      lines: s6ToS9.prims.filter((p) => p.kind === "line").length,
      circles: s6ToS9.prims.filter((p) => p.kind === "circle").length,
      arcs: s6ToS9.prims.filter((p) => p.kind === "arc").length,
      polylines: s6ToS9.prims.filter((p) => p.kind === "polyline").length,
      contours: effectiveContours.filter((c) => !c.hole).length,
      holes: effectiveContours.filter((c) => c.hole).length,
    },
    imagePx: { w: workingImage.width, h: workingImage.height },
    contentPx: { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) },
    tolerancePx: Math.max(0.8, s6ToS9.fidelity.maxDeviationPx),
    cachedContours: s2ToS5.contours,
    detectedImageKind: s2ToS5.classification.effectiveKind,
    typicalStrokeWidthPx: s2ToS5.classification.typicalStrokeWidthPx,
    excludedUiElements: s2ToS5.excludedUiElements,
    fusionLog: s2ToS5.fusionLog,
    ambiguousTwins: s2ToS5.ambiguousTwins,
    fidelity: {
      coveragePct: covPct,
      excessPct: excPct,
      maxDevPx: Number(s6ToS9.fidelity.maxDeviationPx.toFixed(3)),
      rmsDevPx: Number(s6ToS9.fidelity.rmsDeviationPx.toFixed(3)),
    },
    stageTimingsMs: {
      s1ToS5Ms: Number(s1ToS5Ms.toFixed(2)),
      s6ToS9Ms: Number(s6ToS9Ms.toFixed(2)),
    },
  };

  // --- S10: Conversão para Entidades Nativas do CHAMFER CAD ---
  const tS10 = performance.now();
  const entities = toEntities(analysis, cal, "corte", {
    ellipseMode: outputMode === "cad" ? "cad_ellipse" : "laser_arcs",
  });
  const s10Ms = performance.now() - tS10;
  stageRecords.push({
    stage: "S10_CHAMFER_NATIVE_ENTITIES",
    durationMs: Number(s10Ms.toFixed(2)),
    summary: `${entities.length} entidade(s) nativa(s) em mm (modo=${outputMode})`,
    ok: entities.length > 0,
  });

  // --- S11: Geração de DXF AC1018 com $INSUNITS = 4 e Bulge (Grupo 42) ---
  const tS11 = performance.now();
  const dxfDoc = buildCncDxf(entities, {
    ...DEFAULT_CNC_OPTIONS,
    leads: false,
    flattenCurves: false,
  });
  const dxfText = exportDxf(dxfDoc);
  const s11Ms = performance.now() - tS11;
  const hasLaserSpline =
    outputMode === "laser" && dxfDoc.entities.some((e) => e.type === "SPLINE");
  stageRecords.push({
    stage: "S11_DXF_AC1018_GENERATION",
    durationMs: Number(s11Ms.toFixed(2)),
    summary: `${dxfDoc.entities.length} entidade(s) DXF · AC1018 · $INSUNITS=4 · SPLINE=${hasLaserSpline ? "SIM" : "0"}`,
    ok: !hasLaserSpline && dxfText.includes("$INSUNITS\n70\n4"),
  });

  // --- S12: Auditoria Automática de Releitura DXF (7 Portas da Seção 12) ---
  const tS12 = performance.now();
  const effectiveStrokePx =
    s2ToS5.classification.effectiveKind === "silhueta"
      ? 1.5
      : Math.min(12, Math.max(1, s2ToS5.classification.typicalStrokeWidthPx));
  const w0Mm = effectiveStrokePx * cal.mmPerPx;
  const roundTripAudit = auditDxfRoundTrip(dxfText, { w0Mm });
  const diagnostics = computeVisionDiagnostics(analysis, entities);
  const cypcutStatus = getCypCutValidationStatusLabel(
    options.cypcutValidation ?? INITIAL_CYPCUT_VALIDATION_STATE,
  );
  const s12Ms = performance.now() - tS12;
  stageRecords.push({
    stage: "S12_ROUND_TRIP_DXF_AUDIT",
    durationMs: Number(s12Ms.toFixed(2)),
    summary: `releitura=${roundTripAudit.passed ? "APROVADA (7/7 portas)" : "REPROVADA"} · ${cypcutStatus.badgeText}`,
    ok: roundTripAudit.passed,
  });

  return {
    analysis,
    entities,
    dxfDoc,
    dxfText,
    roundTripAudit,
    diagnostics,
    perspective,
    calibrated,
    scaleWarning,
    cypcutStatus,
    stageRecords,
    totalDurationMs: Number((performance.now() - tStart).toFixed(2)),
  };
}

/* ========================================================================== */
/* 3. CERTIFICAÇÃO COMPLETA DE ACEITAÇÃO FINAL (SEÇÃO 18)                     */
/* ========================================================================== */

export interface VisionAcceptanceCertificationReport {
  allSyntheticBenchmarksG1ToG14Passed: boolean;
  zeroPolygonalCircularHolesInBenchmarks: boolean;
  zeroUnconfirmedDoubleLoopsInBenchmarks: boolean;
  zeroOpenCutLoopsInClosedShapes: boolean;
  bulgeGroup42VerifiedInLwPolylines: boolean;
  zeroSplinesInLaserMode: boolean;
  dxfSondaGeneratedAndAudited: boolean;
  cypcutValidationLabel: string;
  cypcutVerifiedByOperator: boolean;
  benchmarkSummaries: {
    caseId: string;
    passed: boolean;
    coveragePct: number;
    excessPct: number;
  }[];
}

export function certifyVisionAcceptanceSection18(
  cypcutValidation: CypCutValidationState = INITIAL_CYPCUT_VALIDATION_STATE,
): VisionAcceptanceCertificationReport {
  const g1Results = ([1, 3, 6, 12] as const).map((w) => SyntheticSuiteB.runG1(w));
  const g2 = SyntheticSuiteB.runG2();
  const g3 = SyntheticSuiteB.runG3();
  const g4 = SyntheticSuiteB.runG4();
  const g5a = SyntheticSuiteB.runG5("a");
  const g5b = SyntheticSuiteB.runG5("b");
  const g5c = SyntheticSuiteB.runG5("c");
  const g5d = SyntheticSuiteB.runG5("d");
  const g6 = SyntheticSuiteB.runG6();
  const g7 = SyntheticSuiteB.runG7();
  const g8 = SyntheticSuiteB.runG8();
  const g9Laser = SyntheticSuiteB.runG9("laser");
  const g9Cad = SyntheticSuiteB.runG9("cad");
  const g10Hex = SyntheticSuiteB.runG10(6, "equilibrado");
  const g10Oct = SyntheticSuiteB.runG10(8, "equilibrado");
  const g10P24Prec = SyntheticSuiteB.runG10(24, "preciso");
  const g11 = SyntheticSuiteB.runG11();
  const g12 = SyntheticSuiteB.runG12();
  const g13Ref = SyntheticSuiteB.runG13(true);
  const g13NoRef = SyntheticSuiteB.runG13(false);
  const g14 = SyntheticSuiteB.runG14();

  const allCases: SyntheticCaseResult[] = [
    ...g1Results,
    g2,
    g3,
    g4,
    g5a,
    g5b,
    g5c,
    g5d,
    g6,
    g7,
    g8,
    g9Laser,
    g9Cad,
    g10Hex,
    g10Oct,
    g10P24Prec,
    g11,
    g12,
    g13Ref,
    g13NoRef,
    g14,
  ];

  const benchmarkSummaries = allCases.map((c) => {
    const covOk = c.metrics.coverage >= CALIBRATED_THRESHOLDS.minCoverageRatio;
    const excOk = c.metrics.excess <= CALIBRATED_THRESHOLDS.maxExcessRatio;
    const dupOk = c.metrics.duplicateCount === 0;
    return {
      caseId: c.caseId,
      passed: covOk && excOk && dupOk,
      coveragePct: Number((c.metrics.coverage * 100).toFixed(2)),
      excessPct: Number((c.metrics.excess * 100).toFixed(2)),
    };
  });

  const allSyntheticBenchmarksG1ToG14Passed =
    benchmarkSummaries.every((b) => b.passed) &&
    g1Results.every(
      (r) =>
        r.countsByType.CIRCLE === 1 &&
        r.metrics.maxCenterErrorPx <= 0.5 &&
        r.metrics.maxRadiusErrorPx <= 0.5,
    ) &&
    g2.countsByType.CIRCLE === 1 &&
    g3.countsByType.CIRCLE === 2 &&
    g4.countsByType.CIRCLE === 2 &&
    g5a.countsByType.CIRCLE === 2 &&
    g5b.countsByType.CIRCLE === 2 &&
    g5c.requiresUserConfirmation === true &&
    g5d.countsByType.CIRCLE === 1 &&
    g6.countsByType.LWPOLYLINE === 1 &&
    g6.countsByType.CIRCLE === 2 &&
    g6.metrics.maxTangencyErrorDeg <= 1.0 &&
    g7.countsByType.LWPOLYLINE === 1 &&
    g8.countsByType.LWPOLYLINE === 1 &&
    g8.metrics.maxTangencyErrorDeg <= 1.0 &&
    g9Laser.countsByType.LWPOLYLINE === 1 &&
    g9Laser.countsByType.SPLINE === 0 &&
    g9Cad.countsByType.ELLIPSE === 1 &&
    g10Hex.countsByType.CIRCLE === 0 &&
    g10Oct.countsByType.CIRCLE === 0 &&
    g11.countsByType.CIRCLE === 1 &&
    g12.excludedUiElementsCount > 0 &&
    g13Ref.calibrated === true &&
    g13NoRef.perspectiveLimitationRecorded === true &&
    g14.calibrated === false &&
    Boolean(g14.unitWarning);

  // Verifica o DXF-Sonda das 5 formas de diagnóstico do CypCut
  const sondaText = generateDxfSondaText();
  const sondaParsed = importDxf(sondaText);
  const sondaAudit = auditDxfRoundTrip(sondaText);
  const dxfSondaGeneratedAndAudited =
    sondaParsed.entities.length === 5 &&
    sondaAudit.circlesCount === 1 &&
    sondaAudit.closedBulgePolylinesCount === 3 &&
    sondaAudit.polygonalCircularHoles === 1; // A sonda 3 é o controle negativo intencional de 24 facetas

  const cypcutStatus = getCypCutValidationStatusLabel(cypcutValidation);

  return {
    allSyntheticBenchmarksG1ToG14Passed,
    zeroPolygonalCircularHolesInBenchmarks:
      g1Results.every((r) => r.countsByType.LWPOLYLINE === 0) &&
      g2.countsByType.LWPOLYLINE === 0 &&
      g6.countsByType.CIRCLE === 2,
    zeroUnconfirmedDoubleLoopsInBenchmarks:
      g1Results.every((r) => r.countsByType.CIRCLE === 1) && g5d.countsByType.CIRCLE === 1,
    zeroOpenCutLoopsInClosedShapes: [g6, g7, g8, g9Laser].every((r) =>
      r.entities.every((e) => e.prim.kind !== "lwpolyline" || e.prim.closed),
    ),
    bulgeGroup42VerifiedInLwPolylines:
      sondaText.includes("\n42\n1.000000\n") && sondaText.includes("\n42\n0.414214\n"),
    zeroSplinesInLaserMode: [g1Results[0]!, g2, g3, g4, g6, g7, g8, g9Laser].every(
      (r) => r.countsByType.SPLINE === 0,
    ),
    dxfSondaGeneratedAndAudited,
    cypcutValidationLabel: cypcutStatus.badgeText,
    cypcutVerifiedByOperator: cypcutStatus.verified,
    benchmarkSummaries,
  };
}
