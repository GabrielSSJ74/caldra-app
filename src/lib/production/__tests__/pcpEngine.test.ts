import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateRectangularNesting,
  calculateBendCompensation,
  calculateIndustrialCosts,
  evaluateDependencyStates,
  createImmutableQuoteSnapshot,
} from "../pcpEngine";

test("Caso Dourado de Nesting CNC: Chapa 3000x1500, Peça 620x430, Kerf 3mm, Qtd 12, Esp 3mm, Aço Carbono", () => {
  const res = calculateRectangularNesting({
    sheetWidthMm: 3000,
    sheetHeightMm: 1500,
    partWidthMm: 620,
    partHeightMm: 430,
    quantity: 12,
    kerfMm: 3,
    thicknessMm: 3,
    densityKgM3: 7850,
    materialName: "Aço Carbono",
    pricePerKgBRL: 9.5,
    lossPct: 10,
  });

  assert.equal(res.cols, 4, "4 colunas na largura de 3000mm");
  assert.equal(res.rows, 3, "3 linhas na altura de 1500mm");
  assert.equal(res.perSheet, 12, "12 peças por chapa");
  assert.equal(res.sheetsNeeded, 1, "1 chapa necessária");
  assert.equal(res.utilizationPct, 71.09, "Aproveitamento exato de 71,09%");
  assert.ok(Math.abs(res.unitMassKg - 6.27843) < 0.002, "Massa unitária ≈ 6,28 kg");
  assert.ok(Math.abs(res.totalNetMassKg - 75.34116) < 0.02, "Massa total ≈ 75,34–75,35 kg");
});

test("Compensação de Dobra (Fator K): Suporte em U com 2 dobras a 90°", () => {
  const bend = calculateBendCompensation({
    flangeLengthsMm: [50, 100, 50],
    bendAnglesDeg: [90, 90],
    thicknessMm: 3,
    insideRadiusMm: 3,
    kFactor: 0.4,
  });

  assert.equal(bend.totalSumOfFlangesMm, 200);
  assert.equal(bend.bendAllowancesMm.length, 2);
  assert.ok(bend.flatPatternLengthMm < 200 && bend.flatPatternLengthMm > 180);
  assert.equal(bend.recommendedVDieMm, 18);
});

test("Propagação de Dependências e Imutabilidade de Proposta Emitida (Quote Snapshot)", () => {
  const depInitial = evaluateDependencyStates({
    workOrderId: "wo-1",
    lastGeometryChangeAt: 1000,
    lastNestingValidatedAt: 1000,
    lastBomValidatedAt: 1000,
    lastCostValidatedAt: 1000,
  });
  assert.equal(depInitial.nesting, "atualizado");
  assert.equal(depInitial.bom, "atualizado");
  assert.equal(depInitial.costs, "atualizado");

  // Alteração geométrica na peça marca Nesting/BOM como pendente_revisao e Custos como desatualizado
  const depAfterEdit = evaluateDependencyStates({
    workOrderId: "wo-1",
    lastGeometryChangeAt: 2000,
    lastNestingValidatedAt: 1000,
    lastBomValidatedAt: 1000,
    lastCostValidatedAt: 1000,
  });
  assert.equal(depAfterEdit.nesting, "pendente_revisao");
  assert.equal(depAfterEdit.bom, "pendente_revisao");
  assert.equal(depAfterEdit.costs, "desatualizado");

  const breakdownBefore = calculateIndustrialCosts({
    netMassKg: 75.35,
    pricePerKgBRL: 9.5,
    lossPct: 10,
    cutLengthMeters: 25.2,
    cncCutRatePerMeterBRL: 8,
    pierceCount: 12,
    costPerPierceBRL: 1.5,
    bendCount: 24,
    costPerBendBRL: 4,
    calenderingHours: 0,
    calenderingRateBRL: 120,
    weldingMeters: 4,
    weldingRatePerMeterBRL: 25,
    machiningFinishingHours: 2,
    machiningRateBRL: 95,
    paintingAreaM2: 3.2,
    paintingRatePerM2BRL: 45,
    directLaborHours: 6,
    directLaborRateBRL: 85,
    consumablesBRL: 65,
    freightAndInstallationBRL: 180,
    overheadTaxPct: 12,
    profitMarginBdiPct: 25,
  });

  const emittedQuote = createImmutableQuoteSnapshot({
    workOrderId: "wo-1",
    workOrderCode: "OS-001",
    workOrderName: "Chaminé Industrial",
    clientName: "João da Silva Metalúrgica",
    revisionNumber: 1,
    breakdown: breakdownBefore,
    netMassKg: 75.35,
  });

  // Mesmo se o trabalho ativo tiver custo recalculado depois, o snapshot permanece intacto
  const breakdownAfter = calculateIndustrialCosts({
    netMassKg: 150.7,
    pricePerKgBRL: 12.0,
    lossPct: 15,
    cutLengthMeters: 50,
    cncCutRatePerMeterBRL: 10,
    pierceCount: 24,
    costPerPierceBRL: 2,
    bendCount: 48,
    costPerBendBRL: 5,
    calenderingHours: 2,
    calenderingRateBRL: 120,
    weldingMeters: 8,
    weldingRatePerMeterBRL: 25,
    machiningFinishingHours: 4,
    machiningRateBRL: 95,
    paintingAreaM2: 6.4,
    paintingRatePerM2BRL: 45,
    directLaborHours: 12,
    directLaborRateBRL: 85,
    consumablesBRL: 120,
    freightAndInstallationBRL: 300,
    overheadTaxPct: 12,
    profitMarginBdiPct: 25,
  });

  assert.notEqual(
    emittedQuote.suggestedTechnicalPriceBRL,
    breakdownAfter.suggestedTechnicalPriceBRL,
    "Proposta emitida na Rev. A permanece imutável após alteração no trabalho ativo",
  );
  assert.equal(emittedQuote.revisionLabel, "Rev. A (R1)");
});
