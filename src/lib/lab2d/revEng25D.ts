/**
 * CALDRA CHAMFER CAD — ENGENHARIA REVERSA (FASE E)
 * Vistas Vinculadas (1º/3º Diedro), Mapa de Profundidades 2.5D, Volume/Massa Analíticos,
 * Gerador Automático de Corte Técnico A–A, Auditor de Restrições/Conflitos (DOF) e Fatiador de Malha STL.
 *
 * Restrito estritamente ao escopo `src/lib/lab2d`.
 */

import type { Entity, LayerId, Vec2 } from "./core";
import type {
  ProjectionDihedralMode,
  RevEngCrossViewLink,
  RevEngGeometricConstraint,
  RevEngInfoStatus,
  RevEngMaterialKey,
  RevEngReferenceImage,
  RevEngRegion25D,
  RevEngRegion25DKind,
  RevEngSectionLineAA,
} from "./revEngTypes";

// ============================================================================
// 1. TABELA DE MATERIAIS E DENSIDADES PARA ENGENHARIA REVERSA (SEÇÃO 13 / T12)
// ============================================================================

export interface RevEngMaterialSpec {
  key: RevEngMaterialKey;
  label: string;
  shortLabel: string;
  densityGPerCm3: number;
}

export const REV_ENG_MATERIALS: Record<RevEngMaterialKey, RevEngMaterialSpec> = {
  aco_carbono: {
    key: "aco_carbono",
    label: "Aço Carbono (SAE 1020/1045)",
    shortLabel: "Aço Carbono",
    densityGPerCm3: 7.85,
  },
  aco_inox_304: {
    key: "aco_inox_304",
    label: "Aço Inox Austenítico (AISI 304/316)",
    shortLabel: "Inox 304",
    densityGPerCm3: 7.93,
  },
  aluminio_6061: {
    key: "aluminio_6061",
    label: "Alumínio Estrutural (6061-T6 / 5052)",
    shortLabel: "Alumínio",
    densityGPerCm3: 2.7,
  },
  latao: {
    key: "latao",
    label: "Latão Usinável (C36000)",
    shortLabel: "Latão",
    densityGPerCm3: 8.5,
  },
  bronze: {
    key: "bronze",
    label: "Bronze Fosforoso / Bucha (SAE 660)",
    shortLabel: "Bronze",
    densityGPerCm3: 8.8,
  },
  ferro_fundido: {
    key: "ferro_fundido",
    label: "Ferro Fundido Cinzento (GG25)",
    shortLabel: "FoFo GG25",
    densityGPerCm3: 7.2,
  },
  nylon: {
    key: "nylon",
    label: "Nylon / Poliamida 6.6 (PA6)",
    shortLabel: "Nylon PA6",
    densityGPerCm3: 1.15,
  },
  abs_pla: {
    key: "abs_pla",
    label: "Polímero Protótipo (ABS / PLA / PETG)",
    shortLabel: "ABS / PLA",
    densityGPerCm3: 1.05,
  },
};

export const REV_ENG_REGION_KIND_META: Record<
  RevEngRegion25DKind,
  { label: string; shortLabel: string; description: string; isSubtractive: boolean }
> = {
  corpo_base: {
    label: "Corpo Base (Contorno Externo)",
    shortLabel: "Corpo Base",
    description: "Envelope principal da peça com espessura total H.",
    isSubtractive: false,
  },
  furo_passante: {
    label: "Furo / Recorte Passante (-Z total)",
    shortLabel: "Passante",
    description: "Atravessa 100% da espessura H da peça.",
    isSubtractive: true,
  },
  furo_cego: {
    label: "Furo Cego (-Z parcial)",
    shortLabel: "Furo Cego",
    description: "Furo com profundidade medida h_f < H e fundo remanescente H - h_f.",
    isSubtractive: true,
  },
  rebaixo_cego: {
    label: "Rebaixo / Pocket Cego (-Z parcial)",
    shortLabel: "Rebaixo Cego",
    description: "Cavidade usinada com profundidade h_p < H e parede de fundo e_fundo = H - h_p.",
    isSubtractive: true,
  },
  alojamento: {
    label: "Alojamento / Escariado (Counterbore)",
    shortLabel: "Alojamento",
    description: "Rebaixo cilíndrico para cabeça de parafuso ou rolamento.",
    isSubtractive: true,
  },
  rasgo: {
    label: "Rasgo / Canal / Chaveta",
    shortLabel: "Rasgo",
    description: "Canal oblongo ou chaveta com profundidade controlada.",
    isSubtractive: true,
  },
  cavidade: {
    label: "Cavidade Interna de Alívio",
    shortLabel: "Cavidade",
    description: "Bolsão interno (ex.: Auto-Pocket de parede constante).",
    isSubtractive: true,
  },
  ressalto_ilha: {
    label: "Ressalto / Ilha / Colar (+Z)",
    shortLabel: "Ressalto / Ilha",
    description: "Região preservada no topo ou saliente (+Δh) acima da face.",
    isSubtractive: false,
  },
  superficie_oculta: {
    label: "Superfície Oculta Não Medida",
    shortLabel: "Oculta",
    description: "Região interna visível apenas parcialmente sem cota Z confirmada.",
    isSubtractive: true,
  },
};

// ============================================================================
// 2. UTILITÁRIOS GEOMÉTRICOS DE ÁREA E POLÍGONOS 2D
// ============================================================================

export function computeSignedPolygonAreaMm2(pts: Vec2[]): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum * 0.5;
}

export function computePolygonAreaMm2(pts: Vec2[]): number {
  return Math.abs(computeSignedPolygonAreaMm2(pts));
}

export function sampleEntityClosedPolygon(entity: Entity, circleSegments = 64): Vec2[] | null {
  if (entity.type === "circle") {
    const pts: Vec2[] = [];
    for (let i = 0; i < circleSegments; i++) {
      const ang = (2 * Math.PI * i) / circleSegments;
      pts.push({
        x: entity.cx + entity.r * Math.cos(ang),
        y: entity.cy + entity.r * Math.sin(ang),
      });
    }
    return pts;
  }
  if (entity.type === "polyline" && entity.closed && entity.pts.length >= 3) {
    return entity.pts;
  }
  if (entity.type === "ellipse") {
    const pts: Vec2[] = [];
    const rot = entity.rotation || 0;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    for (let i = 0; i < circleSegments; i++) {
      const ang = (2 * Math.PI * i) / circleSegments;
      const lx = entity.rx * Math.cos(ang);
      const ly = entity.ry * Math.sin(ang);
      pts.push({
        x: entity.cx + lx * cosR - ly * sinR,
        y: entity.cy + lx * sinR + ly * cosR,
      });
    }
    return pts;
  }
  return null;
}

export function computeEntityPlanarAreaMm2(entity: Entity): number {
  if (entity.type === "circle") {
    return Math.PI * entity.r * entity.r;
  }
  if (entity.type === "ellipse") {
    return Math.PI * entity.rx * entity.ry;
  }
  if (entity.type === "polyline" && entity.closed && entity.pts.length >= 3) {
    return computePolygonAreaMm2(entity.pts);
  }
  return 0;
}

// ============================================================================
// 3. SINCRONIZAÇÃO E AUTO-CLASSIFICAÇÃO DE REGIÕES 2.5D A PARTIR DO CANVAS
// ============================================================================

export function syncRegions25DFromEntities(params: {
  entities: Entity[];
  baseThicknessMm: number;
  baseThicknessStatus: RevEngInfoStatus;
  existingRegions?: RevEngRegion25D[];
}): RevEngRegion25D[] {
  const { entities, baseThicknessMm, baseThicknessStatus, existingRegions = [] } = params;
  const byEntityId = new Map<string, RevEngRegion25D>();
  for (const r of existingRegions) {
    byEntityId.set(r.entityId, r);
  }

  // Coletar todas as entidades fechadas não-construtivas
  const closedCandidates: Array<{ entity: Entity; areaMm2: number }> = [];
  for (const e of entities) {
    if (e.isConstruction) continue;
    const area = computeEntityPlanarAreaMm2(e);
    if (area > 1e-2) {
      closedCandidates.push({ entity: e, areaMm2: area });
    }
  }

  // Ordenar da maior área para a menor
  closedCandidates.sort((a, b) => b.areaMm2 - a.areaMm2);

  const synced: RevEngRegion25D[] = [];
  closedCandidates.forEach((cand, idx) => {
    const { entity, areaMm2 } = cand;
    const prev = byEntityId.get(entity.id);

    // Determinar tipo padrão quando a região é descoberta pela primeira vez
    let defaultKind: RevEngRegion25DKind = "furo_passante";
    let defaultDepth: number | null = baseThicknessMm;
    let defaultStatus: RevEngInfoStatus =
      (entity.params?.infoStatus as RevEngInfoStatus | undefined) ?? "MEDIDO";

    if (idx === 0 && (entity.type === "polyline" || closedCandidates.length === 1)) {
      defaultKind = "corpo_base";
      defaultDepth = baseThicknessStatus === "DESCONHECIDO" ? null : baseThicknessMm;
      defaultStatus = baseThicknessStatus;
    } else if (
      entity.params?.featureKind === "auto_pocket_2d" ||
      (entity.type === "polyline" && idx > 0)
    ) {
      defaultKind = "rebaixo_cego";
      // Rebaixo recém-criado sem medição de profundidade inicia com metade da espessura ou mantém prev
      defaultDepth = Number((baseThicknessMm * 0.4).toFixed(2));
      defaultStatus = "MEDIDO";
    } else if (entity.type === "circle") {
      defaultKind = "furo_passante";
      defaultDepth = baseThicknessStatus === "DESCONHECIDO" ? null : baseThicknessMm;
    }

    const regionKind = prev?.regionKind ?? defaultKind;
    const depthStatus =
      regionKind === "corpo_base"
        ? baseThicknessStatus
        : prev?.depthStatus ?? defaultStatus;

    let depthMm: number | null;
    if (depthStatus === "DESCONHECIDO") {
      depthMm = null;
    } else if (regionKind === "corpo_base" || regionKind === "furo_passante") {
      depthMm = baseThicknessMm;
    } else {
      depthMm = prev?.depthMm ?? defaultDepth;
    }

    const label =
      prev?.label ??
      (regionKind === "corpo_base"
        ? `Contorno Base (${areaMm2.toFixed(0)} mm²)`
        : entity.type === "circle"
          ? `Furo Ø${(entity.r * 2).toFixed(1)} mm`
          : `Cavidade / Rebaixo #${idx} (${areaMm2.toFixed(0)} mm²)`);

    synced.push({
      id: prev?.id ?? `reg25d-${entity.id}`,
      entityId: entity.id,
      label,
      regionKind,
      depthMm,
      depthStatus,
      zStartMm: prev?.zStartMm ?? 0,
      areaMm2,
      notes: prev?.notes,
    });
  });

  return synced;
}

// ============================================================================
// 4. VALIDAÇÃO DE CONVERSÃO 2.5D / 3D E BLOQUEIO DE PROFUNDIDADES DESCONHECIDAS (T14)
// ============================================================================

export interface RevEngDepthConflictItem {
  regionId: string;
  regionLabel: string;
  severity: "critico" | "aviso";
  code:
    | "PROFUNDIDADE_DESCONHECIDA"
    | "RUPTURA_FUNDO_CEGO"
    | "PAREDE_FUNDO_MUITO_FINA"
    | "ESPESSURA_BASE_DESCONHECIDA";
  remainingFloorMm: number | null;
  message: string;
}

export interface RevEng25DReadinessReport {
  canConvertTo3D: boolean;
  canProjectIso25D: boolean;
  baseThicknessMm: number;
  baseThicknessStatus: RevEngInfoStatus;
  pendingUnknownRegionIds: string[];
  blockingMessages: string[];
  conflictsAndWarnings: RevEngDepthConflictItem[];
  summaryMessage: string;
}

export function evaluate25DConversionReadiness(params: {
  regions: RevEngRegion25D[];
  baseThicknessMm: number;
  baseThicknessStatus: RevEngInfoStatus;
  minSafeFloorThicknessMm?: number;
}): RevEng25DReadinessReport {
  const {
    regions,
    baseThicknessMm,
    baseThicknessStatus,
    minSafeFloorThicknessMm = 1.0,
  } = params;

  const pendingUnknownRegionIds: string[] = [];
  const blockingMessages: string[] = [];
  const conflictsAndWarnings: RevEngDepthConflictItem[] = [];

  if (
    baseThicknessStatus === "DESCONHECIDO" ||
    !Number.isFinite(baseThicknessMm) ||
    baseThicknessMm <= 0
  ) {
    blockingMessages.push(
      "Conversão 3D bloqueada: a espessura total (H) da peça está marcada como DESCONHECIDO. Aferir espessura com paquímetro antes de extrudar.",
    );
    conflictsAndWarnings.push({
      regionId: "base-thickness",
      regionLabel: "Espessura Global (H)",
      severity: "critico",
      code: "ESPESSURA_BASE_DESCONHECIDA",
      remainingFloorMm: null,
      message:
        "Espessura global H desconhecida. O CHAMFER CAD nunca inventa espessuras ocultas.",
    });
  }

  const hasBaseBody = regions.some((r) => r.regionKind === "corpo_base");
  if (!hasBaseBody && regions.length === 0) {
    blockingMessages.push(
      "Nenhuma região fechada 2.5D encontrada para extrusão.",
    );
  }

  for (const reg of regions) {
    if (
      reg.depthStatus === "DESCONHECIDO" ||
      reg.regionKind === "superficie_oculta" ||
      reg.depthMm === null ||
      !Number.isFinite(reg.depthMm) ||
      reg.depthMm <= 0
    ) {
      pendingUnknownRegionIds.push(reg.id);
      const msg = `Conversão 3D bloqueada: região "${reg.label}" possui profundidade Z DESCONHECIDA.`;
      blockingMessages.push(msg);
      conflictsAndWarnings.push({
        regionId: reg.id,
        regionLabel: reg.label,
        severity: "critico",
        code: "PROFUNDIDADE_DESCONHECIDA",
        remainingFloorMm: null,
        message: msg,
      });
      continue;
    }

    // Verificar furos/rebaixos cegos contra a espessura total H
    const isBlindFeature =
      reg.regionKind === "furo_cego" ||
      reg.regionKind === "rebaixo_cego" ||
      reg.regionKind === "alojamento" ||
      reg.regionKind === "cavidade" ||
      reg.regionKind === "rasgo";

    if (isBlindFeature && baseThicknessStatus !== "DESCONHECIDO" && baseThicknessMm > 0) {
      const remainingFloor = baseThicknessMm - reg.depthMm;
      if (remainingFloor <= 1e-6) {
        const msg = `Conflito em "${reg.label}": profundidade cega (${reg.depthMm.toFixed(2)} mm) ≥ espessura base H (${baseThicknessMm.toFixed(2)} mm), rompendo o fundo (e_fundo = ${remainingFloor.toFixed(2)} mm).`;
        blockingMessages.push(msg);
        conflictsAndWarnings.push({
          regionId: reg.id,
          regionLabel: reg.label,
          severity: "critico",
          code: "RUPTURA_FUNDO_CEGO",
          remainingFloorMm: remainingFloor,
          message: msg,
        });
      } else if (remainingFloor < minSafeFloorThicknessMm) {
        conflictsAndWarnings.push({
          regionId: reg.id,
          regionLabel: reg.label,
          severity: "aviso",
          code: "PAREDE_FUNDO_MUITO_FINA",
          remainingFloorMm: remainingFloor,
          message: `Aviso em "${reg.label}": parede remanescente no fundo e_fundo = ${remainingFloor.toFixed(2)} mm (< ${minSafeFloorThicknessMm.toFixed(1)} mm).`,
        });
      }
    }
  }

  const canConvertTo3D = blockingMessages.length === 0 && regions.length > 0;

  const summaryMessage = canConvertTo3D
    ? `2.5D pronto para extrusão 3D e ISO 2D (${regions.length} regiões com profundidades verificadas, H = ${baseThicknessMm.toFixed(2)} mm).`
    : blockingMessages[0] ?? "Existem profundidades DESCONHECIDAS ou em conflito que impedem a geração de sólido 3D.";

  return {
    canConvertTo3D,
    canProjectIso25D: canConvertTo3D,
    baseThicknessMm,
    baseThicknessStatus,
    pendingUnknownRegionIds,
    blockingMessages,
    conflictsAndWarnings,
    summaryMessage,
  };
}

// ============================================================================
// 5. CÁLCULO ANALÍTICO DE ÁREA, VOLUME LÍQUIDO, MASSA E BALANÇA (SEÇÃO 13 / T12)
// ============================================================================

export interface RevEng25DMassPropertiesResult {
  baseThicknessMm: number;
  baseAreaMm2: number;
  throughHolesAreaMm2: number;
  blindFeaturesAreaMm2: number;
  netTopFaceAreaMm2: number;
  grossVolumeMm3: number;
  throughRemovedVolumeMm3: number;
  blindRemovedVolumeMm3: number;
  bossAddedVolumeMm3: number;
  netVolumeMm3: number;
  netVolumeCm3: number;
  material: RevEngMaterialSpec;
  estimatedMassGrams: number;
  weighedMassGrams: number | null;
  massDiscrepancyGrams: number | null;
  massDiscrepancyPercent: number | null;
  scaleCheckCompatible: boolean | null;
  regionBreakdown: Array<{
    regionId: string;
    label: string;
    regionKind: RevEngRegion25DKind;
    areaMm2: number;
    effectiveDepthMm: number;
    remainingFloorMm: number;
    signedVolumeDeltaMm3: number;
  }>;
}

export function compute25DVolumeAndMass(params: {
  regions: RevEngRegion25D[];
  baseThicknessMm: number;
  materialKey?: RevEngMaterialKey;
  weighedMassGrams?: number | null;
  scaleTolerancePercent?: number;
}): RevEng25DMassPropertiesResult {
  const {
    regions,
    baseThicknessMm,
    materialKey = "aco_carbono",
    weighedMassGrams = null,
    scaleTolerancePercent = 5.0,
  } = params;

  const H = Math.max(0, baseThicknessMm);
  const material = REV_ENG_MATERIALS[materialKey] ?? REV_ENG_MATERIALS.aco_carbono;

  let baseAreaMm2 = 0;
  let throughHolesAreaMm2 = 0;
  let blindFeaturesAreaMm2 = 0;

  let grossVolumeMm3 = 0;
  let throughRemovedVolumeMm3 = 0;
  let blindRemovedVolumeMm3 = 0;
  let bossAddedVolumeMm3 = 0;

  const regionBreakdown: RevEng25DMassPropertiesResult["regionBreakdown"] = [];

  for (const reg of regions) {
    const A = Math.max(0, reg.areaMm2);
    if (reg.regionKind === "corpo_base") {
      baseAreaMm2 += A;
      const vol = A * H;
      grossVolumeMm3 += vol;
      regionBreakdown.push({
        regionId: reg.id,
        label: reg.label,
        regionKind: reg.regionKind,
        areaMm2: A,
        effectiveDepthMm: H,
        remainingFloorMm: H,
        signedVolumeDeltaMm3: vol,
      });
    } else if (reg.regionKind === "furo_passante") {
      throughHolesAreaMm2 += A;
      const vol = A * H;
      throughRemovedVolumeMm3 += vol;
      regionBreakdown.push({
        regionId: reg.id,
        label: reg.label,
        regionKind: reg.regionKind,
        areaMm2: A,
        effectiveDepthMm: H,
        remainingFloorMm: 0,
        signedVolumeDeltaMm3: -vol,
      });
    } else if (
      reg.regionKind === "rebaixo_cego" ||
      reg.regionKind === "furo_cego" ||
      reg.regionKind === "alojamento" ||
      reg.regionKind === "rasgo" ||
      reg.regionKind === "cavidade"
    ) {
      const rawDepth = reg.depthMm ?? 0;
      const effDepth = Math.max(0, Math.min(H, rawDepth));
      const floorMm = Math.max(0, H - effDepth);
      const vol = A * effDepth;
      blindFeaturesAreaMm2 += A;
      blindRemovedVolumeMm3 += vol;
      regionBreakdown.push({
        regionId: reg.id,
        label: reg.label,
        regionKind: reg.regionKind,
        areaMm2: A,
        effectiveDepthMm: effDepth,
        remainingFloorMm: floorMm,
        signedVolumeDeltaMm3: -vol,
      });
    } else if (reg.regionKind === "ressalto_ilha") {
      const bossH = Math.max(0, reg.depthMm ?? 0);
      const vol = A * bossH;
      bossAddedVolumeMm3 += vol;
      regionBreakdown.push({
        regionId: reg.id,
        label: reg.label,
        regionKind: reg.regionKind,
        areaMm2: A,
        effectiveDepthMm: bossH,
        remainingFloorMm: H + bossH,
        signedVolumeDeltaMm3: vol,
      });
    }
  }

  const netTopFaceAreaMm2 = Math.max(0, baseAreaMm2 - throughHolesAreaMm2 - blindFeaturesAreaMm2);
  const netVolumeMm3 = Math.max(
    0,
    grossVolumeMm3 - throughRemovedVolumeMm3 - blindRemovedVolumeMm3 + bossAddedVolumeMm3,
  );
  const netVolumeCm3 = netVolumeMm3 / 1000.0;
  const estimatedMassGrams = netVolumeCm3 * material.densityGPerCm3;

  let massDiscrepancyGrams: number | null = null;
  let massDiscrepancyPercent: number | null = null;
  let scaleCheckCompatible: boolean | null = null;

  if (typeof weighedMassGrams === "number" && weighedMassGrams > 0) {
    massDiscrepancyGrams = estimatedMassGrams - weighedMassGrams;
    massDiscrepancyPercent = (massDiscrepancyGrams / weighedMassGrams) * 100.0;
    scaleCheckCompatible = Math.abs(massDiscrepancyPercent) <= scaleTolerancePercent;
  }

  return {
    baseThicknessMm: H,
    baseAreaMm2,
    throughHolesAreaMm2,
    blindFeaturesAreaMm2,
    netTopFaceAreaMm2,
    grossVolumeMm3,
    throughRemovedVolumeMm3,
    blindRemovedVolumeMm3,
    bossAddedVolumeMm3,
    netVolumeMm3,
    netVolumeCm3,
    material,
    estimatedMassGrams,
    weighedMassGrams,
    massDiscrepancyGrams,
    massDiscrepancyPercent,
    scaleCheckCompatible,
    regionBreakdown,
  };
}

// ============================================================================
// 6. GERENCIADOR DE VISTAS VINCULADAS E DETECTOR DE INCONSISTÊNCIAS (SEÇÃO 10 / T14)
// ============================================================================

export interface CrossViewEvaluationItem {
  link: RevEngCrossViewLink;
  discrepancyMm: number;
  meanValueMm: number;
  compatible: boolean;
  diagnosticMessage: string;
}

export interface CrossViewConsistencyReport {
  projectionDihedral: ProjectionDihedralMode;
  calibratedViewCount: number;
  hasOrthogonalDepthView: boolean;
  items: CrossViewEvaluationItem[];
  inconsistentCount: number;
  maxDiscrepancyMm: number;
  rmsDiscrepancyMm: number;
  ambiguityWarnings: string[];
  status: "ok" | "inconsistente" | "subdeterminado";
}

export function evaluateCrossViewConsistency(params: {
  links: RevEngCrossViewLink[];
  projectionDihedral?: ProjectionDihedralMode;
  referenceImages?: RevEngReferenceImage[];
}): CrossViewConsistencyReport {
  const {
    links,
    projectionDihedral = "1_diedro",
    referenceImages = [],
  } = params;

  const calibratedViews = referenceImages.filter((img) => img.calibrationStatus === "ok");
  const viewTags = new Set(calibratedViews.map((img) => img.viewTag));
  for (const l of links) {
    viewTags.add(l.viewA);
    viewTags.add(l.viewB);
  }

  const hasPlanOrFront = viewTags.has("superior") || viewTags.has("frontal");
  const hasLateralOrSection = viewTags.has("lateral");
  const hasOrthogonalDepthView = hasPlanOrFront && (hasLateralOrSection || links.length > 0);

  let sumSq = 0;
  let maxDiscrepancyMm = 0;
  let inconsistentCount = 0;

  const items: CrossViewEvaluationItem[] = links.map((link) => {
    const diff = Math.abs(link.valueAMm - link.valueBMm);
    const mean = (link.valueAMm + link.valueBMm) * 0.5;
    const tol = Math.max(0.01, link.toleranceMm);
    const compatible = diff <= tol;

    sumSq += diff * diff;
    if (diff > maxDiscrepancyMm) maxDiscrepancyMm = diff;
    if (!compatible) inconsistentCount++;

    const diagnosticMessage = compatible
      ? `${link.label}: compatível entre ${link.viewA.toUpperCase()} (${link.valueAMm.toFixed(2)} mm) e ${link.viewB.toUpperCase()} (${link.valueBMm.toFixed(2)} mm) [Δ = ${diff.toFixed(2)} mm ≤ ±${tol.toFixed(2)} mm].`
      : `Inconsistência entre vistas em "${link.label}": ${link.viewA.toUpperCase()} mede ${link.valueAMm.toFixed(2)} mm vs. ${link.viewB.toUpperCase()} mede ${link.valueBMm.toFixed(2)} mm (divergência Δ = ${diff.toFixed(2)} mm > tol ±${tol.toFixed(2)} mm). Verifique paralaxe ou calibração das vistas.`;

    return {
      link,
      discrepancyMm: diff,
      meanValueMm: mean,
      compatible,
      diagnosticMessage,
    };
  });

  const rmsDiscrepancyMm = links.length > 0 ? Math.sqrt(sumSq / links.length) : 0;

  const ambiguityWarnings: string[] = [];
  if (!hasLateralOrSection) {
    ambiguityWarnings.push(
      "Apenas vista plana/frontal presente: projeções externas não determinam sozinhas a profundidade de rebaixos cegos ou rasgos internos. Meça a profundidade Z com vareta de paquímetro ou adicione vista lateral/corte.",
    );
  }
  if (inconsistentCount > 0) {
    ambiguityWarnings.push(
      `Foram detectadas ${inconsistentCount} inconsistência(s) dimensional(is) entre vistas vinculadas (erro máx ${maxDiscrepancyMm.toFixed(2)} mm). Não reconcilie silenciosamente sem aferir a peça física.`,
    );
  }

  const status: CrossViewConsistencyReport["status"] =
    inconsistentCount > 0
      ? "inconsistente"
      : hasOrthogonalDepthView
        ? "ok"
        : "subdeterminado";

  return {
    projectionDihedral,
    calibratedViewCount: calibratedViews.length,
    hasOrthogonalDepthView,
    items,
    inconsistentCount,
    maxDiscrepancyMm,
    rmsDiscrepancyMm,
    ambiguityWarnings,
    status,
  };
}

// ============================================================================
// 7. GERADOR AUTOMÁTICO DE VISTA DE CORTE TÉCNICO A–A (SEÇÃO 10.2, 13.4 & T12)
// ============================================================================

export type SectionIntervalState =
  | "vazio_externo"
  | "macico_hachurado"
  | "rebaixo_cego"
  | "furo_passante"
  | "furo_cego"
  | "ressalto_ilha";

export interface SectionAAInterval1D {
  sStartMm: number;
  sEndMm: number;
  lengthMm: number;
  state: SectionIntervalState;
  /** Cota Z inferior do material sólido neste trecho (geralmente 0) */
  zBottomMm: number;
  /** Cota Z superior do material sólido cortado (H para maciço, H - h_p para rebaixo cego, 0 para furo passante) */
  zTopMm: number;
  /** Altura da parede de fundo (traseira) visível ao fundo de furos/rebaixos (geralmente H) */
  backWallTopZMm: number;
  /** Espessura de material sólido cortado neste trecho (zTopMm - zBottomMm) */
  solidHeightMm: number;
  regionLabel?: string;
}

export interface SectionAAHoleAxisMarker {
  sCenterMm: number;
  diameterMm: number;
  isThrough: boolean;
  depthMm: number;
  label: string;
}

export interface TechnicalSectionAAResult {
  sectionLabel: string;
  p1: Vec2;
  p2: Vec2;
  totalSpanMm: number;
  partSpanStartMm: number;
  partSpanEndMm: number;
  partIntersectedWidthMm: number;
  baseThicknessMm: number;
  intervals: SectionAAInterval1D[];
  holeAxes: SectionAAHoleAxisMarker[];
  crossSectionSolidAreaMm2: number;
}

/**
 * Calcula interseções de uma reta orientada P1 -> P2 (parametrizada por distância s em mm)
 * com um polígono fechado. Retorna pares [s_in, s_out].
 */
function intersectLineWithPolygon1D(
  p1: Vec2,
  dirUnit: Vec2,
  totalLen: number,
  poly: Vec2[],
): Array<[number, number]> {
  if (poly.length < 3) return [];
  const normal = { x: -dirUnit.y, y: dirUnit.x };
  const sHits: number[] = [];

  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const da = (a.x - p1.x) * normal.x + (a.y - p1.y) * normal.y;
    const db = (b.x - p1.x) * normal.x + (b.y - p1.y) * normal.y;

    if ((da <= 0 && db > 0) || (db <= 0 && da > 0)) {
      const t = da / (da - db);
      const ix = a.x + t * (b.x - a.x);
      const iy = a.y + t * (b.y - a.y);
      const s = (ix - p1.x) * dirUnit.x + (iy - p1.y) * dirUnit.y;
      sHits.push(s);
    }
  }

  sHits.sort((x, y) => x - y);
  const intervals: Array<[number, number]> = [];
  for (let k = 0; k + 1 < sHits.length; k += 2) {
    const s0 = Math.max(0, sHits[k]!);
    const s1 = Math.min(totalLen, sHits[k + 1]!);
    if (s1 - s0 > 1e-4) {
      intervals.push([s0, s1]);
    }
  }
  return intervals;
}

/**
 * Calcula o intervalo [s_in, s_out] de interseção da linha de corte P1 -> P2 com um círculo.
 */
function intersectLineWithCircle1D(
  p1: Vec2,
  dirUnit: Vec2,
  totalLen: number,
  cx: number,
  cy: number,
  r: number,
): [number, number] | null {
  const vx = cx - p1.x;
  const vy = cy - p1.y;
  const sProj = vx * dirUnit.x + vy * dirUnit.y;
  const perpX = vx - sProj * dirUnit.x;
  const perpY = vy - sProj * dirUnit.y;
  const dPerpSq = perpX * perpX + perpY * perpY;
  if (dPerpSq >= r * r - 1e-7) return null;
  const halfChord = Math.sqrt(Math.max(0, r * r - dPerpSq));
  const s0 = Math.max(0, sProj - halfChord);
  const s1 = Math.min(totalLen, sProj + halfChord);
  if (s1 - s0 <= 1e-4) return null;
  return [s0, s1];
}

export function computeTechnicalSectionAA(params: {
  entities: Entity[];
  regions: RevEngRegion25D[];
  baseThicknessMm: number;
  sectionLine: RevEngSectionLineAA;
}): TechnicalSectionAAResult {
  const { entities, regions, baseThicknessMm, sectionLine } = params;
  const H = Math.max(0.5, baseThicknessMm);
  const dx = sectionLine.p2.x - sectionLine.p1.x;
  const dy = sectionLine.p2.y - sectionLine.p1.y;
  const totalSpanMm = Math.hypot(dx, dy);

  if (totalSpanMm < 1e-3) {
    return {
      sectionLabel: `CORTE ${sectionLine.label}-${sectionLine.label}`,
      p1: sectionLine.p1,
      p2: sectionLine.p2,
      totalSpanMm: 0,
      partSpanStartMm: 0,
      partSpanEndMm: 0,
      partIntersectedWidthMm: 0,
      baseThicknessMm: H,
      intervals: [],
      holeAxes: [],
      crossSectionSolidAreaMm2: 0,
    };
  }

  const dirUnit = { x: dx / totalSpanMm, y: dy / totalSpanMm };
  const entityMap = new Map<string, Entity>();
  for (const e of entities) entityMap.set(e.id, e);

  // Coletar spans 1D por região
  interface RegionSpan {
    s0: number;
    s1: number;
    region: RevEngRegion25D;
  }

  const regionSpans: RegionSpan[] = [];
  const holeAxes: SectionAAHoleAxisMarker[] = [];
  const breakpoints = new Set<number>([0, totalSpanMm]);

  for (const reg of regions) {
    const ent = entityMap.get(reg.entityId);
    if (!ent) continue;

    if (ent.type === "circle") {
      const hit = intersectLineWithCircle1D(
        sectionLine.p1,
        dirUnit,
        totalSpanMm,
        ent.cx,
        ent.cy,
        ent.r,
      );
      if (hit) {
        regionSpans.push({ s0: hit[0], s1: hit[1], region: reg });
        breakpoints.add(Number(hit[0].toFixed(5)));
        breakpoints.add(Number(hit[1].toFixed(5)));
        if (reg.regionKind === "furo_passante" || reg.regionKind === "furo_cego") {
          holeAxes.push({
            sCenterMm: (hit[0] + hit[1]) * 0.5,
            diameterMm: ent.r * 2,
            isThrough: reg.regionKind === "furo_passante",
            depthMm: reg.regionKind === "furo_passante" ? H : Math.min(H, reg.depthMm ?? H),
            label: reg.label,
          });
        }
      }
    } else {
      const poly = sampleEntityClosedPolygon(ent);
      if (poly) {
        const hits = intersectLineWithPolygon1D(sectionLine.p1, dirUnit, totalSpanMm, poly);
        for (const h of hits) {
          regionSpans.push({ s0: h[0], s1: h[1], region: reg });
          breakpoints.add(Number(h[0].toFixed(5)));
          breakpoints.add(Number(h[1].toFixed(5)));
        }
      }
    }
  }

  const sortedPts = Array.from(breakpoints).sort((a, b) => a - b);
  const rawIntervals: SectionAAInterval1D[] = [];

  for (let i = 0; i + 1 < sortedPts.length; i++) {
    const sStart = sortedPts[i]!;
    const sEnd = sortedPts[i + 1]!;
    const len = sEnd - sStart;
    if (len < 1e-4) continue;
    const sMid = (sStart + sEnd) * 0.5;

    // Verificar quais regiões cobrem sMid
    const covering = regionSpans
      .filter((sp) => sMid >= sp.s0 - 1e-5 && sMid <= sp.s1 + 1e-5)
      .map((sp) => sp.region);

    const hasBase = covering.some((r) => r.regionKind === "corpo_base");
    if (!hasBase) {
      rawIntervals.push({
        sStartMm: sStart,
        sEndMm: sEnd,
        lengthMm: len,
        state: "vazio_externo",
        zBottomMm: 0,
        zTopMm: 0,
        backWallTopZMm: 0,
        solidHeightMm: 0,
      });
      continue;
    }

    // Prioridade: furo_passante > furo_cego > rebaixo_cego / cavidade / alojamento / rasgo > ressalto_ilha > macico_hachurado
    const throughHole = covering.find((r) => r.regionKind === "furo_passante");
    if (throughHole) {
      rawIntervals.push({
        sStartMm: sStart,
        sEndMm: sEnd,
        lengthMm: len,
        state: "furo_passante",
        zBottomMm: 0,
        zTopMm: 0,
        backWallTopZMm: H,
        solidHeightMm: 0,
        regionLabel: throughHole.label,
      });
      continue;
    }

    const blindHole = covering.find((r) => r.regionKind === "furo_cego");
    if (blindHole) {
      const hf = Math.max(0, Math.min(H, blindHole.depthMm ?? H * 0.5));
      const floorZ = Math.max(0, H - hf);
      rawIntervals.push({
        sStartMm: sStart,
        sEndMm: sEnd,
        lengthMm: len,
        state: "furo_cego",
        zBottomMm: 0,
        zTopMm: floorZ,
        backWallTopZMm: H,
        solidHeightMm: floorZ,
        regionLabel: blindHole.label,
      });
      continue;
    }

    const blindPocket = covering.find(
      (r) =>
        r.regionKind === "rebaixo_cego" ||
        r.regionKind === "cavidade" ||
        r.regionKind === "alojamento" ||
        r.regionKind === "rasgo",
    );
    const islandBoss = covering.find((r) => r.regionKind === "ressalto_ilha");

    if (islandBoss) {
      const bossDelta = Math.max(0, islandBoss.depthMm ?? 0);
      rawIntervals.push({
        sStartMm: sStart,
        sEndMm: sEnd,
        lengthMm: len,
        state: "ressalto_ilha",
        zBottomMm: 0,
        zTopMm: H + bossDelta,
        backWallTopZMm: H + bossDelta,
        solidHeightMm: H + bossDelta,
        regionLabel: islandBoss.label,
      });
      continue;
    }

    if (blindPocket) {
      const hp = Math.max(0, Math.min(H, blindPocket.depthMm ?? H * 0.4));
      const floorZ = Math.max(0, H - hp);
      rawIntervals.push({
        sStartMm: sStart,
        sEndMm: sEnd,
        lengthMm: len,
        state: "rebaixo_cego",
        zBottomMm: 0,
        zTopMm: floorZ,
        backWallTopZMm: H,
        solidHeightMm: floorZ,
        regionLabel: blindPocket.label,
      });
      continue;
    }

    rawIntervals.push({
      sStartMm: sStart,
      sEndMm: sEnd,
      lengthMm: len,
      state: "macico_hachurado",
      zBottomMm: 0,
      zTopMm: H,
      backWallTopZMm: H,
      solidHeightMm: H,
      regionLabel: "Corpo Base",
    });
  }

  // Mesclar intervalos adjacentes idênticos
  const mergedIntervals: SectionAAInterval1D[] = [];
  for (const cur of rawIntervals) {
    const last = mergedIntervals[mergedIntervals.length - 1];
    if (
      last &&
      last.state === cur.state &&
      Math.abs(last.zBottomMm - cur.zBottomMm) < 1e-4 &&
      Math.abs(last.zTopMm - cur.zTopMm) < 1e-4
    ) {
      last.sEndMm = cur.sEndMm;
      last.lengthMm = last.sEndMm - last.sStartMm;
    } else {
      mergedIntervals.push({ ...cur });
    }
  }

  const partIntervals = mergedIntervals.filter((it) => it.state !== "vazio_externo");
  const partSpanStartMm = partIntervals.length > 0 ? partIntervals[0]!.sStartMm : 0;
  const partSpanEndMm =
    partIntervals.length > 0 ? partIntervals[partIntervals.length - 1]!.sEndMm : 0;
  const partIntersectedWidthMm = Math.max(0, partSpanEndMm - partSpanStartMm);

  const crossSectionSolidAreaMm2 = partIntervals.reduce(
    (acc, it) => acc + it.lengthMm * it.solidHeightMm,
    0,
  );

  return {
    sectionLabel: `CORTE ${sectionLine.label}-${sectionLine.label}`,
    p1: sectionLine.p1,
    p2: sectionLine.p2,
    totalSpanMm,
    partSpanStartMm,
    partSpanEndMm,
    partIntersectedWidthMm,
    baseThicknessMm: H,
    intervals: mergedIntervals,
    holeAxes,
    crossSectionSolidAreaMm2,
  };
}

/**
 * Converte o resultado analítico do Corte A–A em entidades vetoriais nativas do CHAMFER CAD
 * (incluindo linha de corte A–A na vista principal, contornos seccionados, hachura 45° ANSI/ISO,
 * linhas de fundo visíveis e linhas de centro dos furos).
 */
export function generateSectionAACadEntities(params: {
  sectionResult: TechnicalSectionAAResult;
  placementOrigin: Vec2;
  hatchPitchMm?: number;
  targetCutLayer?: LayerId;
}): Entity[] {
  const {
    sectionResult,
    placementOrigin,
    hatchPitchMm = 3.0,
    targetCutLayer = "corte",
  } = params;

  const out: Entity[] = [];
  const ts = Date.now();
  const ox = placementOrigin.x;
  const oy = placementOrigin.y;
  const sOffset = sectionResult.partSpanStartMm;

  // 1. Linha de corte A–A sobre a vista original (camada construcao)
  out.push({
    id: `reveng-sec-line-${ts}`,
    type: "line",
    layer: "construcao",
    isConstruction: true,
    x1: sectionResult.p1.x,
    y1: sectionResult.p1.y,
    x2: sectionResult.p2.x,
    y2: sectionResult.p2.y,
    params: { infoStatus: "CALCULADO", featureKind: "section_cutting_line_aa" },
  });

  // 2. Para cada intervalo da peça, construir blocos sólidos + hachura 45° + arestas de fundo
  sectionResult.intervals.forEach((it, idx) => {
    if (it.state === "vazio_externo") return;

    const x0 = ox + (it.sStartMm - sOffset);
    const x1 = ox + (it.sEndMm - sOffset);
    // No canvas 2D (Y cresce para baixo), desenhamos a base Z=0 em oy + H e o topo Z=H em oy
    const H = sectionResult.baseThicknessMm;
    const yBottom = oy + H - it.zBottomMm;
    const yTopSolid = oy + H - it.zTopMm;
    const yTopBackWall = oy + H - it.backWallTopZMm;

    if (it.solidHeightMm > 1e-3) {
      // Polígono fechado da seção maciça cortada
      out.push({
        id: `reveng-sec-solid-${idx}-${ts}`,
        type: "polyline",
        layer: targetCutLayer,
        closed: true,
        pts: [
          { x: x0, y: yBottom },
          { x: x1, y: yBottom },
          { x: x1, y: yTopSolid },
          { x: x0, y: yTopSolid },
        ],
        params: {
          infoStatus: "CALCULADO",
          featureKind: "section_aa_solid_block",
          intervalState: it.state,
        },
      });

      // Linhas de hachura a 45° dentro do retângulo [x0, x1] × [yTopSolid, yBottom]
      const w = x1 - x0;
      const h = yBottom - yTopSolid;
      const step = Math.max(1.5, hatchPitchMm);
      for (let d = -h; d <= w; d += step) {
        const hx0 = Math.max(x0, x0 + d);
        const hy0 = d < 0 ? yTopSolid - d : yTopSolid;
        const hx1 = Math.min(x1, x0 + d + h);
        const hy1 = yTopSolid + (hx1 - (x0 + d));
        if (hx1 > hx0 + 0.2 && hy1 >= yTopSolid - 1e-3 && hy1 <= yBottom + 1e-3) {
          out.push({
            id: `reveng-sec-hatch-${idx}-${Math.round((d + h) * 10)}-${ts}`,
            type: "line",
            layer: "construcao",
            isConstruction: true,
            x1: hx0,
            y1: hy0,
            x2: hx1,
            y2: Math.min(yBottom, hy1),
            params: { infoStatus: "CALCULADO", featureKind: "section_aa_hatch_45" },
          });
        }
      }
    }

    // Linha de parede traseira visível para furos passantes ou rebaixos cegos
    if (it.state === "furo_passante" || it.state === "rebaixo_cego" || it.state === "furo_cego") {
      out.push({
        id: `reveng-sec-backtop-${idx}-${ts}`,
        type: "line",
        layer: "recorte",
        x1: x0,
        y1: yTopBackWall,
        x2: x1,
        y2: yTopBackWall,
        params: { infoStatus: "CALCULADO", featureKind: "section_aa_backwall" },
      });
      if (it.state === "furo_passante") {
        out.push({
          id: `reveng-sec-backbot-${idx}-${ts}`,
          type: "line",
          layer: "recorte",
          x1: x0,
          y1: yBottom,
          x2: x1,
          y2: yBottom,
          params: { infoStatus: "CALCULADO", featureKind: "section_aa_backwall" },
        });
      }
    }
  });

  // 3. Linhas de centro (eixos) nos furos cortados
  sectionResult.holeAxes.forEach((ax, idx) => {
    const cx = ox + (ax.sCenterMm - sOffset);
    const H = sectionResult.baseThicknessMm;
    out.push({
      id: `reveng-sec-axis-${idx}-${ts}`,
      type: "line",
      layer: "construcao",
      isConstruction: true,
      x1: cx,
      y1: oy - 3,
      x2: cx,
      y2: oy + H + 3,
      params: { infoStatus: "CALCULADO", featureKind: "section_aa_hole_axis" },
    });
  });

  return out;
}

// ============================================================================
// 8. AUDITOR DE RESTRIÇÕES GEOMÉTRICAS, GRAUS DE LIBERDADE (DOF) E CONFLITOS (SEÇÃO 12 / T16)
// ============================================================================

export interface ConstraintConflictDiagnostic {
  id: string;
  severity: "critico" | "aviso";
  involvedConstraintIds: string[];
  involvedEntityIds: string[];
  conflictKind:
    | "ORIENTACAO_CONTRADITORIA"
    | "COTA_DUPLICADA_INCOMPATIVEL"
    | "CONFLITO_COM_ENTIDADE_MEDIDA_TRAVADA"
    | "DESVIO_GEOMETRICO_ACIMA_TOLERANCIA";
  discrepancyValue: number;
  unit: "mm" | "°";
  message: string;
  safeResolutionSuggestion: string;
}

export interface ConstraintSystemAuditResult {
  totalEntitiesDof: number;
  constrainedDof: number;
  remainingDof: number;
  systemState: "determinado" | "subdeterminado" | "sobredeterminado_conflito";
  conflicts: ConstraintConflictDiagnostic[];
  summaryText: string;
}

const CONSTRAINT_DOF_WEIGHT: Record<RevEngGeometricConstraint["kind"], number> = {
  horizontal: 1,
  vertical: 1,
  paralelo: 1,
  perpendicular: 1,
  coincidente: 2,
  tangente: 1,
  concentrico: 2,
  igual: 1,
  simetrico: 2,
  distancia: 1,
  angulo: 1,
  raio: 1,
  diametro: 1,
  origem_ancorada: 2,
};

export function evaluateConstraintSystemDOFAndConflicts(params: {
  entities: Entity[];
  constraints: RevEngGeometricConstraint[];
  defaultToleranceMm?: number;
}): ConstraintSystemAuditResult {
  const { entities, constraints, defaultToleranceMm = 0.1 } = params;

  const activeEntities = entities.filter((e) => !e.isConstruction);
  const entityMap = new Map<string, Entity>();
  let totalEntitiesDof = 0;

  for (const e of activeEntities) {
    entityMap.set(e.id, e);
    if (e.type === "line") totalEntitiesDof += 4;
    else if (e.type === "circle") totalEntitiesDof += 3;
    else if (e.type === "arc") totalEntitiesDof += 5;
    else if (e.type === "polyline") totalEntitiesDof += e.pts.length * 2;
    else totalEntitiesDof += 3;
  }

  let constrainedDof = 0;
  for (const c of constraints) {
    constrainedDof += CONSTRAINT_DOF_WEIGHT[c.kind] ?? 1;
  }

  const conflicts: ConstraintConflictDiagnostic[] = [];

  // 1. Verificar conflitos de orientação na mesma reta (ex.: horizontal + vertical ou horizontal + angulo != 0)
  const bySingleEntity = new Map<string, RevEngGeometricConstraint[]>();
  for (const c of constraints) {
    if (c.entityIds.length === 1) {
      const eid = c.entityIds[0]!;
      const arr = bySingleEntity.get(eid) ?? [];
      arr.push(c);
      bySingleEntity.set(eid, arr);
    }
  }

  for (const [eid, list] of bySingleEntity.entries()) {
    const horiz = list.find((c) => c.kind === "horizontal");
    const vert = list.find((c) => c.kind === "vertical");
    if (horiz && vert) {
      conflicts.push({
        id: `conf-orient-hv-${eid}`,
        severity: "critico",
        involvedConstraintIds: [horiz.id, vert.id],
        involvedEntityIds: [eid],
        conflictKind: "ORIENTACAO_CONTRADITORIA",
        discrepancyValue: 90,
        unit: "°",
        message: `Conflito dimensional/geométrico na entidade "${eid}": restrições HORIZONTAL (0°) e VERTICAL (90°) aplicadas simultaneamente.`,
        safeResolutionSuggestion:
          "Remova uma das restrições de orientação (Horizontal ou Vertical) sem deslocar a entidade.",
      });
    }

    const angC = list.find((c) => c.kind === "angulo" && typeof c.targetValueMmOrDeg === "number");
    if (horiz && angC && Math.abs((angC.targetValueMmOrDeg ?? 0) % 180) > 0.5) {
      conflicts.push({
        id: `conf-orient-ha-${eid}`,
        severity: "critico",
        involvedConstraintIds: [horiz.id, angC.id],
        involvedEntityIds: [eid],
        conflictKind: "ORIENTACAO_CONTRADITORIA",
        discrepancyValue: Math.abs(angC.targetValueMmOrDeg ?? 0),
        unit: "°",
        message: `Conflito na entidade "${eid}": restrição HORIZONTAL (0°) incompatível com ÂNGULO fixado em ${(angC.targetValueMmOrDeg ?? 0).toFixed(1)}°.`,
        safeResolutionSuggestion: "Converta o ângulo em cota informativa ou remova a restrição Horizontal.",
      });
    }

    // 2. Verificar conflitos de raio/diâmetro/comprimento duplicados ou contra entidade MEDIDO travada
    const metricConstraints = list.filter(
      (c) =>
        (c.kind === "raio" || c.kind === "diametro" || c.kind === "distancia") &&
        typeof c.targetValueMmOrDeg === "number",
    );

    if (metricConstraints.length >= 2) {
      for (let i = 0; i < metricConstraints.length; i++) {
        for (let j = i + 1; j < metricConstraints.length; j++) {
          const c1 = metricConstraints[i]!;
          const c2 = metricConstraints[j]!;
          const v1 =
            c1.kind === "diametro" ? (c1.targetValueMmOrDeg ?? 0) * 0.5 : (c1.targetValueMmOrDeg ?? 0);
          const v2 =
            c2.kind === "diametro" ? (c2.targetValueMmOrDeg ?? 0) * 0.5 : (c2.targetValueMmOrDeg ?? 0);
          const diff = Math.abs(v1 - v2);
          const tol = Math.min(c1.toleranceMmOrDeg ?? defaultToleranceMm, c2.toleranceMmOrDeg ?? defaultToleranceMm);
          if (diff > tol) {
            conflicts.push({
              id: `conf-metric-dup-${c1.id}-${c2.id}`,
              severity: "critico",
              involvedConstraintIds: [c1.id, c2.id],
              involvedEntityIds: [eid],
              conflictKind: "COTA_DUPLICADA_INCOMPATIVEL",
              discrepancyValue: diff,
              unit: "mm",
              message: `Sobre-restrição contraditória em "${eid}": cotas ${c1.kind.toUpperCase()} (${(c1.targetValueMmOrDeg ?? 0).toFixed(2)} mm) e ${c2.kind.toUpperCase()} (${(c2.targetValueMmOrDeg ?? 0).toFixed(2)} mm) divergem em ${diff.toFixed(2)} mm.`,
              safeResolutionSuggestion:
                "Mantenha apenas a medição confirmada por paquímetro e descarte a cota redundante.",
            });
          }
        }
      }
    }

    // 3. Verificar se a entidade atual viola a restrição ou é MEDIDO travada
    const ent = entityMap.get(eid);
    if (ent) {
      const isLockedMeasured =
        ent.params?.infoStatus === "MEDIDO" || ent.params?.lockedByMeasurement === true;

      for (const mc of metricConstraints) {
        let currentVal = 0;
        if (ent.type === "circle" || ent.type === "arc") {
          currentVal = mc.kind === "diametro" ? ent.r * 2 : ent.r;
        } else if (ent.type === "line") {
          currentVal = Math.hypot(ent.x2 - ent.x1, ent.y2 - ent.y1);
        }
        const target = mc.targetValueMmOrDeg ?? currentVal;
        const diff = Math.abs(currentVal - target);
        const tol = mc.toleranceMmOrDeg ?? defaultToleranceMm;

        if (diff > tol && isLockedMeasured && mc.infoStatus !== "MEDIDO") {
          conflicts.push({
            id: `conf-locked-${mc.id}`,
            severity: "critico",
            involvedConstraintIds: [mc.id],
            involvedEntityIds: [eid],
            conflictKind: "CONFLITO_COM_ENTIDADE_MEDIDA_TRAVADA",
            discrepancyValue: diff,
            unit: "mm",
            message: `Restrição ${mc.kind.toUpperCase()} = ${target.toFixed(2)} mm conflita com entidade "${eid}" travada como MEDIDO (${currentVal.toFixed(2)} mm, Δ = ${diff.toFixed(2)} mm). Nenhum deslocamento silencioso foi aplicado.`,
            safeResolutionSuggestion:
              "Desbloqueie a entidade medida se desejar adotar o valor nominal ou ajuste a restrição para o valor medido.",
          });
        }
      }
    }
  }

  // 4. Verificar pares de entidades com duas restrições de distância contraditórias
  const byEntityPair = new Map<string, RevEngGeometricConstraint[]>();
  for (const c of constraints) {
    if (c.entityIds.length === 2) {
      const key = [...c.entityIds].sort().join("::");
      const arr = byEntityPair.get(key) ?? [];
      arr.push(c);
      byEntityPair.set(key, arr);
    }
  }

  for (const [pairKey, list] of byEntityPair.entries()) {
    const dists = list.filter(
      (c) => c.kind === "distancia" && typeof c.targetValueMmOrDeg === "number",
    );
    if (dists.length >= 2) {
      const d1 = dists[0]!;
      const d2 = dists[1]!;
      const diff = Math.abs((d1.targetValueMmOrDeg ?? 0) - (d2.targetValueMmOrDeg ?? 0));
      const tol = Math.min(d1.toleranceMmOrDeg ?? defaultToleranceMm, d2.toleranceMmOrDeg ?? defaultToleranceMm);
      if (diff > tol) {
        conflicts.push({
          id: `conf-pair-dist-${d1.id}-${d2.id}`,
          severity: "critico",
          involvedConstraintIds: [d1.id, d2.id],
          involvedEntityIds: pairKey.split("::"),
          conflictKind: "COTA_DUPLICADA_INCOMPATIVEL",
          discrepancyValue: diff,
          unit: "mm",
          message: `Distâncias contraditórias entre o par [${pairKey}]: ${(d1.targetValueMmOrDeg ?? 0).toFixed(2)} mm vs. ${(d2.targetValueMmOrDeg ?? 0).toFixed(2)} mm (Δ = ${diff.toFixed(2)} mm).`,
          safeResolutionSuggestion: "Remova uma das cotas de distância conflitantes.",
        });
      }
    }

    const par = list.find((c) => c.kind === "paralelo");
    const perp = list.find((c) => c.kind === "perpendicular");
    if (par && perp) {
      conflicts.push({
        id: `conf-pair-parperp-${par.id}-${perp.id}`,
        severity: "critico",
        involvedConstraintIds: [par.id, perp.id],
        involvedEntityIds: pairKey.split("::"),
        conflictKind: "ORIENTACAO_CONTRADITORIA",
        discrepancyValue: 90,
        unit: "°",
        message: `Conflito entre o par [${pairKey}]: restrições PARALELO e PERPENDICULAR aplicadas simultaneamente.`,
        safeResolutionSuggestion: "Remova a relação Paralelo ou Perpendicular.",
      });
    }
  }

  const remainingDof = Math.max(0, totalEntitiesDof - constrainedDof);
  const systemState: ConstraintSystemAuditResult["systemState"] =
    conflicts.length > 0 || constrainedDof > totalEntitiesDof
      ? "sobredeterminado_conflito"
      : remainingDof === 0 && totalEntitiesDof > 0
        ? "determinado"
        : "subdeterminado";

  const summaryText =
    systemState === "sobredeterminado_conflito"
      ? `Sistema Sobredeterminado / Conflito (${conflicts.length} conflito(s) detectado(s), nenhum deslocamento silencioso aplicado).`
      : systemState === "determinado"
        ? `Geometria Totalmente Determinada (0 graus de liberdade restantes).`
        : `Geometria Subdeterminada (${remainingDof} de ${totalEntitiesDof} graus de liberdade livres).`;

  return {
    totalEntitiesDof,
    constrainedDof,
    remainingDof,
    systemState,
    conflicts,
    summaryText,
  };
}

// ============================================================================
// 9. FATIADOR DE MALHA DE SCANNER STL POR PLANO Z (SEÇÃO 10.6 & TESTE T20)
// ============================================================================

export interface StlVec3 {
  x: number;
  y: number;
  z: number;
}

export interface StlTriangle {
  v0: StlVec3;
  v1: StlVec3;
  v2: StlVec3;
}

export interface StlMeshSummary {
  triangles: StlTriangle[];
  originalTriangleCount: number;
  decimated: boolean;
  boundsMin: StlVec3;
  boundsMax: StlVec3;
}

export interface StlPlaneSliceResult {
  zPlaneMm: number;
  rawSegmentCount: number;
  loops: Vec2[][];
  estimatedCircle: {
    cx: number;
    cy: number;
    radiusMm: number;
    diameterMm: number;
    rmsErrorMm: number;
  } | null;
  infoStatus: "ESTIMADO";
  entities: Entity[];
  note: string;
}

/**
 * Lê malha STL ASCII (com limite de 300.000 triângulos e decimação automática).
 */
export function parseStlAsciiMesh(stlText: string, maxTriangles = 300000): StlMeshSummary {
  const vertexRegex =
    /vertex\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)/g;
  const verts: StlVec3[] = [];
  let match: RegExpExecArray | null;
  while ((match = vertexRegex.exec(stlText)) !== null) {
    verts.push({
      x: parseFloat(match[1]!),
      y: parseFloat(match[2]!),
      z: parseFloat(match[3]!),
    });
  }

  const rawTris: StlTriangle[] = [];
  for (let i = 0; i + 2 < verts.length; i += 3) {
    rawTris.push({ v0: verts[i]!, v1: verts[i + 1]!, v2: verts[i + 2]! });
  }

  const originalTriangleCount = rawTris.length;
  let triangles = rawTris;
  let decimated = false;

  if (originalTriangleCount > maxTriangles && maxTriangles > 0) {
    const stride = Math.ceil(originalTriangleCount / maxTriangles);
    triangles = rawTris.filter((_, idx) => idx % stride === 0);
    decimated = true;
  }

  const boundsMin: StlVec3 = { x: Infinity, y: Infinity, z: Infinity };
  const boundsMax: StlVec3 = { x: -Infinity, y: -Infinity, z: -Infinity };

  for (const t of triangles) {
    for (const v of [t.v0, t.v1, t.v2]) {
      if (v.x < boundsMin.x) boundsMin.x = v.x;
      if (v.y < boundsMin.y) boundsMin.y = v.y;
      if (v.z < boundsMin.z) boundsMin.z = v.z;
      if (v.x > boundsMax.x) boundsMax.x = v.x;
      if (v.y > boundsMax.y) boundsMax.y = v.y;
      if (v.z > boundsMax.z) boundsMax.z = v.z;
    }
  }

  if (triangles.length === 0) {
    boundsMin.x = boundsMin.y = boundsMin.z = 0;
    boundsMax.x = boundsMax.y = boundsMax.z = 0;
  }

  return {
    triangles,
    originalTriangleCount,
    decimated,
    boundsMin,
    boundsMax,
  };
}

/**
 * Gera uma malha STL ASCII sintética de um cilindro vertical (centrado em cx, cy, Z in [0, heightMm])
 * para validação do fatiador de malha (Teste T20: cilindro Ø40 fatiado -> Ø40 ESTIMADO).
 */
export function generateSyntheticCylinderStlAscii(params: {
  diameterMm: number;
  heightMm: number;
  cx?: number;
  cy?: number;
   radialSegments?: number;
}): string {
  const {
    diameterMm,
    heightMm,
    cx = 0,
    cy = 0,
    radialSegments = 72,
  } = params;
  const r = diameterMm * 0.5;
  const lines: string[] = ["solid chamfer_cylinder"];

  for (let i = 0; i < radialSegments; i++) {
    const a0 = (2 * Math.PI * i) / radialSegments;
    const a1 = (2 * Math.PI * (i + 1)) / radialSegments;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);

    // 2 triângulos da parede lateral
    lines.push("  facet normal 0 0 0");
    lines.push("    outer loop");
    lines.push(`      vertex ${x0.toFixed(5)} ${y0.toFixed(5)} 0.00000`);
    lines.push(`      vertex ${x1.toFixed(5)} ${y1.toFixed(5)} 0.00000`);
    lines.push(`      vertex ${x1.toFixed(5)} ${y1.toFixed(5)} ${heightMm.toFixed(5)}`);
    lines.push("    endloop");
    lines.push("  endfacet");

    lines.push("  facet normal 0 0 0");
    lines.push("    outer loop");
    lines.push(`      vertex ${x0.toFixed(5)} ${y0.toFixed(5)} 0.00000`);
    lines.push(`      vertex ${x1.toFixed(5)} ${y1.toFixed(5)} ${heightMm.toFixed(5)}`);
    lines.push(`      vertex ${x0.toFixed(5)} ${y0.toFixed(5)} ${heightMm.toFixed(5)}`);
    lines.push("    endloop");
    lines.push("  endfacet");
  }

  lines.push("endsolid chamfer_cylinder");
  return lines.join("\n");
}

/**
 * Fatia uma malha de triângulos STL por um plano horizontal Z = zPlaneMm.
 * Intersecta cada triângulo com o plano, encadeia os segmentos com tolerância de soldagem
 * e retorna polilinhas marcadas rigorosamente como `ESTIMADO` (nunca converte malha em sólido).
 */
export function sliceStlMeshByPlaneZ(params: {
  triangles: StlTriangle[];
  zPlaneMm: number;
  weldToleranceMm?: number;
  targetLayer?: LayerId;
}): StlPlaneSliceResult {
  const {
    triangles,
    zPlaneMm,
    weldToleranceMm = 0.05,
    targetLayer = "construcao",
  } = params;

  const segments: Array<[Vec2, Vec2]> = [];

  const interpEdge = (a: StlVec3, b: StlVec3): Vec2 | null => {
    const da = a.z - zPlaneMm;
    const db = b.z - zPlaneMm;
    if ((da < 0 && db < 0) || (da > 0 && db > 0)) return null;
    if (Math.abs(da - db) < 1e-9) return null;
    const t = da / (da - db);
    if (t < -1e-7 || t > 1 + 1e-7) return null;
    return {
      x: a.x + t * (b.x - a.x),
      y: a.y + t * (b.y - a.y),
    };
  };

  for (const tri of triangles) {
    const pts: Vec2[] = [];
    const e01 = interpEdge(tri.v0, tri.v1);
    const e12 = interpEdge(tri.v1, tri.v2);
    const e20 = interpEdge(tri.v2, tri.v0);

    for (const p of [e01, e12, e20]) {
      if (!p) continue;
      if (!pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-5)) {
        pts.push(p);
      }
    }

    if (pts.length === 2) {
      if (Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) > 1e-5) {
        segments.push([pts[0]!, pts[1]!]);
      }
    }
  }

  // Encadear segmentos em polilinhas usando weldToleranceMm
  const used = new Array<boolean>(segments.length).fill(false);
  const loops: Vec2[][] = [];

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const chain: Vec2[] = [segments[i]![0], segments[i]![1]];

    let extended = true;
    while (extended) {
      extended = false;
      const tail = chain[chain.length - 1]!;
      for (let j = 0; j < segments.length; j++) {
        if (used[j]) continue;
        const [a, b] = segments[j]!;
        if (Math.hypot(a.x - tail.x, a.y - tail.y) <= weldToleranceMm) {
          chain.push(b);
          used[j] = true;
          extended = true;
          break;
        } else if (Math.hypot(b.x - tail.x, b.y - tail.y) <= weldToleranceMm) {
          chain.push(a);
          used[j] = true;
          extended = true;
          break;
        }
      }
    }

    if (chain.length >= 2) {
      // Consolidar vértices intermediários colineares (gerados pelas arestas diagonais de faces planas trianguladas)
      const simplified: Vec2[] = [chain[0]!];
      for (let k = 1; k < chain.length - 1; k++) {
        const prev = simplified[simplified.length - 1]!;
        const cur = chain[k]!;
        const next = chain[k + 1]!;
        const ux = cur.x - prev.x;
        const uy = cur.y - prev.y;
        const vx = next.x - cur.x;
        const vy = next.y - cur.y;
        const lenU = Math.hypot(ux, uy);
        const lenV = Math.hypot(vx, vy);
        if (lenU > 1e-6 && lenV > 1e-6) {
          const sinAngle = Math.abs(ux * vy - uy * vx) / (lenU * lenV);
          const dot = (ux * vx + uy * vy) / (lenU * lenV);
          // Se os dois sub-segmentos têm a mesma direção (mesma faceta plana), omitimos o ponto artificial da diagonal
          if (sinAngle < 1e-3 && dot > 0.999) {
            continue;
          }
        }
        simplified.push(cur);
      }
      simplified.push(chain[chain.length - 1]!);
      loops.push(simplified);
    }
  }

  // Estimar círculo se o primeiro laço tiver pelo menos 6 pontos
  let estimatedCircle: StlPlaneSliceResult["estimatedCircle"] = null;
  const primaryLoop = loops[0];
  if (primaryLoop && primaryLoop.length >= 6) {
    // Excluir último ponto se coincidir com o primeiro
    const head = primaryLoop[0]!;
    const tail = primaryLoop[primaryLoop.length - 1]!;
    const samplePts =
      Math.hypot(head.x - tail.x, head.y - tail.y) <= weldToleranceMm * 2
        ? primaryLoop.slice(0, -1)
        : primaryLoop;

    const n = samplePts.length;
    let sumX = 0;
    let sumY = 0;
    for (const p of samplePts) {
      sumX += p.x;
      sumY += p.y;
    }
    const cx = sumX / n;
    const cy = sumY / n;

    let sumR = 0;
    const radii: number[] = [];
    for (const p of samplePts) {
      const ri = Math.hypot(p.x - cx, p.y - cy);
      radii.push(ri);
      sumR += ri;
    }
    const radiusMm = sumR / n;
    let sqErr = 0;
    for (const ri of radii) {
      sqErr += (ri - radiusMm) * (ri - radiusMm);
    }
    const rmsErrorMm = Math.sqrt(sqErr / n);

    estimatedCircle = {
      cx,
      cy,
      radiusMm,
      diameterMm: radiusMm * 2,
      rmsErrorMm,
    };
  }

  const ts = Date.now();
  const entities: Entity[] = loops.map((pts, idx) => {
    const head = pts[0]!;
    const tail = pts[pts.length - 1]!;
    const isClosed = pts.length > 3 && Math.hypot(head.x - tail.x, head.y - tail.y) <= weldToleranceMm * 2;
    const cleanPts = isClosed ? pts.slice(0, -1) : pts;

    return {
      id: `reveng-stl-slice-${idx}-${ts}`,
      type: "polyline",
      layer: targetLayer,
      closed: isClosed,
      pts: cleanPts,
      params: {
        infoStatus: "ESTIMADO",
        featureKind: "stl_mesh_slice",
        zPlaneMm,
      },
    };
  });

  return {
    zPlaneMm,
    rawSegmentCount: segments.length,
    loops,
    estimatedCircle,
    infoStatus: "ESTIMADO",
    entities,
    note: "Fatia 2D extraída de malha de scanner (marcada como ESTIMADO). A malha nunca é convertida diretamente em sólido B-Rep.",
  };
}
