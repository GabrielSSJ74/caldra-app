/**
 * CALDRA CHAMFER CAD — ENGENHARIA REVERSA E BANCADA MECÂNICA
 * Tipos Canônicos, Estados de Confiança, Esquema Versionado de Persistência e Contratos (Fase B → G)
 */

import type { Entity, Vec2 } from "./core";

/**
 * Classificação rigorosa de estado da informação em Engenharia Reversa (Seção 3).
 * Nunca confundir hipótese ou estimativa visual com medida física real de bancada.
 */
export type RevEngInfoStatus =
  | "MEDIDO"
  | "CALCULADO"
  | "AJUSTADO"
  | "ESTIMADO"
  | "HIPOTESE"
  | "NOMINAL_ACEITO"
  | "DESCONHECIDO";

export const REV_ENG_STATUS_META: Record<
  RevEngInfoStatus,
  {
    label: string;
    shortLabel: string;
    description: string;
    badgeBgDark: string;
    badgeTextDark: string;
    badgeBorderDark: string;
    badgeBgLight: string;
    badgeTextLight: string;
    badgeBorderLight: string;
    strokeColor: string;
  }
> = {
  MEDIDO: {
    label: "Medido em Bancada",
    shortLabel: "MEDIDO",
    description: "Valor físico coletado diretamente com paquímetro, micrômetro ou trena.",
    badgeBgDark: "bg-emerald-950/70",
    badgeTextDark: "text-emerald-300",
    badgeBorderDark: "border-emerald-500/50",
    badgeBgLight: "bg-emerald-50",
    badgeTextLight: "text-emerald-700",
    badgeBorderLight: "border-emerald-300",
    strokeColor: "#10B981",
  },
  CALCULADO: {
    label: "Calculado Analiticamente",
    shortLabel: "CALCULADO",
    description: "Derivado por geometria exata (ex.: corda+flecha, trilateração, tangência).",
    badgeBgDark: "bg-sky-950/70",
    badgeTextDark: "text-sky-300",
    badgeBorderDark: "border-sky-500/50",
    badgeBgLight: "bg-sky-50",
    badgeTextLight: "text-sky-700",
    badgeBorderLight: "border-sky-300",
    strokeColor: "#38BDF8",
  },
  AJUSTADO: {
    label: "Ajustado por Mínimos Quadrados",
    shortLabel: "AJUSTADO",
    description: "Primitiva ajustada sobre pontos ou rede de medidas com resíduo conhecido.",
    badgeBgDark: "bg-indigo-950/70",
    badgeTextDark: "text-indigo-300",
    badgeBorderDark: "border-indigo-500/50",
    badgeBgLight: "bg-indigo-50",
    badgeTextLight: "text-indigo-700",
    badgeBorderLight: "border-indigo-300",
    strokeColor: "#818CF8",
  },
  ESTIMADO: {
    label: "Estimado por Imagem",
    shortLabel: "ESTIMADO",
    description: "Extraído de foto/scanner calibrado, sem confirmação direta por instrumento.",
    badgeBgDark: "bg-amber-950/70",
    badgeTextDark: "text-amber-300",
    badgeBorderDark: "border-amber-500/50",
    badgeBgLight: "bg-amber-50",
    badgeTextLight: "text-amber-700",
    badgeBorderLight: "border-amber-300",
    strokeColor: "#F59E0B",
  },
  HIPOTESE: {
    label: "Hipótese de Projeto",
    shortLabel: "HIPÓTESE",
    description: "Sugestão de intenção mecânica (simetria, diâmetro nominal, colinearidade) aguardando aceite.",
    badgeBgDark: "bg-purple-950/70",
    badgeTextDark: "text-purple-300",
    badgeBorderDark: "border-purple-500/50",
    badgeBgLight: "bg-purple-50",
    badgeTextLight: "text-purple-700",
    badgeBorderLight: "border-purple-300",
    strokeColor: "#A855F7",
  },
  NOMINAL_ACEITO: {
    label: "Nominal de Projeto Aceito",
    shortLabel: "NOMINAL ACEITO",
    description: "Intenção de projeto nominal aceita explicitamente pelo usuário a partir de valor medido/ajustado.",
    badgeBgDark: "bg-teal-950/70",
    badgeTextDark: "text-teal-300",
    badgeBorderDark: "border-teal-500/50",
    badgeBgLight: "bg-teal-50",
    badgeTextLight: "text-teal-700",
    badgeBorderLight: "border-teal-300",
    strokeColor: "#14B8A6",
  },
  DESCONHECIDO: {
    label: "Desconhecido / Pendente",
    shortLabel: "DESCONHECIDO",
    description: "Informação não visível ou não medida (ex.: furo cego sem profundidade aferida).",
    badgeBgDark: "bg-rose-950/70",
    badgeTextDark: "text-rose-300",
    badgeBorderDark: "border-rose-500/50",
    badgeBgLight: "bg-rose-50",
    badgeTextLight: "text-rose-700",
    badgeBorderLight: "border-rose-300",
    strokeColor: "#F43F5E",
  },
};

export type RevEngWizardStep = "A" | "B" | "C" | "D" | "E" | "F";

export interface RevEngWizardStepDef {
  id: RevEngWizardStep;
  shortTitle: string;
  title: string;
  description: string;
  targetCategory: RevEngCategoryId;
}

export type RevEngCategoryId =
  | "referencias"
  | "caderno"
  | "contorno_ajuste"
  | "furos_cadeias"
  | "olhais_pontes"
  | "cavidades_25d"
  | "dentes_engrenagens"
  | "auditoria";

export const REV_ENG_WIZARD_STEPS: RevEngWizardStepDef[] = [
  {
    id: "A",
    shortTitle: "A. Escala 1:1",
    title: "Etapa A — Origem dos Dados e Escala 1:1",
    description: "Importe foto/scanner ou inicie pelas medições diretas de paquímetro e trena.",
    targetCategory: "referencias",
  },
  {
    id: "B",
    shortTitle: "B. Datum 0,0",
    title: "Etapa B — Datum, Origem (0,0) e Eixos",
    description: "Defina a borda/furo mestre como REF (0,0) e registre as cotas globais no Caderno.",
    targetCategory: "caderno",
  },
  {
    id: "C",
    shortTitle: "C. Contorno",
    title: "Etapa C — Contorno Externo, Arcos e Olhais",
    description: "Capture pontos do contorno e ajuste retas, círculos e arcos ortogonais com RMS em mm.",
    targetCategory: "contorno_ajuste",
  },
  {
    id: "D",
    shortTitle: "D. Furação",
    title: "Etapa D — Furos, Paquímetro e Cadeias",
    description: "Localize furos parede-a-parede, fora-a-fora, centro-a-centro ou por trilateração.",
    targetCategory: "furos_cadeias",
  },
  {
    id: "E",
    shortTitle: "E. Rebaixos 2.5D",
    title: "Etapa E — Cavidades, Dentes e Espessura",
    description: "Configure parede constante (Auto-Pocket), cremalheira e profundidades medidas.",
    targetCategory: "cavidades_25d",
  },
  {
    id: "F",
    shortTitle: "F. Prova 1:1",
    title: "Etapa F — Auditoria e Prova de Impressão 1:1",
    description: "Confira desvios medido × desenhado, mapa de confiança e gere gabarito 1:1.",
    targetCategory: "auditoria",
  },
];

export type RevEngImageViewTag = "superior" | "frontal" | "lateral" | "verso" | "detalhe";

export const REV_ENG_VIEW_TAG_LABELS: Record<RevEngImageViewTag, string> = {
  superior: "Superior (Planta)",
  frontal: "Frontal (Elevação)",
  lateral: "Lateral / Corte",
  verso: "Verso / Fundo",
  detalhe: "Detalhe Local",
};

export interface CalibrationReferenceLine {
  id: string;
  label: string;
  p1Px: Vec2;
  p2Px: Vec2;
  knownLengthMm: number;
  axisHint?: "free" | "horizontal" | "vertical";
}

export interface CalibrationResidualItem {
  id: string;
  label: string;
  knownLengthMm: number;
  pixelDist: number;
  fittedLengthMm: number;
  errorMm: number;
  compatible: boolean;
}

export interface MultiCalibrationFitResult {
  mmPerPx: number;
  pxPerMm: number;
  rotationDeg: number;
  rmsErrorMm: number;
  maxErrorMm: number;
  status: "ok" | "alerta" | "incompativel";
  toleranceMm: number;
  residuals: CalibrationResidualItem[];
  message: string;
}

export interface HomographyQuadSpec {
  id: string;
  /** 4 cantos em pixels na imagem original: [Sup-Esq, Sup-Dir, Inf-Dir, Inf-Esq] */
  cornersPx: [Vec2, Vec2, Vec2, Vec2];
  /** Largura real conhecida do retângulo de referência (mm) */
  realWidthMm: number;
  /** Altura real conhecida do retângulo de referência (mm) */
  realHeightMm: number;
  /** Erro residual RMS nos 4 cantos após homografia (mm) */
  residualRmsMm: number;
  /** Erro máximo em qualquer canto após homografia (mm) */
  maxCornerErrorMm: number;
  /** Matriz 3×3 achatada (9 elementos) da homografia direta */
  matrixH?: number[];
}

export type CalibrationMethod =
  | "two_points"
  | "multi_ref"
  | "scanner_dpi"
  | "homography_4pt"
  | "calibration_sheet";

export interface RevEngReferenceImage {
  id: string;
  name: string;
  viewTag: RevEngImageViewTag;
  src: string;
  rectifiedSrc?: string;
  naturalWidthPx: number;
  naturalHeightPx: number;
  /** Posição X no mundo CAD (mm) */
  xMm: number;
  /** Posição Y no mundo CAD (mm) */
  yMm: number;
  /** Largura renderizada no mundo CAD (mm) */
  widthMm: number;
  /** Altura renderizada no mundo CAD (mm) */
  heightMm: number;
  /** Rotação em graus no plano CAD */
  rotationDeg: number;
  /** Opacidade (0.05 a 1.0) */
  opacity: number;
  /** Contraste (0.5 a 2.5, padrão 1.0) */
  contrast: number;
  /** Modo de limiar visual para destacar bordas mecânicas */
  thresholdMode: "normal" | "high_contrast" | "binary";
  /** Nível de limiar (0 a 255) */
  thresholdLevel: number;
  visible: boolean;
  locked: boolean;
  calibrationMode: CalibrationMethod;
  mmPerPx: number;
  residualErrorMm: number;
  calibrationStatus: "ok" | "alerta" | "incompativel" | "nao_calibrada";
  references: CalibrationReferenceLine[];
  scannerDpi?: number;
  scannerCheckMeasuredMm?: number;
  scannerCheckDrawnMm?: number;
  homography?: HomographyQuadSpec;
  infoStatus: RevEngInfoStatus;
}

export type MeasurementKind =
  | "comprimento"
  | "largura"
  | "espessura"
  | "diametro"
  | "raio"
  | "angulo"
  | "profundidade"
  | "centro_a_centro"
  | "parede_a_parede"
  | "fora_a_fora"
  | "corda"
  | "flecha";

export const MEASUREMENT_KIND_LABELS: Record<
  MeasurementKind,
  { label: string; short: string; defaultUnit: "mm" | "°" }
> = {
  comprimento: { label: "Comprimento (C)", short: "C", defaultUnit: "mm" },
  largura: { label: "Largura (L)", short: "L", defaultUnit: "mm" },
  espessura: { label: "Espessura (E)", short: "E", defaultUnit: "mm" },
  diametro: { label: "Diâmetro (Ø)", short: "Ø", defaultUnit: "mm" },
  raio: { label: "Raio (R)", short: "R", defaultUnit: "mm" },
  angulo: { label: "Ângulo (∠)", short: "∠", defaultUnit: "°" },
  profundidade: { label: "Profundidade (Z)", short: "Prof", defaultUnit: "mm" },
  centro_a_centro: { label: "Centro a Centro (C-C)", short: "C-C", defaultUnit: "mm" },
  parede_a_parede: { label: "Interna Parede a Parede", short: "Int", defaultUnit: "mm" },
  fora_a_fora: { label: "Externa Fora a Fora", short: "Ext", defaultUnit: "mm" },
  corda: { label: "Corda de Arco (c)", short: "Corda", defaultUnit: "mm" },
  flecha: { label: "Flecha / Sagita (f)", short: "Flecha", defaultUnit: "mm" },
};

export type MeasurementInstrument =
  | "paquimetro"
  | "trena"
  | "micrometro"
  | "goniometro"
  | "pente_raios"
  | "scanner_foto"
  | "outro";

export const MEASUREMENT_INSTRUMENT_META: Record<
  MeasurementInstrument,
  { label: string; defaultUncertaintyMm: number }
> = {
  paquimetro: { label: "Paquímetro (150/200mm)", defaultUncertaintyMm: 0.05 },
  micrometro: { label: "Micrômetro", defaultUncertaintyMm: 0.01 },
  trena: { label: "Trena / Escala Metálica", defaultUncertaintyMm: 0.5 },
  goniometro: { label: "Goniômetro / Transferidor", defaultUncertaintyMm: 0.25 },
  pente_raios: { label: "Pente de Raios", defaultUncertaintyMm: 0.2 },
  scanner_foto: { label: "Imagem Calibrada 1:1", defaultUncertaintyMm: 0.35 },
  outro: { label: "Outro Instrumento", defaultUncertaintyMm: 0.1 },
};

export interface MeasurementRecord {
  id: string;
  /** Código curto ex.: M01, M02 */
  code: string;
  label: string;
  kind: MeasurementKind;
  valueMmOrDeg: number;
  unit: "mm" | "°";
  uncertaintyMmOrDeg: number;
  instrument: MeasurementInstrument;
  /** ID da entidade CAD vinculada no plano */
  linkedEntityId?: string;
  /** ID da cota associativa vinculada */
  linkedDimId?: string;
  /** Valor nominal atual medido na geometria CAD vinculada */
  drawnNominalValue?: number;
  /** Diferença absoluta |medido - desenhado| */
  discrepancyMm?: number;
  infoStatus: RevEngInfoStatus;
  notes?: string;
  createdAt: number;
}

export interface CapturedContourPoint {
  id: string;
  x: number;
  y: number;
  source: "manual_touch" | "caliper_ordinate" | "vision_edge";
  uncertaintyMm: number;
}

export type FitPrimitiveKind = "line" | "circle" | "arc" | "polyline_rdp" | "spline";

export interface FittedPrimitiveCandidate {
  id: string;
  kind: FitPrimitiveKind;
  pointsUsed: number;
  rmsMm: number;
  maxDeviationMm: number;
  collinearWarning?: string;
  entityPreview: Entity;
  summaryLabel: string;
  infoStatus: RevEngInfoStatus;
}

export type RevEngCanvasInteractionMode =
  | "none"
  | "pick_cal_2pt"
  | "pick_cal_multiref"
  | "pick_homography_4pt"
  | "capture_contour_pts"
  | "pick_section_line_aa";

// ============================================================================
// FASE E — VISTAS VINCULADAS, MAPA DE PROFUNDIDADES 2.5D, CORTE A-A E RESTRIÇÕES
// ============================================================================

export type ProjectionDihedralMode = "1_diedro" | "3_diedro";

export type RevEngMaterialKey =
  | "aco_carbono"
  | "aco_inox_304"
  | "aluminio_6061"
  | "latao"
  | "bronze"
  | "ferro_fundido"
  | "nylon"
  | "abs_pla";

export type RevEngRegion25DKind =
  | "corpo_base"
  | "furo_passante"
  | "furo_cego"
  | "rebaixo_cego"
  | "alojamento"
  | "rasgo"
  | "cavidade"
  | "ressalto_ilha"
  | "superficie_oculta";

export interface RevEngRegion25D {
  id: string;
  /** ID da entidade 2D vinculada no plano */
  entityId: string;
  label: string;
  regionKind: RevEngRegion25DKind;
  /**
   * Profundidade Z em mm (para furos/rebaixos: medida a partir do topo; para corpo_base: espessura H).
   * Quando `depthStatus === "DESCONHECIDO"`, pode ser `null`.
   */
  depthMm: number | null;
  depthStatus: RevEngInfoStatus;
  /** Cota Z de início (padrão 0 = face superior) */
  zStartMm: number;
  /** Área plana em mm² calculada analiticamente */
  areaMm2: number;
  notes?: string;
}

export type CrossViewDimensionKind =
  | "largura_x"
  | "altura_y"
  | "espessura_z"
  | "centro_furo"
  | "diametro_furo"
  | "profundidade_rebaixo";

export interface RevEngCrossViewLink {
  id: string;
  label: string;
  dimensionKind: CrossViewDimensionKind;
  viewA: RevEngImageViewTag;
  valueAMm: number;
  viewB: RevEngImageViewTag;
  valueBMm: number;
  toleranceMm: number;
  infoStatus: RevEngInfoStatus;
}

export interface RevEngSectionLineAA {
  id: string;
  label: string;
  p1: Vec2;
  p2: Vec2;
  sightDirection: "up" | "down";
  enabled: boolean;
}

export interface RevEngMeasuredSectionProfile {
  id: string;
  label: string;
  /** Posição axial X ou s ao longo da peça (mm) */
  positionMm: number;
  widthMm: number;
  heightMm: number;
  areaMm2: number;
  infoStatus: RevEngInfoStatus;
}

export type RevEngConstraintKind =
  | "horizontal"
  | "vertical"
  | "paralelo"
  | "perpendicular"
  | "coincidente"
  | "tangente"
  | "concentrico"
  | "igual"
  | "simetrico"
  | "distancia"
  | "angulo"
  | "raio"
  | "diametro"
  | "origem_ancorada";

export interface RevEngGeometricConstraint {
  id: string;
  kind: RevEngConstraintKind;
  entityIds: string[];
  targetValueMmOrDeg?: number;
  toleranceMmOrDeg?: number;
  infoStatus: RevEngInfoStatus;
  locked?: boolean;
}

export interface RevEngPlanData {
  version: 1;
  activeWizardStep: RevEngWizardStep;
  activeCategory: RevEngCategoryId;
  referenceImages: RevEngReferenceImage[];
  activeReferenceImageId: string | null;
  measurements: MeasurementRecord[];
  capturedPoints: CapturedContourPoint[];
  rdpToleranceMm: number;
  // Campos da Fase E (opcionais na leitura bruta, sempre inicializados no sanitizador)
  projectionDihedral?: ProjectionDihedralMode;
  baseThicknessMm?: number;
  baseThicknessStatus?: RevEngInfoStatus;
  materialKey?: RevEngMaterialKey;
  weighedMassGrams?: number | null;
  regions25D?: RevEngRegion25D[];
  crossViewLinks?: RevEngCrossViewLink[];
  sectionLineAA?: RevEngSectionLineAA;
  measuredSections?: RevEngMeasuredSectionProfile[];
  constraints?: RevEngGeometricConstraint[];
  // Campos da Fase F (Verificação, Tolerâncias Separadas, Mapa de Confiança e Prova 1:1)
  /** Tolerância geométrica de fechamento de contorno aberto (mm) — distinta da tolerância de fabricação */
  closingToleranceMm?: number;
  /** Tolerância dimensional de fabricação/inspeção (mm) */
  fabricationToleranceMm?: number;
  /** Exibe ou oculta o Mapa Visual de Confiança sobre o projeto sem alterar entidades */
  showConfidenceMap?: boolean;
  /** Largura medida em pixels de um cartão ID-1 (85,60 × 53,98 mm) para o modo Tamanho Real na Tela */
  id1CardWidthPx?: number;
  createdAt: number;
  updatedAt: number;
}

export function createDefaultRevEngPlanData(): RevEngPlanData {
  const now = Date.now();
  return {
    version: 1,
    activeWizardStep: "A",
    activeCategory: "referencias",
    referenceImages: [],
    activeReferenceImageId: null,
    measurements: [],
    capturedPoints: [],
    rdpToleranceMm: 0.25,
    projectionDihedral: "1_diedro",
    baseThicknessMm: 10,
    baseThicknessStatus: "MEDIDO",
    materialKey: "aco_carbono",
    weighedMassGrams: null,
    regions25D: [],
    crossViewLinks: [],
    sectionLineAA: {
      id: "sec-aa-default",
      label: "A",
      p1: { x: -10, y: 25 },
      p2: { x: 110, y: 25 },
      sightDirection: "up",
      enabled: true,
    },
    measuredSections: [],
    constraints: [],
    closingToleranceMm: 2.0,
    fabricationToleranceMm: 0.15,
    showConfidenceMap: false,
    id1CardWidthPx: 320,
    createdAt: now,
    updatedAt: now,
  };
}

export function sanitizeRevEngPlanData(raw: unknown): RevEngPlanData {
  const base = createDefaultRevEngPlanData();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Partial<RevEngPlanData>;
  const referenceImages = Array.isArray(obj.referenceImages) ? obj.referenceImages : [];
  const activeReferenceImageId =
    typeof obj.activeReferenceImageId === "string" &&
    referenceImages.some((img) => img.id === obj.activeReferenceImageId)
      ? obj.activeReferenceImageId
      : referenceImages[0]?.id ?? null;

  return {
    version: 1,
    activeWizardStep:
      obj.activeWizardStep && ["A", "B", "C", "D", "E", "F"].includes(obj.activeWizardStep)
        ? obj.activeWizardStep
        : "A",
    activeCategory:
      obj.activeCategory &&
      [
        "referencias",
        "caderno",
        "contorno_ajuste",
        "furos_cadeias",
        "olhais_pontes",
        "cavidades_25d",
        "dentes_engrenagens",
        "auditoria",
      ].includes(obj.activeCategory)
        ? obj.activeCategory
        : "referencias",
    referenceImages,
    activeReferenceImageId,
    measurements: Array.isArray(obj.measurements) ? obj.measurements : [],
    capturedPoints: Array.isArray(obj.capturedPoints) ? obj.capturedPoints : [],
    rdpToleranceMm:
      typeof obj.rdpToleranceMm === "number" && Number.isFinite(obj.rdpToleranceMm) && obj.rdpToleranceMm > 0
        ? obj.rdpToleranceMm
        : 0.25,
    projectionDihedral:
      obj.projectionDihedral === "1_diedro" || obj.projectionDihedral === "3_diedro"
        ? obj.projectionDihedral
        : "1_diedro",
    baseThicknessMm:
      typeof obj.baseThicknessMm === "number" && Number.isFinite(obj.baseThicknessMm) && obj.baseThicknessMm > 0
        ? obj.baseThicknessMm
        : 10,
    baseThicknessStatus:
      obj.baseThicknessStatus && obj.baseThicknessStatus in REV_ENG_STATUS_META
        ? obj.baseThicknessStatus
        : "MEDIDO",
    materialKey: obj.materialKey ?? "aco_carbono",
    weighedMassGrams:
      typeof obj.weighedMassGrams === "number" && Number.isFinite(obj.weighedMassGrams) && obj.weighedMassGrams > 0
        ? obj.weighedMassGrams
        : null,
    regions25D: Array.isArray(obj.regions25D) ? obj.regions25D : [],
    crossViewLinks: Array.isArray(obj.crossViewLinks) ? obj.crossViewLinks : [],
    sectionLineAA:
      obj.sectionLineAA &&
      typeof obj.sectionLineAA === "object" &&
      obj.sectionLineAA.p1 &&
      obj.sectionLineAA.p2
        ? obj.sectionLineAA
        : base.sectionLineAA,
    measuredSections: Array.isArray(obj.measuredSections) ? obj.measuredSections : [],
    constraints: Array.isArray(obj.constraints) ? obj.constraints : [],
    closingToleranceMm:
      typeof obj.closingToleranceMm === "number" &&
      Number.isFinite(obj.closingToleranceMm) &&
      obj.closingToleranceMm > 0
        ? obj.closingToleranceMm
        : 2.0,
    fabricationToleranceMm:
      typeof obj.fabricationToleranceMm === "number" &&
      Number.isFinite(obj.fabricationToleranceMm) &&
      obj.fabricationToleranceMm > 0
        ? obj.fabricationToleranceMm
        : 0.15,
    showConfidenceMap: typeof obj.showConfidenceMap === "boolean" ? obj.showConfidenceMap : false,
    id1CardWidthPx:
      typeof obj.id1CardWidthPx === "number" && Number.isFinite(obj.id1CardWidthPx) && obj.id1CardWidthPx > 20
        ? obj.id1CardWidthPx
        : 320,
    createdAt: typeof obj.createdAt === "number" ? obj.createdAt : base.createdAt,
    updatedAt: typeof obj.updatedAt === "number" ? obj.updatedAt : base.updatedAt,
  };
}


