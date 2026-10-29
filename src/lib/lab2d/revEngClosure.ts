/**
 * CALDRA CHAMFER CAD — ENGENHARIA REVERSA (FASE G — FECHAMENTO)
 * Caldeiraria e Planificação com Fator K (Seção 11), Exportação Seletiva de Fabricação DXF/SVG (Seção 11.5 / 14.3),
 * Dossiê Técnico Completo de Engenharia Reversa (Seção 14.2) e Registro de Comandos Tipados / CHAMFER INTENT (Seção 15 / T21).
 *
 * Restrito estritamente ao escopo `src/lib/lab2d`.
 */

import type { Entity, LayerId, Vec2 } from "./core";
import type { RevEngPlanData } from "./revEngTypes";
import {
  computeHoleByCaliper,
  computeRadiusFromChordSagitta,
  solveHoleNetworkGaussNewton,
  type HoleNetworkEdge,
  type HoleNetworkNode,
} from "./revEngBench";
import {
  buildConcentricEye,
  solveTangentBridge,
  type TangentBridgeKind,
} from "./revEngTangentBridges";
import {
  computeConstantWallPocket,
  generateLinearRackProfile,
} from "./revEngContourDetails";
import { calibrateByTwoPoints } from "./revEngCalibration";
import {
  compute25DVolumeAndMass,
  evaluate25DConversionReadiness,
  syncRegions25DFromEntities,
} from "./revEng25D";
import {
  detectRevEngGeometryErrors,
  evaluateConfidenceMap,
  evaluateRevEngComparator,
} from "./revEngVerification";

// ============================================================================
// 1. CALDEIRARIA E DESENVOLVIMENTO DE DOBRAS POR FATOR K (SEÇÃO 11.3)
// ============================================================================

export interface SheetMetalBendInput {
  /** Espessura da chapa t (mm) */
  thicknessMm: number;
  /** Raio interno de dobra R_i (mm) */
  innerRadiusMm: number;
  /** Ângulo de dobra α em graus (ex.: 90°) */
  bendAngleDeg: number;
  /** Fator K da linha neutra (0 < K < 1, padrão 0.44) */
  kFactor: number;
  /** Comprimento externo da Aba 1 (mm) */
  flange1OuterMm: number;
  /** Comprimento externo da Aba 2 (mm) */
  flange2OuterMm: number;
  /** Largura da tira/chapa W (mm) */
  stripWidthMm: number;
  /** Indica se a peça possui transição 3D não-planificável por offset simples (cone/redução) */
  has3DTransitionConeOrReduction?: boolean;
}

export interface SheetMetalBendResult {
  thicknessMm: number;
  innerRadiusMm: number;
  bendAngleDeg: number;
  kFactor: number;
  neutralRadiusMm: number;
  /** Comprimento desenvolvido da zona de dobra (Bend Allowance BA) */
  bendAllowanceMm: number;
  /** Recuo externo (Outside Setback OSSB) */
  outsideSetbackMm: number;
  /** Dedução de dobra (Bend Deduction BD = 2·OSSB - BA) */
  bendDeductionMm: number;
  /** Comprimento plano total desenvolvido L_plano = L1 + L2 - BD */
  developedFlatLengthMm: number;
  /** Posição X da linha central de dobra a partir da borda esquerda */
  bendCenterLineXMm: number;
  processWarningPtBr: string;
  transition3DWarningPtBr: string | null;
  entities: Entity[];
}

export function computeBendDevelopmentKFactor(
  input: SheetMetalBendInput,
): SheetMetalBendResult {
  const t = Math.max(0.1, input.thicknessMm);
  const Ri = Math.max(0.1, input.innerRadiusMm);
  const alphaDeg = Math.max(1, Math.min(179, input.bendAngleDeg));
  const K = Math.max(0.1, Math.min(0.9, input.kFactor));
  const L1 = Math.max(t + Ri, input.flange1OuterMm);
  const L2 = Math.max(t + Ri, input.flange2OuterMm);
  const W = Math.max(5, input.stripWidthMm);

  const alphaRad = (alphaDeg * Math.PI) / 180.0;
  const neutralRadiusMm = Ri + K * t;
  const bendAllowanceMm = alphaRad * neutralRadiusMm;
  const outsideSetbackMm = Math.tan(alphaRad * 0.5) * (Ri + t);
  const bendDeductionMm = 2 * outsideSetbackMm - bendAllowanceMm;

  const leg1Flat = Math.max(0, L1 - outsideSetbackMm);
  const leg2Flat = Math.max(0, L2 - outsideSetbackMm);
  const developedFlatLengthMm = leg1Flat + bendAllowanceMm + leg2Flat;
  const bendCenterLineXMm = leg1Flat + bendAllowanceMm * 0.5;

  const ts = Date.now();
  const entities: Entity[] = [
    // Contorno externo planificado na camada CORTE
    {
      id: `reveng-flat-contour-${ts}`,
      type: "polyline",
      layer: "corte",
      closed: true,
      pts: [
        { x: 0, y: 0 },
        { x: developedFlatLengthMm, y: 0 },
        { x: developedFlatLengthMm, y: W },
        { x: 0, y: W },
      ],
      params: {
        infoStatus: "CALCULADO",
        featureKind: "sheet_metal_flat_pattern",
        thicknessMm: t,
        innerRadiusMm: Ri,
        bendAngleDeg: alphaDeg,
        kFactor: K,
        developedFlatLengthMm,
      },
    },
    // Linha central de dobra na camada DOBRA / VINCO (nunca na camada de corte)
    {
      id: `reveng-bend-line-${ts}`,
      type: "line",
      layer: "dobra" as LayerId,
      x1: bendCenterLineXMm,
      y1: 0,
      x2: bendCenterLineXMm,
      y2: W,
      params: {
        infoStatus: "CALCULADO",
        featureKind: "sheet_metal_bend_line",
        bendAngleDeg: alphaDeg,
        innerRadiusMm: Ri,
        kFactor: K,
      },
    },
  ];

  const transition3DWarningPtBr = input.has3DTransitionConeOrReduction
    ? "AVISO DE TRANSIÇÃO 3D: Cones, reduções quadrado-redondo ou superfícies de seção variável nunca devem ser tratados como offset plano 2D. Utilize seções transversais de referência ou o módulo específico de planificação cônica."
    : null;

  return {
    thicknessMm: t,
    innerRadiusMm: Ri,
    bendAngleDeg: alphaDeg,
    kFactor: K,
    neutralRadiusMm,
    bendAllowanceMm,
    outsideSetbackMm,
    bendDeductionMm,
    developedFlatLengthMm,
    bendCenterLineXMm,
    processWarningPtBr: `Desenvolvimento calculado pelo modelo de Linha Neutra (t=${t.toFixed(2)}mm, Ri=${Ri.toFixed(2)}mm, ∠=${alphaDeg.toFixed(1)}°, K=${K.toFixed(2)}). Confirme o fator K real do ferramental (matriz V / punção) antes do corte definitivo.`,
    transition3DWarningPtBr,
    entities,
  };
}

// ============================================================================
// 2. EXPORTAÇÃO SELETIVA PARA FABRICAÇÃO (DXF / SVG) — SEÇÃO 11.5 & 14.3
// ============================================================================

export interface SelectiveExportOptions {
  includeCutLayer?: boolean;
  includeBendLayer?: boolean;
  includeMarkLayer?: boolean;
  /** Por padrão SEMPRE false: camadas auxiliares de engenharia reversa nunca vão para o CNC por padrão */
  includeAuxiliaryRevEng?: boolean;
}

export interface SelectiveExportResult {
  exportedEntities: Entity[];
  excludedAuxiliaryCount: number;
  cutCount: number;
  bendCount: number;
  markCount: number;
  parametricLossWarningPtBr: string;
  dxfContent: string;
}

export function isAuxiliaryRevEngEntity(entity: Entity): boolean {
  if (entity.isConstruction) return true;
  const layer = (entity.layer || "corte").toLowerCase();
  if (
    layer === "construcao" ||
    layer === "referencia" ||
    layer === "cotas" ||
    layer === "eixo"
  ) {
    return true;
  }
  const status = entity.params?.infoStatus;
  if (status === "HIPOTESE" || status === "DESCONHECIDO") return true;
  const fk = entity.params?.featureKind;
  if (
    fk === "stl_mesh_slice" ||
    fk === "section_cutting_line_aa" ||
    fk === "section_aa_hatch_45" ||
    fk === "section_aa_hole_axis"
  ) {
    return true;
  }
  return false;
}

export function exportRevEngSelectiveManufacturing(
  entities: Entity[],
  options: SelectiveExportOptions = {},
): SelectiveExportResult {
  const {
    includeCutLayer = true,
    includeBendLayer = true,
    includeMarkLayer = true,
    includeAuxiliaryRevEng = false,
  } = options;

  const exportedEntities: Entity[] = [];
  let excludedAuxiliaryCount = 0;
  let cutCount = 0;
  let bendCount = 0;
  let markCount = 0;

  for (const e of entities) {
    const isAux = isAuxiliaryRevEngEntity(e);
    if (isAux && !includeAuxiliaryRevEng) {
      excludedAuxiliaryCount++;
      continue;
    }

    const layer = (e.layer || "corte").toLowerCase();
    if (layer === "corte" || layer === "recorte") {
      if (includeCutLayer) {
        exportedEntities.push(e);
        cutCount++;
      }
    } else if (layer === "dobra" || layer === "vinco") {
      if (includeBendLayer) {
        exportedEntities.push(e);
        bendCount++;
      }
    } else if (layer === "marcacao" || layer === "gravacao") {
      if (includeMarkLayer) {
        exportedEntities.push(e);
        markCount++;
      }
    } else if (includeAuxiliaryRevEng) {
      exportedEntities.push(e);
    } else {
      excludedAuxiliaryCount++;
    }
  }

  // Gerar DXF ASCII R12 limpo com camadas separadas (CUT, BEND, MARK)
  const dxfLines: string[] = [
    "0",
    "SECTION",
    "2",
    "HEADER",
    "9",
    "$INSUNITS",
    "70",
    "4", // 4 = milímetros
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "ENTITIES",
  ];

  const dxfLayerName = (ent: Entity): string => {
    const l = (ent.layer || "corte").toLowerCase();
    if (l === "dobra" || l === "vinco") return "BEND";
    if (l === "marcacao" || l === "gravacao") return "MARK";
    if (isAuxiliaryRevEngEntity(ent)) return "REVENG_AUX";
    return "CUT";
  };

  for (const e of exportedEntities) {
    const lyr = dxfLayerName(e);
    if (e.type === "line") {
      dxfLines.push(
        "0",
        "LINE",
        "8",
        lyr,
        "10",
        e.x1.toFixed(4),
        "20",
        (-e.y1).toFixed(4),
        "11",
        e.x2.toFixed(4),
        "21",
        (-e.y2).toFixed(4),
      );
    } else if (e.type === "circle") {
      dxfLines.push(
        "0",
        "CIRCLE",
        "8",
        lyr,
        "10",
        e.cx.toFixed(4),
        "20",
        (-e.cy).toFixed(4),
        "40",
        e.r.toFixed(4),
      );
    } else if (e.type === "arc") {
      const startDeg = ((-e.endAngle * 180) / Math.PI + 360) % 360;
      const endDeg = ((-e.startAngle * 180) / Math.PI + 360) % 360;
      dxfLines.push(
        "0",
        "ARC",
        "8",
        lyr,
        "10",
        e.cx.toFixed(4),
        "20",
        (-e.cy).toFixed(4),
        "40",
        e.r.toFixed(4),
        "50",
        startDeg.toFixed(4),
        "51",
        endDeg.toFixed(4),
      );
    } else if (e.type === "polyline" && e.pts.length >= 2) {
      const count = e.closed ? e.pts.length : e.pts.length - 1;
      for (let i = 0; i < count; i++) {
        const a = e.pts[i]!;
        const b = e.pts[(i + 1) % e.pts.length]!;
        dxfLines.push(
          "0",
          "LINE",
          "8",
          lyr,
          "10",
          a.x.toFixed(4),
          "20",
          (-a.y).toFixed(4),
          "11",
          b.x.toFixed(4),
          "21",
          (-b.y).toFixed(4),
        );
      }
    }
  }

  dxfLines.push("0", "ENDSEC", "0", "EOF");

  return {
    exportedEntities,
    excludedAuxiliaryCount,
    cutCount,
    bendCount,
    markCount,
    parametricLossWarningPtBr:
      "AVISO DE EXPORTAÇÃO: Os formatos DXF e SVG exportam apenas a geometria vetorial final por camadas (CUT, BEND, MARK) e não preservam restrições paramétricas, histórico ou vínculos do Caderno de Medições. Salve o projeto nativo para manter a árvore de engenharia reversa.",
    dxfContent: dxfLines.join("\n"),
  };
}

// ============================================================================
// 3. DOSSIÊ TÉCNICO COMPLETO DE ENGENHARIA REVERSA (SEÇÃO 14.2)
// ============================================================================

export interface RevEngTechnicalDossier {
  partName: string;
  generatedAtIso: string;
  projectionDihedral: string;
  materialLabel: string;
  baseThicknessMm: number | null;
  baseThicknessStatus: string;
  netVolumeCm3: number;
  estimatedMassGrams: number;
  weighedMassGrams: number | null;
  canConvertTo3D: boolean;
  unknownDimensionsAndGaps: string[];
  referencesUsed: Array<{
    name: string;
    viewTag: string;
    calibrationMode: string;
    mmPerPx: number;
    residualErrorMm: number;
    status: string;
  }>;
  measurementsLog: Array<{
    code: string;
    label: string;
    instrument: string;
    measuredValue: string;
    drawnValue: string;
    discrepancy: string;
    status: string;
  }>;
  acceptedHypotheses: string[];
  comparatorSummary: {
    capturedPointsCount: number;
    rmsDeviationMm: number;
    maxDeviationMm: number;
    geometryErrorsCount: number;
  };
  insufficientDataWarnings: string[];
  markdownReport: string;
}

export function generateRevEngTechnicalDossier(params: {
  partName?: string;
  entities: Entity[];
  revEng: RevEngPlanData;
}): RevEngTechnicalDossier {
  const { partName = "Peça Reconstruída — CHAMFER CAD", entities, revEng } = params;

  const baseThicknessMm = revEng.baseThicknessMm ?? 10;
  const baseThicknessStatus = revEng.baseThicknessStatus ?? "MEDIDO";
  const entityRegions = syncRegions25DFromEntities({
    entities,
    baseThicknessMm,
    baseThicknessStatus,
    existingRegions: revEng.regions25D ?? [],
  });
  const syncedIds = new Set(entityRegions.map((r) => r.id));
  const extraRegions = (revEng.regions25D ?? []).filter((r) => !syncedIds.has(r.id));
  const syncedRegions = [...entityRegions, ...extraRegions];

  const readiness = evaluate25DConversionReadiness({
    regions: syncedRegions,
    baseThicknessMm,
    baseThicknessStatus,
  });

  const massProps = compute25DVolumeAndMass({
    regions: syncedRegions,
    baseThicknessMm,
    materialKey: revEng.materialKey ?? "aco_carbono",
    weighedMassGrams: revEng.weighedMassGrams ?? null,
  });

  const comp = evaluateRevEngComparator({
    entities,
    measurements: revEng.measurements,
    capturedPoints: revEng.capturedPoints,
    pointToleranceMm: revEng.fabricationToleranceMm ?? 0.15,
  });

  const errAudit = detectRevEngGeometryErrors({
    entities,
    measurements: revEng.measurements,
    closingToleranceMm: revEng.closingToleranceMm ?? 2.0,
    fabricationToleranceMm: revEng.fabricationToleranceMm ?? 0.15,
  });

  const confMap = evaluateConfidenceMap({
    entities,
    measurements: revEng.measurements,
    regions25D: syncedRegions,
    referenceImages: revEng.referenceImages,
  });

  const unknownDimensionsAndGaps: string[] = [];
  if (baseThicknessStatus === "DESCONHECIDO") {
    unknownDimensionsAndGaps.push("Espessura global (H) da peça está DESCONHECIDA.");
  }
  for (const reg of syncedRegions) {
    const regName = reg.label || (reg as unknown as { name?: string }).name || reg.id;
    if (reg.depthStatus === "DESCONHECIDO" || reg.depthMm === null) {
      unknownDimensionsAndGaps.push(`Profundidade Z da região "${regName}" está DESCONHECIDA.`);
    }
  }
  for (const m of revEng.measurements) {
    const st = m.infoStatus || (m as unknown as { status?: string }).status;
    if (st === "DESCONHECIDO") {
      unknownDimensionsAndGaps.push(`Medição ${m.code} (${m.label}) pendente/desconhecida.`);
    }
  }

  const acceptedHypotheses = entities
    .filter(
      (e) =>
        e.params?.infoStatus === "NOMINAL_ACEITO" ||
        e.params?.revEngStatus === "NOMINAL_ACEITO" ||
        typeof e.params?.acceptedHypothesisNote === "string",
    )
    .map((e) => {
      const note =
        typeof e.params?.acceptedHypothesisNote === "string"
          ? e.params.acceptedHypothesisNote
          : "valor nominal de projeto aceito explicitamente pelo usuário.";
      return `Entidade ${e.id} (${e.type}): ${note}`;
    });

  const insufficientDataWarnings: string[] = [...readiness.blockingMessages];
  if (revEng.referenceImages.length === 0 && revEng.measurements.length === 0) {
    insufficientDataWarnings.push(
      "Nenhuma imagem de referência calibrada nem medição de bancada registrada no projeto.",
    );
  }
  if (errAudit.criticalCount > 0) {
    insufficientDataWarnings.push(
      `Existem ${errAudit.criticalCount} ocorrência(s) geométrica(s) crítica(s) (ex.: contorno aberto ou conflito de cota).`,
    );
  }

  const referencesUsed = revEng.referenceImages.map((img) => {
    const rawImg = img as unknown as Record<string, unknown>;
    const mmPerPx = Number(img.mmPerPx ?? rawImg.scaleMmPerPx ?? 0.1);
    const residualErrorMm = Number(img.residualErrorMm ?? rawImg.calibrationErrorMm ?? 0);
    return {
      name: img.name,
      viewTag: img.viewTag,
      calibrationMode: img.calibrationMode,
      mmPerPx,
      residualErrorMm,
      status: String(img.calibrationStatus ?? "ok"),
    };
  });

  const measurementsLog = revEng.measurements.map((m) => {
    const rawM = m as unknown as Record<string, unknown>;
    const val = Number(m.valueMmOrDeg ?? rawM.value ?? 0);
    const unc = Number(m.uncertaintyMmOrDeg ?? rawM.uncertainty ?? 0.05);
    const st = String(m.infoStatus ?? rawM.status ?? "MEDIDO");
    return {
      code: m.code,
      label: m.label,
      instrument: m.instrument,
      measuredValue: `${val.toFixed(2)} ±${unc.toFixed(2)} ${m.unit}`,
      drawnValue:
        typeof m.drawnNominalValue === "number" ? `${m.drawnNominalValue.toFixed(2)} ${m.unit}` : "—",
      discrepancy:
        typeof m.discrepancyMm === "number" ? `${m.discrepancyMm.toFixed(2)} ${m.unit}` : "—",
      status: st,
    };
  });

  const generatedAtIso = new Date().toISOString();

  const mdLines: string[] = [
    `# DOSSIÊ TÉCNICO DE ENGENHARIA REVERSA — CALDRA CHAMFER CAD`,
    ``,
    `- **Peça:** ${partName}`,
    `- **Data de Geração:** ${generatedAtIso}`,
    `- **Método de Projeção:** ${revEng.projectionDihedral === "3_diedro" ? "3º Diedro (ISO-A)" : "1º Diedro (ISO-E)"}`,
    `- **Material:** ${massProps.material.label} (${massProps.material.densityGPerCm3.toFixed(2)} g/cm³)`,
    `- **Espessura Global (H):** ${baseThicknessStatus === "DESCONHECIDO" ? "DESCONHECIDA" : `${baseThicknessMm.toFixed(2)} mm (${baseThicknessStatus})`}`,
    `- **Volume Líquido Calculado:** ${massProps.netVolumeCm3.toFixed(3)} cm³ (${massProps.netVolumeMm3.toFixed(1)} mm³)`,
    `- **Massa Estimada:** ${massProps.estimatedMassGrams.toFixed(2)} g${massProps.weighedMassGrams ? ` (Balança Real: ${massProps.weighedMassGrams.toFixed(2)} g | Δ = ${massProps.massDiscrepancyPercent?.toFixed(1)}%)` : ""}`,
    `- **Prontidão CAD 3D / ISO 2D:** ${readiness.canConvertTo3D ? "LIBERADO" : "BLOQUEADO (Dados 3D Pendentes)"}`,
    ``,
    `## 1. Referências Ópticas e Vistas Calibradas (${referencesUsed.length})`,
    ...(referencesUsed.length === 0
      ? [`- Nenhuma imagem de referência importada (reconstrução direta por bancada).`]
      : referencesUsed.map(
          (r) =>
            `- **${r.name}** [${r.viewTag}]: ${r.mmPerPx.toFixed(4)} mm/px (${r.calibrationMode}, erro RMS = ${r.residualErrorMm.toFixed(3)} mm, status: ${r.status})`,
        )),
    ``,
    `## 2. Caderno de Medições de Bancada (${measurementsLog.length})`,
    ...(measurementsLog.length === 0
      ? [`- Nenhuma medição registrada.`]
      : measurementsLog.map(
          (m) =>
            `- **${m.code} — ${m.label}** (${m.instrument}): Medido = ${m.measuredValue} | Desenhado = ${m.drawnValue} | Δ = ${m.discrepancy} | Estado = **${m.status}**`,
        )),
    ``,
    `## 3. Hipóteses de Projeto Aceitas (${acceptedHypotheses.length})`,
    ...(acceptedHypotheses.length === 0
      ? [`- Nenhuma hipótese de projeto nominal aceita.`]
      : acceptedHypotheses.map((h) => `- ${h}`)),
    ``,
    `## 4. Mapa de Confiança das Entidades (${confMap.entries.length})`,
    `- Confirmadas por Medição (MEDIDO): ${confMap.countsByStatus.MEDIDO}`,
    `- Calculadas Analiticamente (CALCULADO): ${confMap.countsByStatus.CALCULADO}`,
    `- Ajustadas por Mínimos Quadrados (AJUSTADO): ${confMap.countsByStatus.AJUSTADO}`,
    `- Estimadas por Imagem/Malha (ESTIMADO): ${confMap.countsByStatus.ESTIMADO}`,
    `- Nominais de Projeto Aceitos (NOMINAL_ACEITO): ${confMap.countsByStatus.NOMINAL_ACEITO}`,
    `- Hipóteses Pendentes (HIPOTESE): ${confMap.countsByStatus.HIPOTESE}`,
    `- Desconhecidas / Pendentes (DESCONHECIDO): ${confMap.countsByStatus.DESCONHECIDO}`,
    ``,
    `## 5. Desvios de Inspeção e Erros Detectados`,
    `- Pontos de Contorno Capturados: ${comp.pointCount} pts (RMS = ${comp.rmsDeviationMm.toFixed(3)} mm | Máx = ${comp.maxDeviationMm.toFixed(3)} mm)`,
    `- Ocorrências Geométricas: ${errAudit.totalCount} (${errAudit.criticalCount} críticas, ${errAudit.warningCount} avisos, ${errAudit.suggestionCount} sugestões)`,
    ``,
    `## 6. Dimensões Ainda Desconhecidas e Advertências`,
    ...(unknownDimensionsAndGaps.length === 0
      ? [`- Todas as dimensões e profundidades registradas possuem valor conhecido.`]
      : unknownDimensionsAndGaps.map((u) => `- [PENDENTE] ${u}`)),
    ...(insufficientDataWarnings.map((w) => `- [ADVERTÊNCIA] ${w}`)),
  ];

  return {
    partName,
    generatedAtIso,
    projectionDihedral: revEng.projectionDihedral ?? "1_diedro",
    materialLabel: massProps.material.label,
    baseThicknessMm: baseThicknessStatus === "DESCONHECIDO" ? null : baseThicknessMm,
    baseThicknessStatus,
    netVolumeCm3: massProps.netVolumeCm3,
    estimatedMassGrams: massProps.estimatedMassGrams,
    weighedMassGrams: massProps.weighedMassGrams,
    canConvertTo3D: readiness.canConvertTo3D,
    unknownDimensionsAndGaps,
    referencesUsed,
    measurementsLog,
    acceptedHypotheses,
    comparatorSummary: {
      capturedPointsCount: comp.pointCount,
      rmsDeviationMm: comp.rmsDeviationMm,
      maxDeviationMm: comp.maxDeviationMm,
      geometryErrorsCount: errAudit.totalCount,
    },
    insufficientDataWarnings,
    markdownReport: mdLines.join("\n"),
  };
}

// ============================================================================
// 4. REGISTRO DE COMANDOS TIPADOS E CHAMFER INTENT SEM UI (SEÇÃO 15 & TESTE T21)
// ============================================================================

export type RevEngTypedCommandId =
  | "create_eye"
  | "create_tangent_bridge"
  | "locate_hole_by_caliper"
  | "solve_hole_network"
  | "radius_from_chord_sagitta"
  | "create_pocket"
  | "create_teeth"
  | "calibrate_reference";

export interface RevEngIntentExecutionResult {
  status: "ok" | "executed" | "needs_clarification" | "validation_error";
  commandChain: RevEngTypedCommandId[];
  entities: Entity[];
  summaryPtBr: string;
  messagePtBr: string;
  clarificationQuestionPtBr?: string;
  missingParameters?: string[];
  diagnostics?: Record<string, unknown>;
}

/**
 * Interpreta e executa comandos de Engenharia Reversa via CHAMFER INTENT usando
 * exatamente os mesmos validadores matemáticos da interface (Seção 15 & Teste T21).
 *
 * Exemplo canônico da Seção 15 / T21:
 *   "Crie um olhal R20 no furo Ø20 e ligue com ponte côncava R120 ao olhal R35 do furo Ø30 a 132,4 mm"
 *
 * Se o pedido for ambíguo ou omitir parâmetros essenciais (ex.: raio da ponte ou distância centro-a-centro),
 * retorna `status: "needs_clarification"` com pergunta explícita em português sem inventar dados.
 */
export function parseAndExecuteRevEngIntent(
  prompt: string,
  targetLayerOrEntities: LayerId | Entity[] = "corte",
): RevEngIntentExecutionResult {
  const targetLayer: LayerId =
    typeof targetLayerOrEntities === "string" ? targetLayerOrEntities : "corte";
  const clean = prompt.trim();
  const lower = clean.toLowerCase();

  const parseNum = (s: string | undefined): number | null => {
    if (!s) return null;
    const n = parseFloat(s.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  // Caso 1: Olhais + Ponte Tangente (Seção 15 / Teste T21)
  if (lower.includes("olhal") || lower.includes("ponte")) {
    // Extrair raios de olhal (ex.: "olhal R20 ... olhal R35")
    const eyeMatches = [...clean.matchAll(/olhal\s*[rR]\s*(\d+(?:[.,]\d+)?)/gi)];
    // Extrair diâmetros de furos (ex.: "furo Ø20 ... furo Ø30")
    const holeMatches = [
      ...clean.matchAll(/furo\s*(?:[\u00d8\u00f8dD]|de\s*)?\s*(\d+(?:[.,]\d+)?)/gi),
    ];
    // Extrair ponte tangente (ex.: "ponte côncava R120" ou "ponte convexa R90")
    const bridgeMatch = clean.match(
      /ponte\s*(c[oô]ncava|convexa|reta)?\s*(?:[rR]\s*(\d+(?:[.,]\d+)?))?/i,
    );
    // Extrair distância centro a centro (ex.: "a 132,4 mm" ou "distância 132,4")
    const distMatch = clean.match(
      /(?:a|dist[aâ]ncia|passo|centro\s*a\s*centro)\s*(\d+(?:[.,]\d+)?)\s*mm/i,
    );

    const missing: string[] = [];
    const rEye1 = eyeMatches[0] ? parseNum(eyeMatches[0][1]) : null;
    const rEye2 = eyeMatches[1] ? parseNum(eyeMatches[1][1]) : null;
    const dHole1 = holeMatches[0] ? parseNum(holeMatches[0][1]) : null;
    const dHole2 = holeMatches[1] ? parseNum(holeMatches[1][1]) : null;
    const bridgeTypeStr = bridgeMatch?.[1]?.toLowerCase() ?? null;
    const bridgeRadius = bridgeMatch?.[2] ? parseNum(bridgeMatch[2]) : null;
    const centerDist = distMatch ? parseNum(distMatch[1]) : null;

    if (rEye1 === null) missing.push("Raio do primeiro olhal (ex.: R20)");
    if (rEye2 === null) missing.push("Raio do segundo olhal (ex.: R35)");
    if (centerDist === null) {
      missing.push("Distância entre os centros dos furos/olhais (ex.: 132,4 mm)");
    }
    if (!bridgeTypeStr) {
      missing.push("Tipo da ponte tangente (côncava, convexa ou reta)");
    } else if (
      (bridgeTypeStr.startsWith("cônc") ||
        bridgeTypeStr.startsWith("conc") ||
        bridgeTypeStr.startsWith("conv")) &&
      bridgeRadius === null
    ) {
      missing.push("Raio R do arco da ponte tangente (ex.: R120)");
    }

    if (missing.length > 0) {
      const msg =
        "Pedido ambíguo ou incompleto para construção de olhais com ponte tangente.";
      return {
        status: "needs_clarification",
        commandChain: ["create_eye", "create_tangent_bridge"],
        entities: [],
        summaryPtBr: msg,
        messagePtBr: msg,
        missingParameters: missing,
        clarificationQuestionPtBr: `Para construir os olhais e a ponte tangente sem inventar dimensões, informe: ${missing.join("; ")}. Qual lado da linha de centros deseja para o arco tangente?`,
      };
    }

    // Todos os parâmetros estão presentes: executar com o mesmo núcleo matemático (revEngTangentBridges)
    const c1: Vec2 = { x: 0, y: 0 };
    const c2: Vec2 = { x: centerDist!, y: 0 };
    const hole1D = dHole1 !== null ? dHole1 : Math.max(4, rEye1!);
    const hole2D = dHole2 !== null ? dHole2 : Math.max(4, rEye2!);

    const eye1 = buildConcentricEye({
      center: c1,
      holeDiameterMm: hole1D,
      sizingMode: "outer_radius",
      outerRadiusMm: rEye1!,
      outerLayer: targetLayer,
    });

    const eye2 = buildConcentricEye({
      center: c2,
      holeDiameterMm: hole2D,
      sizingMode: "outer_radius",
      outerRadiusMm: rEye2!,
      outerLayer: targetLayer,
    });

    if (!eye1.valid || !eye2.valid) {
      const msg = `${eye1.errorMessage ?? ""} ${eye2.errorMessage ?? ""}`.trim();
      return {
        status: "validation_error",
        commandChain: ["create_eye"],
        entities: [],
        summaryPtBr: msg,
        messagePtBr: msg,
      };
    }

    const isConcave =
      bridgeTypeStr!.startsWith("cônc") || bridgeTypeStr!.startsWith("conc");
    const bridgeKind: TangentBridgeKind = isConcave
      ? "arc_concave"
      : bridgeTypeStr!.startsWith("conv")
        ? "arc_convex"
        : "line_external";

    const bridgeRes = solveTangentBridge({
      circle1: { center: c1, radiusMm: eye1.outerRadiusMm },
      circle2: { center: c2, radiusMm: eye2.outerRadiusMm },
      kind: bridgeKind,
      bridgeRadiusMm: bridgeRadius ?? undefined,
      layer: targetLayer,
    });

    if (!bridgeRes.valid || bridgeRes.solutions.length === 0) {
      const msg = bridgeRes.reasonIfInvalid ?? "Sem solução para a ponte tangente solicitada.";
      return {
        status: "validation_error",
        commandChain: ["create_eye", "create_tangent_bridge"],
        entities: [],
        summaryPtBr: msg,
        messagePtBr: msg,
        diagnostics: {
          minRequiredRadiusMm: bridgeRes.minRadiusMm,
        },
      };
    }

    const solA = bridgeRes.solutions[0]!;
    const bridgeEntity: Entity = {
      ...solA.bridgeEntity,
      params: {
        ...solA.bridgeEntity.params,
        featureKind: "tangent_bridge_arc",
        t1X: solA.t1.x,
        t1Y: solA.t1.y,
        t2X: solA.t2.x,
        t2Y: solA.t2.y,
        tangencyErrorMm: solA.tangencyErrorMm,
      },
    };

    const allEntities: Entity[] = [
      eye1.holeEntity,
      eye1.outerEyeEntity,
      eye2.holeEntity,
      eye2.outerEyeEntity,
      bridgeEntity,
    ];

    const summary = `Olhal 1 (R${eye1.outerRadiusMm}/Ø${hole1D}) em (0;0) e Olhal 2 (R${eye2.outerRadiusMm}/Ø${hole2D}) em (${centerDist};0) conectados por ponte ${isConcave ? "côncava" : "convexa"} R${bridgeRadius} (erro tangência = ${solA.tangencyErrorMm.toExponential(2)} mm).`;

    return {
      status: "ok",
      commandChain: ["locate_hole_by_caliper", "create_eye", "create_tangent_bridge"],
      entities: allEntities,
      summaryPtBr: summary,
      messagePtBr: summary,
      diagnostics: {
        arcSolution: solA,
        maxTangencyErrorMm: solA.tangencyErrorMm,
      },
    };
  }

  // Caso 2: Corda e Flecha via comando textual
  if (lower.includes("corda") && lower.includes("flecha")) {
    const cMatch = clean.match(/corda\s*(?:de|=)?\s*(\d+(?:[.,]\d+)?)/i);
    const fMatch = clean.match(/flecha\s*(?:de|=)?\s*(\d+(?:[.,]\d+)?)/i);
    const cVal = parseNum(cMatch?.[1]);
    const fVal = parseNum(fMatch?.[1]);
    if (cVal === null || fVal === null) {
      const msg = "Informe a corda (c) e a flecha (f) em milímetros.";
      return {
        status: "needs_clarification",
        commandChain: ["radius_from_chord_sagitta"],
        entities: [],
        summaryPtBr: msg,
        messagePtBr: msg,
        missingParameters: ["corda (c)", "flecha (f)"],
        clarificationQuestionPtBr: "Qual é o valor da corda (c) e da flecha/sagita (f) em mm?",
      };
    }
    const res = computeRadiusFromChordSagitta({
      chordMm: cVal,
      sagittaMm: fVal,
      chordUncertaintyMm: 0.1,
      sagittaUncertaintyMm: 0.05,
    });
    const arcEntity: Entity = {
      id: `reveng-chord-arc-${Date.now()}`,
      type: "arc",
      layer: targetLayer,
      cx: 0,
      cy: -(res.radiusMm - fVal),
      r: res.radiusMm,
      a0: Math.PI / 2 - (res.sweepAngleDeg * Math.PI) / 360,
      a1: Math.PI / 2 + (res.sweepAngleDeg * Math.PI) / 360,
      params: {
        infoStatus: "CALCULADO",
        featureKind: "chord_sagitta_arc",
      },
    };
    return {
      status: "ok",
      commandChain: ["radius_from_chord_sagitta"],
      entities: [arcEntity],
      summaryPtBr: res.formulaSummary,
      messagePtBr: res.formulaSummary,
      diagnostics: { radiusMm: res.radiusMm },
    };
  }

  const fallbackMsg = "Comando de Engenharia Reversa não reconhecido ou incompleto.";
  return {
    status: "needs_clarification",
    commandChain: [],
    entities: [],
    summaryPtBr: fallbackMsg,
    messagePtBr: fallbackMsg,
    clarificationQuestionPtBr:
      "Especifique a operação desejada (ex.: olhais e ponte tangente, furo por paquímetro, corda e flecha, cavidade de parede constante ou dentes).",
  };
}

/**
 * Executa diretamente um comando tipado do registro de Engenharia Reversa sem depender da UI (Seção 15).
 */
export function executeRevEngTypedCommand(
  commandIdOrObj:
    | RevEngTypedCommandId
    | ({ type: RevEngTypedCommandId } & Record<string, unknown>),
  payloadArg?: Record<string, unknown>,
): {
  status: "ok" | "error";
  entities: Entity[];
  result: unknown;
} {
  const commandId: RevEngTypedCommandId =
    typeof commandIdOrObj === "string" ? commandIdOrObj : commandIdOrObj.type;
  const payload: Record<string, unknown> =
    typeof commandIdOrObj === "string" ? (payloadArg ?? {}) : commandIdOrObj;

  switch (commandId) {
    case "locate_hole_by_caliper": {
      const res = computeHoleByCaliper(
        payload as unknown as Parameters<typeof computeHoleByCaliper>[0],
      );
      const holeEnt: Entity = {
        id: `cmd-hole-${Date.now()}`,
        type: "circle",
        layer: "corte",
        cx: res.centerX,
        cy: res.centerY,
        r: res.radiusMm,
        params: { infoStatus: res.infoStatus },
      };
      return { status: res.valid ? "ok" : "error", entities: [holeEnt], result: res };
    }
    case "solve_hole_network": {
      const res = solveHoleNetworkGaussNewton(
        (payload.nodes as HoleNetworkNode[]) ?? [],
        (payload.edges as HoleNetworkEdge[]) ?? [],
      );
      return { status: "ok", entities: [], result: res };
    }
    case "radius_from_chord_sagitta": {
      const res = computeRadiusFromChordSagitta(
        payload as unknown as Parameters<typeof computeRadiusFromChordSagitta>[0],
      );
      const arcEnt: Entity = {
        id: `cmd-arc-${Date.now()}`,
        type: "arc",
        layer: "corte",
        cx: 0,
        cy: -(res.radiusMm - res.sagittaMm),
        r: res.radiusMm,
        a0: Math.PI / 2 - (res.sweepAngleDeg * Math.PI) / 360,
        a1: Math.PI / 2 + (res.sweepAngleDeg * Math.PI) / 360,
        params: { infoStatus: "CALCULADO" },
      };
      return { status: res.valid ? "ok" : "error", entities: [arcEnt], result: res };
    }
    case "create_eye": {
      const res = buildConcentricEye(
        payload as unknown as Parameters<typeof buildConcentricEye>[0],
      );
      return {
        status: res.valid ? "ok" : "error",
        entities: [res.holeEntity, res.outerEyeEntity],
        result: res,
      };
    }
    case "create_tangent_bridge": {
      const res = solveTangentBridge(
        payload as unknown as Parameters<typeof solveTangentBridge>[0],
      );
      return {
        status: res.valid ? "ok" : "error",
        entities: res.solutions.map((s) => s.bridgeEntity),
        result: res,
      };
    }
    case "create_pocket": {
      const res = computeConstantWallPocket(
        payload as unknown as Parameters<typeof computeConstantWallPocket>[0],
      );
      return {
        status: "ok",
        entities: res.pocketEntities ?? [],
        result: res,
      };
    }
    case "create_teeth": {
      const res = generateLinearRackProfile(
        payload as unknown as Parameters<typeof generateLinearRackProfile>[0],
      );
      return {
        status: "ok",
        entities: res.entity ? [res.entity] : [],
        result: res,
      };
    }
    case "calibrate_reference": {
      const res = calibrateByTwoPoints(
        (payload.p1Px as Vec2) ?? { x: 0, y: 0 },
        (payload.p2Px as Vec2) ?? { x: 100, y: 0 },
        Number(payload.knownLengthMm ?? 100),
      );
      return { status: "ok", entities: [], result: res };
    }
  }
}
