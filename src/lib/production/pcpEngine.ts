/**
 * CALDRA — MOTOR RELACIONAL DE ENGENHARIA DE OPERAÇÕES, PCP, NESTING, CUSTOS E CHÃO DE FÁBRICA
 *
 * Conecta de ponta a ponta:
 * WorkOrder (Project) ↔ Part ↔ Material ↔ Planification (Fator K) ↔ NestingJob ↔ BOM ↔ CostCalculation ↔ Quote (Snapshot Imutável) ↔ ProductionOrder & InspectionRecord (QR Code).
 */

export type IndustrialStageId =
  | "cadastro"
  | "desenvolvimento_tecnico"
  | "planejamento_pcp"
  | "orcamento"
  | "aprovacao"
  | "preparacao"
  | "producao"
  | "inspecao"
  | "conclusao";

export interface IndustrialStageMeta {
  id: IndustrialStageId;
  order: number;
  label: string;
  shortLabel: string;
  description: string;
  targetDestination: "painel" | "trabalhos" | "engenharia" | "custos" | "oficina";
  targetSubTab?: string;
}

export const INDUSTRIAL_STAGES: IndustrialStageMeta[] = [
  {
    id: "cadastro",
    order: 1,
    label: "1. Cadastro & Escopo",
    shortLabel: "Cadastro",
    description: "Registro da OS, cliente, especificações base e requisitos de projeto.",
    targetDestination: "trabalhos",
    targetSubTab: "resumo",
  },
  {
    id: "desenvolvimento_tecnico",
    order: 2,
    label: "2. Desenvolvimento Técnico",
    shortLabel: "Desenv. Técnico",
    description: "Validar parâmetros geométricos, dobras (Fator K) e materiais para liberar corte.",
    targetDestination: "engenharia",
    targetSubTab: "central_pcp",
  },
  {
    id: "planejamento_pcp",
    order: 3,
    label: "3. Planejamento / PCP",
    shortLabel: "Planejamento PCP",
    description: "Arranjo de chapas (Nesting CNC), barras de 6m e consolidação da BOM.",
    targetDestination: "engenharia",
    targetSubTab: "nesting",
  },
  {
    id: "orcamento",
    order: 4,
    label: "4. Custos & Orçamento",
    shortLabel: "Orçamento",
    description: "Apuração de matéria-prima, horas de máquina, BDI e emissão de proposta comercial.",
    targetDestination: "custos",
  },
  {
    id: "aprovacao",
    order: 5,
    label: "5. Aprovação Comercial",
    shortLabel: "Aprovação",
    description: "Validação técnica/comercial pelo cliente e congelamento da revisão aprovada.",
    targetDestination: "custos",
  },
  {
    id: "preparacao",
    order: 6,
    label: "6. Preparação & Materiais",
    shortLabel: "Preparação",
    description: "Separação de chapas/perfis no estoque, emissão de fichas QR e setup de máquina.",
    targetDestination: "oficina",
    targetSubTab: "bancada",
  },
  {
    id: "producao",
    order: 7,
    label: "7. Produção (Chão de Fábrica)",
    shortLabel: "Em Produção",
    description: "Execução de corte CNC, dobra, calandragem, soldagem e montagem estrutural.",
    targetDestination: "oficina",
    targetSubTab: "etapas",
  },
  {
    id: "inspecao",
    order: 8,
    label: "8. Inspeção Dimensional & Qualidade",
    shortLabel: "Em Inspeção",
    description: "Conferência dimensional, esquadro, solda, acabamento e validação via QR Code.",
    targetDestination: "oficina",
    targetSubTab: "ficha_qr",
  },
  {
    id: "conclusao",
    order: 9,
    label: "9. Conclusão & Expedição",
    shortLabel: "Concluído",
    description: "Ordem de serviço finalizada, inspecionada e liberada para entrega ao cliente.",
    targetDestination: "trabalhos",
    targetSubTab: "documentos",
  },
];

export type ShopFloorStepId =
  | "aguardando_material"
  | "preparacao"
  | "corte_cnc"
  | "dobra_calandragem"
  | "soldagem"
  | "montagem"
  | "inspecao_dimensional"
  | "concluido";

export interface ShopFloorStepMeta {
  id: ShopFloorStepId;
  label: string;
  shortLabel: string;
  pctWeight: number;
}

export const SHOP_FLOOR_STEPS: ShopFloorStepMeta[] = [
  { id: "aguardando_material", label: "Aguardando Material", shortLabel: "Estoque", pctWeight: 10 },
  { id: "preparacao", label: "Preparação & Traçagem", shortLabel: "Preparação", pctWeight: 20 },
  { id: "corte_cnc", label: "Corte CNC / Serra", shortLabel: "Corte CNC", pctWeight: 40 },
  { id: "dobra_calandragem", label: "Dobra / Calandragem", shortLabel: "Conformação", pctWeight: 55 },
  { id: "soldagem", label: "Soldagem (MIG/TIG)", shortLabel: "Soldagem", pctWeight: 70 },
  { id: "montagem", label: "Montagem & Acabamento", shortLabel: "Montagem", pctWeight: 85 },
  { id: "inspecao_dimensional", label: "Inspeção Dimensional", shortLabel: "Inspeção", pctWeight: 95 },
  { id: "concluido", label: "Concluído & Liberado", shortLabel: "Concluído", pctWeight: 100 },
];

export type DependencySyncState = "atualizado" | "pendente_revisao" | "desatualizado";

export interface NestingInput {
  sheetWidthMm: number;
  sheetHeightMm: number;
  partWidthMm: number;
  partHeightMm: number;
  quantity: number;
  kerfMm: number;
  marginMm?: number;
  allowRotation?: boolean;
  thicknessMm: number;
  densityKgM3: number;
  materialName: string;
  pricePerKgBRL?: number;
  lossPct?: number;
}

export interface PlacedRect {
  index: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotated: boolean;
}

export interface NestingResult {
  cols: number;
  rows: number;
  perSheet: number;
  sheetsNeeded: number;
  rotatedUsed: boolean;
  placedOnFirstSheet: PlacedRect[];
  partAreaMm2: number;
  sheetAreaMm2: number;
  usedAreaOnFirstSheetMm2: number;
  utilizationPct: number;
  scrapPct: number;
  unitMassKg: number;
  totalNetMassKg: number;
  totalSheetGrossMassKg: number;
  cutPerimeterPerPartMm: number;
  totalCutLengthMm: number;
  estimatedMaterialCostBRL: number;
  methodLabel: string;
}

/**
 * Calcula o aproveitamento de chapa em grade retangular com sangria (Kerf).
 * Preserva rigorosamente o caso de referência dourado:
 * - Chapa 3000 × 1500 mm, Peça 620 × 430 mm, Kerf = 3 mm, Qtd = 12, Esp. = 3 mm, Aço Carbono (7850 kg/m³)
 * -> cols = floor(3000 / (620 + 3)) = 4; rows = floor(1500 / (430 + 3)) = 3 => 12 peças/chapa
 * -> 1 chapa necessária
 * -> aproveitamento = (12 * 620 * 430) / (3000 * 1500) = 71,0933% (≈ 71,09%)
 * -> massa unitária = 0,62 * 0,43 * 0,003 * 7850 = 6,279215 kg (≈ 6,279 kg)
 * -> massa total = 12 * 6,279215 = 75,35058 kg (≈ 75,35 kg)
 */
export function calculateRectangularNesting(input: NestingInput): NestingResult {
  const sheetW = Math.max(1, input.sheetWidthMm);
  const sheetH = Math.max(1, input.sheetHeightMm);
  const partW = Math.max(1, input.partWidthMm);
  const partH = Math.max(1, input.partHeightMm);
  const qty = Math.max(1, Math.floor(input.quantity));
  const kerf = Math.max(0, input.kerfMm);
  const margin = Math.max(0, input.marginMm ?? 0);
  const usableW = Math.max(1, sheetW - 2 * margin);
  const usableH = Math.max(1, sheetH - 2 * margin);

  // Orientação normal (0°)
  const stepW0 = partW + kerf;
  const stepH0 = partH + kerf;
  const cols0 = Math.max(0, Math.floor(usableW / stepW0));
  const rows0 = Math.max(0, Math.floor(usableH / stepH0));
  const count0 = cols0 * rows0;

  // Orientação rotacionada (90°)
  const stepW90 = partH + kerf;
  const stepH90 = partW + kerf;
  const cols90 = input.allowRotation ? Math.max(0, Math.floor(usableW / stepW90)) : 0;
  const rows90 = input.allowRotation ? Math.max(0, Math.floor(usableH / stepH90)) : 0;
  const count90 = cols90 * rows90;

  const rotatedUsed = Boolean(input.allowRotation && count90 > count0);
  const cols = rotatedUsed ? cols90 : cols0;
  const rows = rotatedUsed ? rows90 : rows0;
  const perSheet = Math.max(1, rotatedUsed ? count90 : count0);
  const effPartW = rotatedUsed ? partH : partW;
  const effPartH = rotatedUsed ? partW : partH;
  const effStepW = effPartW + kerf;
  const effStepH = effPartH + kerf;

  const sheetsNeeded = Math.max(1, Math.ceil(qty / perSheet));
  const countOnFirstSheet = Math.min(qty, perSheet);

  const placedOnFirstSheet: PlacedRect[] = [];
  for (let i = 0; i < countOnFirstSheet; i++) {
    const r = Math.floor(i / Math.max(1, cols));
    const c = i % Math.max(1, cols);
    placedOnFirstSheet.push({
      index: i + 1,
      xMm: margin + c * effStepW,
      yMm: margin + r * effStepH,
      widthMm: effPartW,
      heightMm: effPartH,
      rotated: rotatedUsed,
    });
  }

  const partAreaMm2 = partW * partH;
  const sheetAreaMm2 = sheetW * sheetH;
  const usedAreaOnFirstSheetMm2 = countOnFirstSheet * partAreaMm2;
  const totalUsedAreaMm2 = qty * partAreaMm2;
  const totalSheetsAreaMm2 = sheetsNeeded * sheetAreaMm2;
  const utilizationPct = Number(((totalUsedAreaMm2 / totalSheetsAreaMm2) * 100).toFixed(2));
  const scrapPct = Number(Math.max(0, 100 - utilizationPct).toFixed(2));

  // Massa em kg: (mm * mm * mm * kg/m³) / 10^9
  const thicknessMm = Math.max(0.1, input.thicknessMm);
  const density = Math.max(100, input.densityKgM3);
  const unitMassKg = (partAreaMm2 * thicknessMm * density) / 1e9;
  const totalNetMassKg = unitMassKg * qty;
  const totalSheetGrossMassKg = ((sheetAreaMm2 * thicknessMm * density) / 1e9) * sheetsNeeded;

  const cutPerimeterPerPartMm = 2 * (partW + partH);
  const totalCutLengthMm = cutPerimeterPerPartMm * qty;

  const pricePerKg = Math.max(0, input.pricePerKgBRL ?? 9.5);
  const lossFactor = 1 + Math.max(0, input.lossPct ?? 10) / 100;
  const estimatedMaterialCostBRL = totalNetMassKg * pricePerKg * lossFactor;

  return {
    cols,
    rows,
    perSheet,
    sheetsNeeded,
    rotatedUsed,
    placedOnFirstSheet,
    partAreaMm2,
    sheetAreaMm2,
    usedAreaOnFirstSheetMm2,
    utilizationPct,
    scrapPct,
    unitMassKg,
    totalNetMassKg,
    totalSheetGrossMassKg,
    cutPerimeterPerPartMm,
    totalCutLengthMm,
    estimatedMaterialCostBRL,
    methodLabel: "Arranjo em Grade Retangular com Kerf (Guilhotina CNC)",
  };
}

export interface BendCompensationInput {
  flangeLengthsMm: number[];
  bendAnglesDeg: number[];
  thicknessMm: number;
  insideRadiusMm: number;
  kFactor: number;
  vDieOpeningMm?: number;
}

export interface BendCompensationResult {
  totalSumOfFlangesMm: number;
  bendAllowancesMm: number[];
  bendDeductionsMm: number[];
  totalBendDeductionMm: number;
  flatPatternLengthMm: number;
  recommendedVDieMm: number;
  neutralAxisOffsetMm: number;
}

/**
 * Calcula a Compensação de Dobra (Fator K), Avanço (BA), Dedução de Dobra (BD)
 * e o Comprimento Desenvolvido Plano (Blank Length) de uma peça dobrada.
 */
export function calculateBendCompensation(
  input: BendCompensationInput,
): BendCompensationResult {
  const t = Math.max(0.1, input.thicknessMm);
  const r = Math.max(0.1, input.insideRadiusMm);
  const k = Math.min(1, Math.max(0.1, input.kFactor));
  const flanges = input.flangeLengthsMm.length ? input.flangeLengthsMm : [100, 100];
  const angles = input.bendAnglesDeg;

  const totalSumOfFlangesMm = flanges.reduce((acc, v) => acc + Math.max(0, v), 0);
  const bendAllowancesMm: number[] = [];
  const bendDeductionsMm: number[] = [];

  const numBends = Math.max(0, flanges.length - 1);
  for (let i = 0; i < numBends; i++) {
    const angleDeg = Math.min(179, Math.max(1, angles[i] ?? 90));
    const angleRad = (angleDeg * Math.PI) / 180;
    const ba = angleRad * (r + k * t);
    const ossb = Math.tan(angleRad / 2) * (r + t);
    const bd = 2 * ossb - ba;
    bendAllowancesMm.push(Number(ba.toFixed(2)));
    bendDeductionsMm.push(Number(bd.toFixed(2)));
  }

  const totalBendDeductionMm = Number(
    bendDeductionsMm.reduce((acc, v) => acc + v, 0).toFixed(2),
  );
  const flatPatternLengthMm = Number(
    Math.max(1, totalSumOfFlangesMm - totalBendDeductionMm).toFixed(2),
  );
  const recommendedVDieMm = input.vDieOpeningMm ?? Number((t <= 3 ? t * 6 : t * 8).toFixed(1));
  const neutralAxisOffsetMm = Number((k * t).toFixed(3));

  return {
    totalSumOfFlangesMm: Number(totalSumOfFlangesMm.toFixed(2)),
    bendAllowancesMm,
    bendDeductionsMm,
    totalBendDeductionMm,
    flatPatternLengthMm,
    recommendedVDieMm,
    neutralAxisOffsetMm,
  };
}

export interface IndustrialCostInput {
  netMassKg: number;
  pricePerKgBRL: number;
  lossPct: number;
  cutLengthMeters: number;
  cncCutRatePerMeterBRL: number;
  pierceCount: number;
  costPerPierceBRL: number;
  bendCount: number;
  costPerBendBRL: number;
  calenderingHours: number;
  calenderingRateBRL: number;
  weldingMeters: number;
  weldingRatePerMeterBRL: number;
  machiningFinishingHours: number;
  machiningRateBRL: number;
  paintingAreaM2: number;
  paintingRatePerM2BRL: number;
  directLaborHours: number;
  directLaborRateBRL: number;
  consumablesBRL: number;
  freightAndInstallationBRL: number;
  overheadTaxPct: number;
  profitMarginBdiPct: number;
  approvedCommercialPriceBRL?: number | null;
}

export interface IndustrialCostBreakdown {
  grossMassWithLossKg: number;
  rawMaterialCostBRL: number;
  cncCuttingCostBRL: number;
  bendingCostBRL: number;
  calenderingCostBRL: number;
  weldingCostBRL: number;
  machiningAndPaintingCostBRL: number;
  directLaborCostBRL: number;
  totalDirectCostBRL: number;
  additionalAndIndirectCostBRL: number;
  subtotalBeforeMarginBRL: number;
  overheadTaxAmountBRL: number;
  commercialMarginAmountBRL: number;
  suggestedTechnicalPriceBRL: number;
  approvedCommercialPriceBRL: number;
  effectivePricePerKgBRL: number;
}

/**
 * Calcula os 4 blocos financeiros de Custos & Orçamento Comercial:
 * 1. Custo Direto (Matéria-prima com perda + Operações de máquina + Mão de obra)
 * 2. Custos Adicionais & Indiretos (Consumíveis, Frete/Instalação, Impostos/Overhead)
 * 3. Margem Comercial & BDI (%)
 * 4. Preço Técnico Sugerido vs. Orçamento Comercial Aprovado
 */
export function calculateIndustrialCosts(
  input: IndustrialCostInput,
): IndustrialCostBreakdown {
  const netMass = Math.max(0, input.netMassKg);
  const lossFactor = 1 + Math.max(0, input.lossPct) / 100;
  const grossMassWithLossKg = Number((netMass * lossFactor).toFixed(3));
  const rawMaterialCostBRL = Number(
    (grossMassWithLossKg * Math.max(0, input.pricePerKgBRL)).toFixed(2),
  );

  const cncCuttingCostBRL = Number(
    (
      Math.max(0, input.cutLengthMeters) * Math.max(0, input.cncCutRatePerMeterBRL) +
      Math.max(0, input.pierceCount) * Math.max(0, input.costPerPierceBRL)
    ).toFixed(2),
  );
  const bendingCostBRL = Number(
    (Math.max(0, input.bendCount) * Math.max(0, input.costPerBendBRL)).toFixed(2),
  );
  const calenderingCostBRL = Number(
    (Math.max(0, input.calenderingHours) * Math.max(0, input.calenderingRateBRL)).toFixed(2),
  );
  const weldingCostBRL = Number(
    (Math.max(0, input.weldingMeters) * Math.max(0, input.weldingRatePerMeterBRL)).toFixed(2),
  );
  const machiningAndPaintingCostBRL = Number(
    (
      Math.max(0, input.machiningFinishingHours) * Math.max(0, input.machiningRateBRL) +
      Math.max(0, input.paintingAreaM2) * Math.max(0, input.paintingRatePerM2BRL)
    ).toFixed(2),
  );
  const directLaborCostBRL = Number(
    (Math.max(0, input.directLaborHours) * Math.max(0, input.directLaborRateBRL)).toFixed(2),
  );

  const totalDirectCostBRL = Number(
    (
      rawMaterialCostBRL +
      cncCuttingCostBRL +
      bendingCostBRL +
      calenderingCostBRL +
      weldingCostBRL +
      machiningAndPaintingCostBRL +
      directLaborCostBRL
    ).toFixed(2),
  );

  const baseAdditional =
    Math.max(0, input.consumablesBRL) + Math.max(0, input.freightAndInstallationBRL);
  const overheadTaxAmountBRL = Number(
    ((totalDirectCostBRL + baseAdditional) * (Math.max(0, input.overheadTaxPct) / 100)).toFixed(2),
  );
  const additionalAndIndirectCostBRL = Number(
    (baseAdditional + overheadTaxAmountBRL).toFixed(2),
  );

  const subtotalBeforeMarginBRL = Number(
    (totalDirectCostBRL + additionalAndIndirectCostBRL).toFixed(2),
  );
  const commercialMarginAmountBRL = Number(
    (subtotalBeforeMarginBRL * (Math.max(0, input.profitMarginBdiPct) / 100)).toFixed(2),
  );
  const suggestedTechnicalPriceBRL = Number(
    (subtotalBeforeMarginBRL + commercialMarginAmountBRL).toFixed(2),
  );

  const approvedCommercialPriceBRL =
    typeof input.approvedCommercialPriceBRL === "number" && input.approvedCommercialPriceBRL > 0
      ? Number(input.approvedCommercialPriceBRL.toFixed(2))
      : suggestedTechnicalPriceBRL;

  const effectivePricePerKgBRL =
    netMass > 0 ? Number((approvedCommercialPriceBRL / netMass).toFixed(2)) : 0;

  return {
    grossMassWithLossKg,
    rawMaterialCostBRL,
    cncCuttingCostBRL,
    bendingCostBRL,
    calenderingCostBRL,
    weldingCostBRL,
    machiningAndPaintingCostBRL,
    directLaborCostBRL,
    totalDirectCostBRL,
    additionalAndIndirectCostBRL,
    subtotalBeforeMarginBRL,
    overheadTaxAmountBRL,
    commercialMarginAmountBRL,
    suggestedTechnicalPriceBRL,
    approvedCommercialPriceBRL,
    effectivePricePerKgBRL,
  };
}

export interface EmittedQuoteSnapshot {
  id: string;
  workOrderId: string;
  workOrderCode: string;
  workOrderName: string;
  clientName: string;
  revisionLabel: string;
  createdAt: number;
  netMassKg: number;
  totalDirectCostBRL: number;
  additionalAndIndirectCostBRL: number;
  commercialMarginAmountBRL: number;
  suggestedTechnicalPriceBRL: number;
  approvedCommercialPriceBRL: number;
  notes: string;
  /** Snapshot imutável: alterações posteriores no trabalho não reescrevem este registro */
  immutable: true;
}

export interface WorkOrderDependencyRecord {
  workOrderId: string;
  lastGeometryChangeAt: number;
  lastNestingValidatedAt: number;
  lastBomValidatedAt: number;
  lastCostValidatedAt: number;
}

export function evaluateDependencyStates(rec: WorkOrderDependencyRecord): {
  nesting: DependencySyncState;
  bom: DependencySyncState;
  costs: DependencySyncState;
} {
  const geomT = rec.lastGeometryChangeAt;
  const nesting: DependencySyncState =
    rec.lastNestingValidatedAt >= geomT ? "atualizado" : "pendente_revisao";
  const bom: DependencySyncState =
    rec.lastBomValidatedAt >= geomT && rec.lastBomValidatedAt >= rec.lastNestingValidatedAt
      ? "atualizado"
      : "pendente_revisao";
  const costs: DependencySyncState =
    rec.lastCostValidatedAt >= geomT && rec.lastCostValidatedAt >= rec.lastBomValidatedAt
      ? "atualizado"
      : "desatualizado";
  return { nesting, bom, costs };
}

export function createImmutableQuoteSnapshot(params: {
  workOrderId: string;
  workOrderCode: string;
  workOrderName: string;
  clientName: string;
  revisionNumber: number;
  breakdown: IndustrialCostBreakdown;
  netMassKg: number;
  notes?: string;
}): EmittedQuoteSnapshot {
  const revLetter = String.fromCharCode(64 + Math.max(1, Math.min(26, params.revisionNumber)));
  return Object.freeze({
    id: `QT-${params.workOrderCode}-${revLetter}-${Date.now().toString(36).toUpperCase()}`,
    workOrderId: params.workOrderId,
    workOrderCode: params.workOrderCode,
    workOrderName: params.workOrderName,
    clientName: params.clientName,
    revisionLabel: `Rev. ${revLetter} (R${params.revisionNumber})`,
    createdAt: Date.now(),
    netMassKg: params.netMassKg,
    totalDirectCostBRL: params.breakdown.totalDirectCostBRL,
    additionalAndIndirectCostBRL: params.breakdown.additionalAndIndirectCostBRL,
    commercialMarginAmountBRL: params.breakdown.commercialMarginAmountBRL,
    suggestedTechnicalPriceBRL: params.breakdown.suggestedTechnicalPriceBRL,
    approvedCommercialPriceBRL: params.breakdown.approvedCommercialPriceBRL,
    notes: params.notes ?? "Proposta técnica e comercial emitida e congelada.",
    immutable: true as const,
  });
}
