import { describe, it, expect } from "vitest";
import {
  calibrateByTwoPoints,
  calibrateByMultipleReferences,
  calibrateByScannerDpi,
  computeRectifiedHomography,
  applyHomographyToPoint,
  generateCalibrationSheetSvg,
} from "../revEngCalibration";
import {
  fitOrthogonalLine,
  fitOrthogonalCircleOrArc,
  fitSimplifiedPolyline,
  buildFittedCandidate,
  syncMeasurementsWithEntities,
} from "../revEngFitting";
import {
  createDefaultRevEngPlanData,
  sanitizeRevEngPlanData,
  REV_ENG_STATUS_META,
} from "../revEngTypes";
import { roleOf, profileById, LASER_PROFILE_ID } from "../roles";

describe("FASE B — Engenharia Reversa: Calibração, Homografia, Caderno de Medições e Ajustes Ortogonais", () => {
  it("T1: Calibração por 2 referências compatíveis (100 mm e 50 mm) calcula mm/px correto e resíduo baixo", () => {
    // Escala real ~0.1 mm/px (1000 px = 100.0 mm, 500.5 px = 50.0 mm)
    const fit = calibrateByMultipleReferences([
      {
        id: "ref-1",
        label: "Cota X (Paquímetro)",
        p1Px: { x: 100, y: 200 },
        p2Px: { x: 1100, y: 200 },
        knownLengthMm: 100.0,
        axisHint: "horizontal",
      },
      {
        id: "ref-2",
        label: "Cota Y (Paquímetro)",
        p1Px: { x: 100, y: 200 },
        p2Px: { x: 100, y: 700.5 },
        knownLengthMm: 50.0,
        axisHint: "vertical",
      },
    ]);

    expect(fit.mmPerPx).toBeCloseTo(0.09998, 4);
    expect(fit.rmsErrorMm).toBeLessThan(0.05);
    expect(fit.maxErrorMm).toBeLessThan(0.06);
    expect(fit.status).toBe("ok");
    expect(fit.residuals).toHaveLength(2);
    expect(fit.residuals.every((r) => r.compatible)).toBe(true);
  });

  it("T2: Calibração por 2 referências incompatíveis (100 mm para 1000 px e 80 mm para 1000 px) acusa erro alto e incompatibilidade", () => {
    const fit = calibrateByMultipleReferences([
      {
        id: "ref-a",
        label: "Ref A (100 mm)",
        p1Px: { x: 0, y: 0 },
        p2Px: { x: 1000, y: 0 },
        knownLengthMm: 100.0,
        axisHint: "horizontal",
      },
      {
        id: "ref-b",
        label: "Ref B (80 mm p/ mesma distância em px)",
        p1Px: { x: 0, y: 100 },
        p2Px: { x: 1000, y: 100 },
        knownLengthMm: 80.0,
        axisHint: "horizontal",
      },
    ]);

    // Escala média LSQ = (1000*100 + 1000*80) / (1000^2 + 1000^2) = 0.09 mm/px
    expect(fit.mmPerPx).toBeCloseTo(0.09, 4);
    // Resíduo de 10 mm em cada referência!
    expect(fit.maxErrorMm).toBeGreaterThanOrEqual(9.9);
    expect(fit.status).toBe("incompativel");
    expect(fit.message).toContain("Incompatível");
  });

  it("T3: Homografia 4 pontos em retângulo conhecido (170 x 240 mm) retifica perspectiva com erro residual < 0.2 mm", () => {
    // 4 cantos de uma folha de calibração fotografada em perspectiva oblíqua
    const quadCornersPx: [
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
    ] = [
      { x: 210, y: 145 }, // C1 Superior Esquerdo -> (0, 0)
      { x: 1840, y: 180 }, // C2 Superior Direito -> (170, 0)
      { x: 1960, y: 2510 }, // C3 Inferior Direito -> (170, 240)
      { x: 115, y: 2460 }, // C4 Inferior Esquerdo -> (0, 240)
    ];

    const spec = computeRectifiedHomography(quadCornersPx, 170, 240);
    expect(spec.residualRmsMm).toBeLessThan(0.2);
    expect(spec.maxCornerErrorMm).toBeLessThan(0.2);
    expect(spec.matrixH).toHaveLength(9);

    // Verifica projeção dos cantos
    const p0 = applyHomographyToPoint(spec.matrixH, quadCornersPx[0]);
    const p2 = applyHomographyToPoint(spec.matrixH, quadCornersPx[2]);
    expect(p0.x).toBeCloseTo(0, 2);
    expect(p0.y).toBeCloseTo(0, 2);
    expect(p2.x).toBeCloseTo(170, 2);
    expect(p2.y).toBeCloseTo(240, 2);
  });

  it("T10: Arco curto (< 60°) ajustado por Mínimos Quadrados Ortogonais recupera o raio real sem viés de arco curto", () => {
    // Arco real: centro (50, -120), R = 250 mm, abertura de 10° a 46° (36° < 60°)
    const trueCx = 50;
    const trueCy = -120;
    const trueR = 250;
    const anglesDeg = [10, 15, 20, 25, 30, 35, 40, 46];
    const noiseMm = [0.04, -0.03, 0.02, -0.05, 0.03, 0.01, -0.04, 0.02];

    const pts = anglesDeg.map((deg, idx) => {
      const rad = (deg * Math.PI) / 180;
      const rNoisy = trueR + (noiseMm[idx] ?? 0);
      return {
        x: trueCx + rNoisy * Math.cos(rad),
        y: trueCy + rNoisy * Math.sin(rad),
      };
    });

    const fit = fitOrthogonalCircleOrArc(pts, false);
    expect(fit.collinearWarning).toBeUndefined();
    // Raio recuperado dentro de ±2.5 mm mesmo em arco curto de 36° com ruído
    expect(Math.abs(fit.r - trueR)).toBeLessThan(2.5);
    expect(fit.rmsMm).toBeLessThan(0.15);
    expect(fit.maxDeviationMm).toBeLessThan(0.25);
    expect(fit.pointCount).toBe(8);
  });

  it("Ajuste ortogonal de reta (PCA) e Polilinha Simplificada (RDP) reportam RMS (mm) e Desvio Máx (mm)", () => {
    const linePts = [
      { x: 0, y: 10.02 },
      { x: 25, y: 9.97 },
      { x: 50, y: 10.04 },
      { x: 75, y: 9.98 },
      { x: 100, y: 10.01 },
    ];
    const lineFit = fitOrthogonalLine(linePts);
    expect(lineFit.lengthMm).toBeCloseTo(100, 1);
    expect(lineFit.rmsMm).toBeLessThan(0.05);
    expect(lineFit.maxDeviationMm).toBeLessThan(0.06);

    const cand = buildFittedCandidate(linePts, "line", 0.5, false, "corte");
    expect(cand.infoStatus).toBe("AJUSTADO");
    expect(cand.entityPreview.type).toBe("line");

    const polyFit = fitSimplifiedPolyline(linePts, 0.2, false);
    expect(polyFit.simplifiedPts).toHaveLength(2);
    expect(polyFit.maxDeviationMm).toBeLessThan(0.06);
  });

  it("Sincronização do Caderno de Medições calcula discrepância nominal x medido e Camadas de Referência nunca vão para Corte CNC", () => {
    const entities = [
      { id: "hole-1", type: "circle" as const, layer: "corte", cx: 50, cy: 50, r: 10 }, // Nominal Ø 20.0 mm
    ];
    const records = [
      {
        id: "m-1",
        code: "M01",
        label: "Furo central medido no paquímetro",
        kind: "diametro" as const,
        valueMmOrDeg: 20.4,
        unit: "mm" as const,
        uncertaintyMmOrDeg: 0.05,
        instrument: "paquimetro" as const,
        infoStatus: "MEDIDO" as const,
        linkedEntityId: "hole-1",
        createdAt: Date.now(),
      },
    ];

    const synced = syncMeasurementsWithEntities(records, entities);
    expect(synced[0]!.drawnNominalValue).toBeCloseTo(20.0, 3);
    expect(synced[0]!.discrepancyMm).toBeCloseTo(0.4, 3);

    // Verifica que camadas de engenharia reversa de referência nunca são exportadas para corte CNC
    const laserProfile = profileById(LASER_PROFILE_ID);
    const refRole1 = roleOf({ id: "e1", type: "point", layer: "ref_pontos_medidos", x: 0, y: 0 });
    const refRole2 = roleOf({ id: "e2", type: "line", layer: "ref_hipoteses", x1: 0, y1: 0, x2: 10, y2: 10 });
    const cutRole = roleOf({ id: "e3", type: "circle", layer: "corte_interno_furos", cx: 0, cy: 0, r: 5 });

    expect(refRole1).toBe("REFERENCE");
    expect(refRole2).toBe("REFERENCE");
    expect(cutRole).toBe("CUT");
    expect(laserProfile.layerMap[refRole1!]).toBeNull();
    expect(laserProfile.layerMap[cutRole!]).toBe("CUT");

    // Sanitização e Folha de Calibração SVG
    const sanitized = sanitizeRevEngPlanData({ activeWizardStep: "C", measurements: records });
    expect(sanitized.activeWizardStep).toBe("C");
    expect(sanitized.measurements).toHaveLength(1);
    expect(Object.keys(REV_ENG_STATUS_META).length).toBeGreaterThanOrEqual(6);

    const sheet = generateCalibrationSheetSvg();
    expect(sheet.svgContent).toContain("170.0");
    expect(sheet.svgContent).toContain("100.0 MM");

    const cal2 = calibrateByTwoPoints({ x: 0, y: 0 }, { x: 500, y: 0 }, 100, "horizontal");
    expect(cal2.mmPerPx).toBeCloseTo(0.2, 5);

    const calDpi = calibrateByScannerDpi(300, 100, 1181.1);
    expect(calDpi.mmPerPx).toBeCloseTo(25.4 / 300, 5);
    expect(calDpi.rmsErrorMm).toBeLessThan(0.05);
    expect(createDefaultRevEngPlanData().version).toBe(1);
  });
});
