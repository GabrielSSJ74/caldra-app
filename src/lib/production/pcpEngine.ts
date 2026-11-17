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

export type ShopFloorStepId =
  | "preparacao"
  | "marcacao_tracagem"
  | "corte_cnc"
  | "dobra_calandragem"
  | "montagem_ponteamento"
  | "soldagem"
  | "inspecao_dimensional"
  | "concluido";

export type DependencySyncState = "atualizado" | "pendente_revisao" | "desatualizado";

export interface WorkOrderDependencyRecord {
  workOrderId: string;
  lastGeometryChangeAt: number;
  lastNestingValidatedAt: number;
  lastBomValidatedAt: number;
  lastCostValidatedAt: number;
}

export interface IndustrialStageMeta {
  id: IndustrialStageId;
  order: number;
  stepNumber: number;
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
    stepNumber: 1,
    label: "1. Cadastro & Escopo da OS",
    shortLabel: "Cadastro",
    description: "Registro do cliente, especificações de material e peças da Ordem de Serviço.",
    targetDestination: "trabalhos",
    targetSubTab: "resumo",
  },
  {
    id: "desenvolvimento_tecnico",
    order: 2,
    stepNumber: 2,
    label: "2. Desenvolvimento Técnico & CAD",
    shortLabel: "Engenharia CAD",
    description: "Modelagem 2D/3D no CHAMFER, planificação de chapa e revisão dimensional.",
    targetDestination: "engenharia",
    targetSubTab: "central_pcp",
  },
  {
    id: "planejamento_pcp",
    order: 3,
    stepNumber: 3,
    label: "3. Planejamento PCP & Nesting",
    shortLabel: "Nesting & PCP",
    description: "Arranjo de corte em chapa, barras de 6m, cálculo de Kerf e lista BOM.",
    targetDestination: "engenharia",
    targetSubTab: "nesting",
  },
  {
    id: "orcamento",
    order: 4,
    stepNumber: 4,
    label: "4. Custos & Orçamento Técnico",
    shortLabel: "Orçamento",
    description: "Formação de custo industrial: matéria-prima, consumíveis, horas-máquina e BDI.",
    targetDestination: "custos",
  },
  {
    id: "aprovacao",
    order: 5,
    stepNumber: 5,
    label: "5. Aprovação Comercial",
    shortLabel: "Aprovação",
    description: "Congelamento da revisão de proposta comercial e liberação para fábrica.",
    targetDestination: "custos",
  },
  {
    id: "preparacao",
    order: 6,
    stepNumber: 6,
    label: "6. Preparação de Matéria-Prima",
    shortLabel: "Preparação",
    description: "Separação de chapas e perfis no almoxarifado e emissão de etiquetas QR.",
    targetDestination: "oficina",
    targetSubTab: "bancada",
  },
  {
    id: "producao",
    order: 7,
    stepNumber: 7,
    label: "7. Execução na Oficina (Corte/Dobra/Solda)",
    shortLabel: "Produção",
    description: "Fabricação ativa nas bancadas de corte CNC, calandragem, dobra e soldagem.",
    targetDestination: "oficina",
    targetSubTab: "etapas",
  },
  {
    id: "inspecao",
    order: 8,
    stepNumber: 8,
    label: "8. Inspeção Dimensional & Qualidade",
    shortLabel: "Inspeção",
    description: "Conferência de cotas críticas, esquadro, acabamento superficial e solda.",
    targetDestination: "oficina",
    targetSubTab: "ficha_qr",
  },
  {
    id: "conclusao",
    order: 9,
    stepNumber: 9,
    label: "9. Expedição & OS Concluída",
    shortLabel: "Concluído",
    description: "Ordem de serviço finalizada, inspecionada e liberada para entrega.",
    targetDestination: "trabalhos",
    targetSubTab: "documentos",
  },
];

export interface ShopFloorStepMeta {
  id: ShopFloorStepId;
  label: string;
  shortLabel: string;
  pctWeight: number;
}

export const SHOP_FLOOR_STEPS: ShopFloorStepMeta[] = [
  {
    id: "preparacao",
    label: "Preparação & Almoxarifado",
    shortLabel: "Preparação",
    pctWeight: 12,
  },
  {
    id: "marcacao_tracagem",
    label: "Marcação & Traçagem 1:1",
    shortLabel: "Traçagem",
    pctWeight: 25,
  },
  {
    id: "corte_cnc",
    label: "Corte CNC / Plasma / Laser / Serra",
    shortLabel: "Corte",
    pctWeight: 40,
  },
  {
    id: "dobra_calandragem",
    label: "Dobra & Calandragem",
    shortLabel: "Dobra",
    pctWeight: 55,
  },
  {
    id: "montagem_ponteamento",
    label: "Montagem & Ponteamento",
    shortLabel: "Ponteamento",
    pctWeight: 70,
  },
  {
    id: "soldagem",
    label: "Soldagem Final & Acabamento",
    shortLabel: "Soldagem",
    pctWeight: 85,
  },
  {
    id: "inspecao_dimensional",
    label: "Inspeção Dimensional & QR",
    shortLabel: "Inspeção",
    pctWeight: 95,
  },
  {
    id: "concluido",
    label: "Concluído & Expedido",
    shortLabel: "Concluído",
    pctWeight: 100,
  },
];

export function evaluateDependencyStates(rec: WorkOrderDependencyRecord): {
  nesting: DependencySyncState;
  bom: DependencySyncState;
  costs: DependencySyncState;
} {
  const evalStamp = (validatedAt: number): DependencySyncState => {
    if (!validatedAt || validatedAt <= 0) return "pendente_revisao";
    if (validatedAt < rec.lastGeometryChangeAt) return "desatualizado";
    return "atualizado";
  };

  return {
    nesting: evalStamp(rec.lastNestingValidatedAt),
    bom: evalStamp(rec.lastBomValidatedAt),
    costs: evalStamp(rec.lastCostValidatedAt),
  };
}

export interface BendCompensationInput {
  flangeLengthsMm: number[];
  bendAnglesDeg: number[];
  thicknessMm: number;
  insideRadiusMm: number;
  kFactor: number;
}

export interface BendCompensationResult {
  totalSumOfFlangesMm: number;
  totalBendAllowanceMm: number;
  totalBendDeductionMm: number;
  flatPatternLengthMm: number;
  recommendedVDieMm: number;
  neutralAxisOffsetMm: number;
}

export function calculateBendCompensation(
  input: BendCompensationInput,
): BendCompensationResult {
  const T = Math.max(0.2, Number(input.thicknessMm) || 2);
  const R = Math.max(0.1, Number(input.insideRadiusMm) || T);
  const K = Math.max(0.1, Math.min(0.5, Number(input.kFactor) || 0.33));

  const flanges = input.flangeLengthsMm.map((v) => Math.max(0, Number(v) || 0));
  const totalSumOfFlangesMm = flanges.reduce((acc, v) => acc + v, 0);

  let totalBA = 0;
  let totalBD = 0;

  for (const rawAngle of input.bendAnglesDeg) {
    const angleDeg = Math.max(1, Math.min(179, Math.abs(Number(rawAngle) || 90)));
    const rad = (angleDeg * Math.PI) / 180;
    const ba = rad * (R + K * T);
    const ossb = Math.tan(rad / 2) * (R + T);
    const bd = 2 * ossb - ba;
    totalBA += ba;
    totalBD += bd;
  }

  const flatPatternLengthMm = Math.max(0, totalSumOfFlangesMm - totalBD);
  const recommendedVDieMm = Number((T <= 3 ? T * 6 : T <= 10 ? T * 8 : T * 10).toFixed(1));
  const neutralAxisOffsetMm = Number((K * T).toFixed(2));

  return {
    totalSumOfFlangesMm: Number(totalSumOfFlangesMm.toFixed(2)),
    totalBendAllowanceMm: Number(totalBA.toFixed(2)),
    totalBendDeductionMm: Number(totalBD.toFixed(2)),
    flatPatternLengthMm: Number(flatPatternLengthMm.toFixed(2)),
    recommendedVDieMm,
    neutralAxisOffsetMm,
  };
}

export interface IndustrialCostInput {
  netMassKg: number;
  scrapPercent: number;
  pricePerKgBRL: number;
  cuttingMeters: number;
  cuttingCostPerMeterBRL: number;
  bendCount: number;
  costPerBendBRL: number;
  weldMeters: number;
  weldCostPerMeterBRL: number;
  paintingAreaM2: number;
  paintingCostPerM2BRL: number;
  laborHours: number;
  hourlyRateBRL: number;
  consumablesFixedBRL: number;
  logisticsFixedBRL: number;
  overheadPercent: number;
  profitMarginPercent: number;
  taxPercent: number;
}

export interface IndustrialCostBreakdown {
  grossMassKg: number;
  materialCostBRL: number;
  cuttingCostBRL: number;
  bendingCostBRL: number;
  weldingCostBRL: number;
  paintingCostBRL: number;
  operationsCostBRL: number;
  laborCostBRL: number;
  consumablesAndLogisticsBRL: number;
  directCostBRL: number;
  overheadCostBRL: number;
  profitBRL: number;
  taxesBRL: number;
  suggestedTechnicalPriceBRL: number;
}

export function calculateIndustrialCosts(
  input: IndustrialCostInput,
): IndustrialCostBreakdown {
  const netMassKg = Math.max(0, Number(input.netMassKg) || 0);
  const scrapFactor = 1 + Math.max(0, Number(input.scrapPercent) || 0) / 100;
  const grossMassKg = Number((netMassKg * scrapFactor).toFixed(2));

  const materialCostBRL = Number(
    (grossMassKg * Math.max(0, Number(input.pricePerKgBRL) || 0)).toFixed(2),
  );
  const cuttingCostBRL = Number(
    (
      Math.max(0, Number(input.cuttingMeters) || 0) *
      Math.max(0, Number(input.cuttingCostPerMeterBRL) || 0)
    ).toFixed(2),
  );
  const bendingCostBRL = Number(
    (
      Math.max(0, Number(input.bendCount) || 0) *
      Math.max(0, Number(input.costPerBendBRL) || 0)
    ).toFixed(2),
  );
  const weldingCostBRL = Number(
    (
      Math.max(0, Number(input.weldMeters) || 0) *
      Math.max(0, Number(input.weldCostPerMeterBRL) || 0)
    ).toFixed(2),
  );
  const paintingCostBRL = Number(
    (
      Math.max(0, Number(input.paintingAreaM2) || 0) *
      Math.max(0, Number(input.paintingCostPerM2BRL) || 0)
    ).toFixed(2),
  );

  const operationsCostBRL = Number(
    (cuttingCostBRL + bendingCostBRL + weldingCostBRL + paintingCostBRL).toFixed(2),
  );
  const laborCostBRL = Number(
    (
      Math.max(0, Number(input.laborHours) || 0) *
      Math.max(0, Number(input.hourlyRateBRL) || 0)
    ).toFixed(2),
  );
  const consumablesAndLogisticsBRL = Number(
    (
      Math.max(0, Number(input.consumablesFixedBRL) || 0) +
      Math.max(0, Number(input.logisticsFixedBRL) || 0)
    ).toFixed(2),
  );

  const directCostBRL = Number(
    (
      materialCostBRL +
      operationsCostBRL +
      laborCostBRL +
      consumablesAndLogisticsBRL
    ).toFixed(2),
  );

  const overheadCostBRL = Number(
    (directCostBRL * (Math.max(0, Number(input.overheadPercent) || 0) / 100)).toFixed(2),
  );
  const baseWithOverhead = directCostBRL + overheadCostBRL;
  const profitBRL = Number(
    (baseWithOverhead * (Math.max(0, Number(input.profitMarginPercent) || 0) / 100)).toFixed(2),
  );
  const subtotalBeforeTax = baseWithOverhead + profitBRL;
  const taxesBRL = Number(
    (subtotalBeforeTax * (Math.max(0, Number(input.taxPercent) || 0) / 100)).toFixed(2),
  );
  const suggestedTechnicalPriceBRL = Number((subtotalBeforeTax + taxesBRL).toFixed(2));

  return {
    grossMassKg,
    materialCostBRL,
    cuttingCostBRL,
    bendingCostBRL,
    weldingCostBRL,
    paintingCostBRL,
    operationsCostBRL,
    laborCostBRL,
    consumablesAndLogisticsBRL,
    directCostBRL,
    overheadCostBRL,
    profitBRL,
    taxesBRL,
    suggestedTechnicalPriceBRL,
  };
}

export interface EmittedQuoteSnapshot {
  id: string;
  workOrderId: string;
  workOrderCode: string;
  workOrderName: string;
  clientName: string;
  revisionNumber: number;
  revisionLabel: string;
  emittedAtIso: string;
  netMassKg: number;
  suggestedTechnicalPriceBRL: number;
  approvedCommercialPriceBRL: number;
  notes: string;
  breakdown: IndustrialCostBreakdown;
}

export function createImmutableQuoteSnapshot(input: {
  workOrderId: string;
  workOrderCode: string;
  workOrderName: string;
  clientName: string;
  existingSnapshotsCount: number;
  netMassKg: number;
  breakdown: IndustrialCostBreakdown;
  commercialOverrideBRL: number | null;
  notes: string;
}): EmittedQuoteSnapshot {
  const revNum = Math.max(1, (input.existingSnapshotsCount || 0) + 1);
  const approvedPrice =
    input.commercialOverrideBRL !== null &&
    Number.isFinite(input.commercialOverrideBRL) &&
    input.commercialOverrideBRL > 0
      ? Number(input.commercialOverrideBRL.toFixed(2))
      : input.breakdown.suggestedTechnicalPriceBRL;

  return {
    id: `quote_${Date.now()}_${revNum}`,
    workOrderId: input.workOrderId,
    workOrderCode: input.workOrderCode,
    workOrderName: input.workOrderName,
    clientName: input.clientName,
    revisionNumber: revNum,
    revisionLabel: `REV-${String(revNum).padStart(2, "0")}`,
    emittedAtIso: new Date().toISOString(),
    netMassKg: Number((input.netMassKg || 0).toFixed(2)),
    suggestedTechnicalPriceBRL: input.breakdown.suggestedTechnicalPriceBRL,
    approvedCommercialPriceBRL: approvedPrice,
    notes: input.notes || "Proposta comercial emitida via CALDRA OPS.",
    breakdown: { ...input.breakdown },
  };
}
