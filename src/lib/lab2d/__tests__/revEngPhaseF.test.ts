import { describe, expect, it } from "vitest";
import type { Entity } from "../core";
import type { CapturedContourPoint, MeasurementRecord } from "../revEngTypes";
import {
  applyControlledErrorFix,
  computeRealSizeOnScreenById1Card,
  detectRevEngGeometryErrors,
  evaluateConfidenceMap,
  evaluateRevEngComparator,
  generatePrintProof1to1Svg,
  ID1_CARD_WIDTH_MM,
} from "../revEngVerification";

describe("FASE F — Detector de Erros (T15), Comparador (T12/T17), Prova 1:1 (T18) e Mapa de Confiança", () => {
  it("T15 — Detecta lacuna pequena em contorno aberto sem fechar em silêncio e aplica correção controlada reversível por Undo", () => {
    const openContour: Entity = {
      id: "poly-open-t15",
      type: "polyline",
      layer: "corte",
      closed: false,
      pts: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 60 },
        { x: 0, y: 60 },
        { x: 0, y: 0.75 }, // Lacuna de 0,75 mm do ponto inicial (0,0)
      ],
    };

    const dupLineA: Entity = {
      id: "ln-dup-1",
      type: "line",
      layer: "corte",
      x1: 10,
      y1: 10,
      x2: 50,
      y2: 10,
    };

    const dupLineB: Entity = {
      id: "ln-dup-2",
      type: "line",
      layer: "corte",
      x1: 10,
      y1: 10.02,
      x2: 50,
      y2: 9.99,
    };

    const initialEntities: Entity[] = [openContour, dupLineA, dupLineB];

    const audit = detectRevEngGeometryErrors({
      entities: initialEntities,
      closingToleranceMm: 2.0,
      fabricationToleranceMm: 0.15,
    });

    // Tolerâncias de fechamento e fabricação são distintas e preservadas
    expect(audit.closingToleranceMm).toBe(2.0);
    expect(audit.fabricationToleranceMm).toBe(0.15);

    const openErr = audit.items.find(
      (i) => i.kind === "CONTORNO_ABERTO_LACUNA" && i.involvedEntityIds.includes("poly-open-t15"),
    );
    expect(openErr).toBeDefined();
    expect(openErr!.gapOrDiscrepancyMm).toBeCloseTo(0.75, 4);
    expect(openErr!.canApplySafeFix).toBe(true);

    // Garantir que o detector NÃO fechou a polilinha automaticamente em silêncio
    expect((initialEntities[0] as Extract<Entity, { type: "polyline" }>).closed).toBe(false);

    // Aplicar correção controlada explícita
    const fixRes = applyControlledErrorFix({
      entities: initialEntities,
      errorItem: openErr!,
    });

    expect(fixRes.applied).toBe(true);
    const fixedPoly = fixRes.nextEntities.find((e) => e.id === "poly-open-t15") as Extract<
      Entity,
      { type: "polyline" }
    >;
    expect(fixedPoly.closed).toBe(true);

    // Verificar Undo: a lista original `initialEntities` permanece intacta com closed === false
    expect((initialEntities[0] as Extract<Entity, { type: "polyline" }>).closed).toBe(false);

    // Verificar detecção e remoção controlada de segmento duplicado
    const dupErr = audit.items.find((i) => i.kind === "SEGMENTO_DUPLICADO");
    expect(dupErr).toBeDefined();
    const dupFix = applyControlledErrorFix({
      entities: fixRes.nextEntities,
      errorItem: dupErr!,
    });
    expect(dupFix.applied).toBe(true);
    expect(dupFix.nextEntities).toHaveLength(2);
  });

  it("T12 & T17 — Comparador avalia tabela medido × desenhado × diferença e desvio máximo/médio/RMS de pontos medidos contra perfil irregular", () => {
    // Perfil reconstruído: contorno irregular fechado + 2 furos posicionados
    const entities: Entity[] = [
      {
        id: "irregular-profile",
        type: "polyline",
        layer: "corte",
        closed: true,
        pts: [
          { x: 0, y: 0 },
          { x: 120, y: 0 },
          { x: 140, y: 35 },
          { x: 110, y: 70 },
          { x: 0, y: 70 },
        ],
        params: { infoStatus: "AJUSTADO", fitRmsMm: 0.08 },
      },
      {
        id: "hole-a",
        type: "circle",
        layer: "corte",
        cx: 30,
        cy: 35,
        r: 10, // Ø20.00 mm
        params: { infoStatus: "MEDIDO" },
      },
      {
        id: "hole-b",
        type: "circle",
        layer: "corte",
        cx: 95,
        cy: 35,
        r: 12.5, // Ø25.00 mm
        params: { infoStatus: "MEDIDO" },
      },
    ];

    const measurements: MeasurementRecord[] = [
      {
        id: "m1",
        code: "M01",
        label: "Diâmetro Furo A",
        kind: "diametro",
        valueMmOrDeg: 20.0,
        unit: "mm",
        uncertaintyMmOrDeg: 0.05,
        instrument: "paquimetro",
        linkedEntityId: "hole-a",
        drawnNominalValue: 20.0,
        discrepancyMm: 0.0,
        infoStatus: "MEDIDO",
        createdAt: 1,
      },
      {
        id: "m2",
        code: "M02",
        label: "Diâmetro Furo B (Com Desgaste)",
        kind: "diametro",
        valueMmOrDeg: 24.6,
        unit: "mm",
        uncertaintyMmOrDeg: 0.05,
        instrument: "paquimetro",
        linkedEntityId: "hole-b",
        drawnNominalValue: 25.0,
        discrepancyMm: 0.4,
        infoStatus: "MEDIDO",
        createdAt: 2,
      },
    ];

    // Pontos capturados sobre o contorno com desvios conhecidos: 0.00 mm, 0.10 mm, 0.20 mm e um outlier de 0.60 mm
    const capturedPoints: CapturedContourPoint[] = [
      { id: "pt-1", x: 50, y: 0.0, source: "manual_touch", uncertaintyMm: 0.15 }, // dist = 0.00
      { id: "pt-2", x: 80, y: 0.1, source: "manual_touch", uncertaintyMm: 0.15 }, // dist = 0.10
      { id: "pt-3", x: 0.2, y: 35, source: "manual_touch", uncertaintyMm: 0.15 }, // dist = 0.20
      { id: "pt-worst", x: 60, y: 70.6, source: "manual_touch", uncertaintyMm: 0.15 }, // dist = 0.60 na borda superior y=70
    ];

    const comp = evaluateRevEngComparator({
      entities,
      measurements,
      capturedPoints,
      pointToleranceMm: 0.25,
    });

    expect(comp.compatibleMeasurementsCount).toBe(1);
    expect(comp.divergentMeasurementsCount).toBe(1);
    expect(comp.measurementRows[1]!.signedDiff).toBeCloseTo(0.4, 4);

    // Verificar métricas de distância ponto–geometria: [0, 0.1, 0.2, 0.6]
    // Média = (0 + 0.1 + 0.2 + 0.6) / 4 = 0.225 mm
    // RMS = sqrt((0 + 0.01 + 0.04 + 0.36) / 4) = sqrt(0.41 / 4) = sqrt(0.1025) ≈ 0.320156 mm
    expect(comp.pointCount).toBe(4);
    expect(comp.meanDeviationMm).toBeCloseTo(0.225, 4);
    expect(comp.rmsDeviationMm).toBeCloseTo(Math.sqrt(0.1025), 4);
    expect(comp.maxDeviationMm).toBeCloseTo(0.6, 4);
    expect(comp.worstPoint?.pointId).toBe("pt-worst");
    expect(comp.worstOutlierRegions).toHaveLength(1);
  });

  it("T18 — Prova 1:1 exporta SVG com barra de verificação de exatos 100,000 mm e cruzes de canto nas distâncias informadas", () => {
    const entities: Entity[] = [
      {
        id: "plate-1to1",
        type: "polyline",
        layer: "corte",
        closed: true,
        pts: [
          { x: 0, y: 0 },
          { x: 120, y: 0 },
          { x: 120, y: 60 },
          { x: 0, y: 60 },
        ],
      },
      {
        id: "hole-1to1",
        type: "circle",
        layer: "corte",
        cx: 60,
        cy: 30,
        r: 10,
      },
    ];

    const proof = generatePrintProof1to1Svg({
      entities,
      partTitle: "GABARITO TESTE T18",
      marginMm: 20,
    });

    // 1. A barra de 100 mm deve medir exatamente 100,000 mm nas coordenadas do arquivo exportado
    expect(proof.verificationBarLengthMm).toBe(100.0);
    expect(proof.verificationBarEnd.x - proof.verificationBarStart.x).toBeCloseTo(100.0, 6);
    expect(proof.svgContent).toContain('id="scale-bar-100mm-main"');
    expect(proof.svgContent).toContain('data-length-mm="100.000"');

    // Extrair x1 e x2 reais da linha #scale-bar-100mm-main no SVG gerado
    const matchBar = proof.svgContent.match(
      /id="scale-bar-100mm-main"\s+x1="([\d.]+)"\s+y1="([\d.]+)"\s+x2="([\d.]+)"\s+y2="([\d.]+)"/,
    );
    expect(matchBar).not.toBeNull();
    const x1Bar = parseFloat(matchBar![1]!);
    const x2Bar = parseFloat(matchBar![3]!);
    expect(x2Bar - x1Bar).toBeCloseTo(100.0, 5);

    // 2. As 4 cruzes de canto estão exatamente às distâncias ΔX e ΔY informadas
    const [cTL, cTR, cBR, cBL] = proof.cornerCrosses;
    expect(cTR.x - cTL.x).toBeCloseTo(proof.cornerCrossSpanXMm, 5);
    expect(cBL.y - cTL.y).toBeCloseTo(proof.cornerCrossSpanYMm, 5);
    expect(cBR.x - cBL.x).toBeCloseTo(proof.cornerCrossSpanXMm, 5);
    expect(proof.svgContent).toContain(`ΔX = ${proof.cornerCrossSpanXMm.toFixed(3)} mm`);
    expect(proof.svgContent).toContain(`ΔY = ${proof.cornerCrossSpanYMm.toFixed(3)} mm`);

    // 3. Calibração de tela por cartão ID-1 (85,60 mm)
    const id1Cal = computeRealSizeOnScreenById1Card(342.4); // 4.0 px/mm
    expect(id1Cal.pxPerMm).toBeCloseTo(342.4 / ID1_CARD_WIDTH_MM, 4);
    expect(id1Cal.safetyWarningPtBr).toContain("AVISO DE PROTEÇÃO DA TELA");
  });

  it("Seção 13.4 — Mapa de confiança classifica estados qualitativos reais sem porcentagens arbitrárias", () => {
    const entities: Entity[] = [
      {
        id: "e-medido",
        type: "circle",
        layer: "corte",
        cx: 20,
        cy: 20,
        r: 10,
        params: { infoStatus: "MEDIDO" },
      },
      {
        id: "e-calculado",
        type: "arc",
        layer: "corte",
        cx: 50,
        cy: 50,
        r: 120,
        startAngle: 0,
        endAngle: 1,
        params: { infoStatus: "CALCULADO" },
      },
      {
        id: "e-hipotese",
        type: "line",
        layer: "corte",
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 0,
        params: { infoStatus: "HIPOTESE" },
      },
    ];

    const map = evaluateConfidenceMap({
      entities,
      measurements: [],
    });

    expect(map.entries).toHaveLength(3);
    expect(map.countsByCategory.confirmado_medicao).toBe(1);
    expect(map.countsByCategory.calculado).toBe(1);
    expect(map.countsByCategory.provisorio).toBe(1);
    expect(map.allConfirmedOrCalculated).toBe(false);
  });
});
