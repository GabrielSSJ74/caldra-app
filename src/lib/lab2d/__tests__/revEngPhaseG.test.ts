import { describe, expect, it } from "vitest";
import { optimize, rectPolyline, verify, type Entity } from "../core";
import { makeDimension } from "../dimensions";
import { sanitizeProject, type Project } from "../projects";
import { CadSemanticIntentEngine } from "../cadSemanticIntent";
import {
  computeBendDevelopmentKFactor,
  executeRevEngTypedCommand,
  exportRevEngSelectiveManufacturing,
  generateRevEngTechnicalDossier,
  parseAndExecuteRevEngIntent,
} from "../revEngClosure";
import { createDefaultRevEngPlanData } from "../revEngTypes";

describe("FASE G — Caldeiraria (Fator K), Exportação Seletiva, Dossiê, Persistência (T19), CHAMFER INTENT (T21) e Regressão (T22)", () => {
  it("Seção 11.3 & 11.5: calcula desenvolvimento de dobra por Fator K e exporta DXF seletivo excluindo camadas auxiliares por padrão", () => {
    const bend = computeBendDevelopmentKFactor({
      thicknessMm: 2.0,
      innerRadiusMm: 2.0,
      bendAngleDeg: 90,
      kFactor: 0.44,
      flange1OuterMm: 50,
      flange2OuterMm: 40,
      stripWidthMm: 30,
      has3DTransitionConeOrReduction: true,
    });

    // R_n = 2 + 0.44 * 2 = 2.88 mm
    expect(bend.neutralRadiusMm).toBeCloseTo(2.88, 6);
    // BA = (pi/2) * 2.88 = 4.5238934 mm
    expect(bend.bendAllowanceMm).toBeCloseTo((Math.PI * 0.5) * 2.88, 5);
    // OSSB = tan(45°) * (2 + 2) = 4.00 mm
    expect(bend.outsideSetbackMm).toBeCloseTo(4.0, 6);
    // BD = 2*4 - BA = 3.4761066 mm
    expect(bend.bendDeductionMm).toBeCloseTo(8.0 - (Math.PI * 0.5) * 2.88, 5);
    // L_plano = 50 + 40 - BD = 86.5238934 mm
    expect(bend.developedFlatLengthMm).toBeCloseTo(90 - bend.bendDeductionMm, 5);
    expect(bend.transition3DWarningPtBr).toContain("AVISO DE TRANSIÇÃO 3D");
    expect(bend.entities.length).toBe(2);

    // Adicionar entidades auxiliares de engenharia reversa (que NUNCA devem ir para o CNC por padrão)
    const auxEntities: Entity[] = [
      {
        id: "aux-construction",
        type: "line",
        layer: "construcao",
        isConstruction: true,
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 100,
      },
      {
        id: "aux-hypothesis",
        type: "circle",
        layer: "corte",
        cx: 20,
        cy: 15,
        r: 5,
        params: { infoStatus: "HIPOTESE" },
      },
      {
        id: "aux-stl-slice",
        type: "polyline",
        layer: "referencia",
        closed: true,
        pts: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        params: { infoStatus: "ESTIMADO", featureKind: "stl_mesh_slice" },
      },
    ];

    const exportClean = exportRevEngSelectiveManufacturing([
      ...bend.entities,
      ...auxEntities,
    ]);

    expect(exportClean.cutCount).toBe(1);
    expect(exportClean.bendCount).toBe(1);
    expect(exportClean.excludedAuxiliaryCount).toBe(3);
    expect(exportClean.exportedEntities.length).toBe(2);
    expect(exportClean.dxfContent).toContain("CUT");
    expect(exportClean.dxfContent).toContain("BEND");
    expect(exportClean.dxfContent).not.toContain("REVENG_AUX");
    expect(exportClean.parametricLossWarningPtBr).toContain("AVISO DE EXPORTAÇÃO");
  });

  it("Seção 14.2: gera Dossiê Técnico Completo de Engenharia Reversa com dados reais da peça, incertezas e hipóteses aceitas", () => {
    const revEng = createDefaultRevEngPlanData();
    revEng.baseThicknessMm = 12;
    revEng.baseThicknessStatus = "MEDIDO";
    revEng.materialKey = "aco_carbono";
    revEng.weighedMassGrams = 815;
    revEng.referenceImages.push({
      id: "ref-frontal",
      name: "foto_bancada_superior.jpg",
      dataUrl: "data:image/png;base64,iVBORw0KGgo=",
      viewTag: "superior",
      x: 0,
      y: 0,
      scaleMmPerPx: 0.125,
      rotationDeg: 0,
      opacity: 0.65,
      contrast: 1,
      brightness: 1,
      grayscale: false,
      invert: false,
      locked: true,
      visible: true,
      calibrationMode: "homography_4pt",
      calibrationPairs: [],
      calibrationStatus: "CALCULADO",
      calibrationErrorMm: 0.08,
    } as unknown as (typeof revEng.referenceImages)[number]);
    revEng.measurements.push({
      id: "m1",
      code: "M1",
      label: "Distância centro a centro C1-C2",
      kind: "centro_a_centro",
      valueMmOrDeg: 132.4,
      unit: "mm",
      uncertaintyMmOrDeg: 0.1,
      instrument: "paquimetro",
      infoStatus: "MEDIDO",
      linkedEntityId: "c1",
    });
    revEng.regions25D = [
      {
        id: "reg-cavity-unknown",
        entityId: "cavity-missing",
        label: "Alojamento Traseiro Oculto",
        kind: "alojamento",
        depthMm: null,
        depthStatus: "DESCONHECIDO",
        remainingBottomMm: null,
        areaMm2: 400,
      },
    ];

    const entities: Entity[] = [
      {
        id: "outer",
        type: "polyline",
        layer: "corte",
        closed: true,
        pts: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 80 },
          { x: 0, y: 80 },
        ],
        params: {
          infoStatus: "CONFIRMADO",
          acceptedHypothesisNote: "Simetria longitudinal aceita pelo usuário",
        },
      },
      {
        id: "c1",
        type: "circle",
        layer: "corte",
        cx: 0,
        cy: 0,
        r: 10,
        params: { infoStatus: "MEDIDO" },
      },
      {
        id: "c2",
        type: "circle",
        layer: "corte",
        cx: 132.4,
        cy: 0,
        r: 15,
        params: { infoStatus: "MEDIDO" },
      },
    ];

    const dossier = generateRevEngTechnicalDossier({
      partName: "Suporte Articulado M12",
      entities,
      revEng,
    });

    expect(dossier.partName).toBe("Suporte Articulado M12");
    expect(dossier.canConvertTo3D).toBe(false); // bloqueado pela região DESCONHECIDA
    expect(dossier.unknownDimensionsAndGaps.length).toBeGreaterThanOrEqual(1);
    expect(dossier.acceptedHypotheses.some((h) => h.includes("Simetria longitudinal"))).toBe(
      true,
    );
    expect(dossier.measurementsLog.length).toBe(1);
    expect(dossier.measurementsLog[0]!.code).toBe("M1");
    expect(dossier.markdownReport).toContain("# DOSSIÊ TÉCNICO DE ENGENHARIA REVERSA");
    expect(dossier.markdownReport).toContain("Suporte Articulado M12");
    expect(dossier.markdownReport).toContain("Simetria longitudinal aceita pelo usuário");
  });

  it("Teste T19 — Persistência e Retrocompatibilidade: preserva integralmente dados de Engenharia Reversa e abre projetos antigos sem erro", () => {
    const revEngData = createDefaultRevEngPlanData();
    revEngData.projectionDihedral = "3_diedro";
    revEngData.baseThicknessMm = 9.5;
    revEngData.baseThicknessStatus = "MEDIDO";
    revEngData.materialKey = "aluminio";
    revEngData.weighedMassGrams = 340.5;
    revEngData.closingToleranceMm = 1.75;
    revEngData.fabricationToleranceMm = 0.12;
    revEngData.showConfidenceMap = true;
    revEngData.id1CardWidthPx = 345;
    revEngData.measurements.push({
      id: "m-persisted",
      code: "M1",
      label: "Furo Central",
      kind: "diametro",
      valueMmOrDeg: 25.0,
      unit: "mm",
      uncertaintyMmOrDeg: 0.05,
      instrument: "paquimetro",
      infoStatus: "MEDIDO",
      linkedEntityId: "furo-1",
    });
    revEngData.capturedPoints.push({
      id: "pt-1",
      x: 12.5,
      y: 34.2,
      source: "calibrated_image",
      uncertaintyMm: 0.1,
    });
    revEngData.constraints = [
      {
        id: "cstr-1",
        kind: "fixed_distance",
        entityIds: ["furo-1", "furo-2"],
        targetValue: 80,
      },
    ];

    const fullProject: Project = {
      id: "proj-t19-new",
      name: "Projeto com Engenharia Reversa T19",
      kind: "sketch2d",
      createdAt: 1700000000000,
      updatedAt: 1700000050000,
      units: "mm",
      material: "Alumínio",
      thicknessMm: 9.5,
      plans: [
        {
          id: "plan-1",
          name: "P01",
          plane: "XY",
          thicknessMm: 9.5,
          offsetMm: 0,
          origin2d: { x: 0, y: 0 },
          entities: [
            {
              id: "furo-1",
              type: "circle",
              layer: "corte",
              cx: 0,
              cy: 0,
              r: 12.5,
              params: { infoStatus: "MEDIDO" },
            },
          ],
          revEng: revEngData,
        },
      ],
    };

    // Serializar em JSON e restaurar via sanitizeProject
    const rawJson = JSON.stringify(fullProject);
    const restored = sanitizeProject(JSON.parse(rawJson) as Project);

    const restoredRevEng = restored.plans[0]!.revEng;
    expect(restoredRevEng).toBeDefined();
    expect(restoredRevEng!.projectionDihedral).toBe("3_diedro");
    expect(restoredRevEng!.baseThicknessMm).toBeCloseTo(9.5, 5);
    expect(restoredRevEng!.materialKey).toBe("aluminio");
    expect(restoredRevEng!.weighedMassGrams).toBeCloseTo(340.5, 5);
    expect(restoredRevEng!.closingToleranceMm).toBeCloseTo(1.75, 5);
    expect(restoredRevEng!.fabricationToleranceMm).toBeCloseTo(0.12, 5);
    expect(restoredRevEng!.showConfidenceMap).toBe(true);
    expect(restoredRevEng!.id1CardWidthPx).toBe(345);
    expect(restoredRevEng!.measurements.length).toBe(1);
    expect(restoredRevEng!.measurements[0]!.valueMmOrDeg).toBeCloseTo(25.0, 5);
    expect(restoredRevEng!.capturedPoints.length).toBe(1);
    expect(restoredRevEng!.constraints?.length).toBe(1);

    // Retrocompatibilidade: abrir projeto antigo que NÃO possui o campo `revEng`
    const legacyProjectJson = JSON.stringify({
      id: "proj-legacy-old",
      name: "Projeto Antigo Sem RevEng",
      kind: "sketch2d",
      createdAt: 1680000000000,
      updatedAt: 1680000000000,
      units: "mm",
      material: "Aço Carbono",
      thicknessMm: 3,
      plans: [
        {
          id: "plan-old",
          name: "P01",
          plane: "XY",
          thicknessMm: 3,
          offsetMm: 0,
          origin2d: { x: 0, y: 0 },
          entities: [rectPolyline({ x: 0, y: 0 }, { x: 120, y: 60 }, "corte")],
        },
      ],
    });

    const restoredLegacy = sanitizeProject(JSON.parse(legacyProjectJson) as Project);
    expect(restoredLegacy.id).toBe("proj-legacy-old");
    expect(restoredLegacy.plans[0]!.entities.length).toBe(1);
    expect(restoredLegacy.plans[0]!.revEng).toBeUndefined();
  });

  it("Teste T21 — Integração CHAMFER INTENT: executa comando completo pelo validador tipado e pede esclarecimento em comando ambíguo", () => {
    const promptComplete =
      "Crie um olhal R20 no furo Ø20 e ligue com ponte côncava R120 ao olhal R35 do furo Ø30 a 132,4 mm";

    const res = parseAndExecuteRevEngIntent(promptComplete);
    expect(res.status).toBe("ok");
    // 2 furos internos + 2 olhais externos + 1 arco de ponte côncava R120 = 5 entidades
    expect(res.entities.length).toBe(5);

    const bridgeArc = res.entities.find(
      (e) => e.type === "arc" && e.params?.featureKind === "tangent_bridge_arc",
    );
    expect(bridgeArc).toBeDefined();
    if (bridgeArc && bridgeArc.type === "arc") {
      // Mesma geometria exata da Fase C (Teste T9): Centro = (49,489; 130,961)
      expect(bridgeArc.r).toBeCloseTo(120, 6);
      expect(bridgeArc.cx).toBeCloseTo(49.489, 2);
      expect(bridgeArc.cy).toBeCloseTo(130.961, 2);
      expect(bridgeArc.params?.t1X).toBeCloseTo(7.07, 2);
      expect(bridgeArc.params?.t1Y).toBeCloseTo(18.709, 2);
      expect(bridgeArc.params?.t2X).toBeCloseTo(113.678, 2);
      expect(bridgeArc.params?.t2Y).toBeCloseTo(29.572, 2);

      // Erro de tangência < 10^-6 mm em relação a O1(0,0,R20) e O2(132.4,0,R35)
      const distToO1 = Math.hypot(bridgeArc.cx - 0, bridgeArc.cy - 0);
      const distToO2 = Math.hypot(bridgeArc.cx - 132.4, bridgeArc.cy - 0);
      expect(Math.abs(distToO1 - (20 + 120))).toBeLessThan(1e-6);
      expect(Math.abs(distToO2 - (35 + 120))).toBeLessThan(1e-6);
    }

    // Verificar integração também via CadSemanticIntentEngine.parseIntent
    const semanticTask = CadSemanticIntentEngine.parseIntent(promptComplete);
    expect(semanticTask).not.toBeNull();
    expect(semanticTask!.isAmbiguous).toBe(false);
    expect(semanticTask!.generatedEntities.length).toBe(5);

    // Comando ambíguo (sem raios dos olhais nem distância): deve retornar needs_clarification sem inventar parâmetros
    const ambiguousPrompt = "Crie um olhal no furo e ligue com uma ponte côncava";
    const ambRes = parseAndExecuteRevEngIntent(ambiguousPrompt);
    expect(ambRes.status).toBe("needs_clarification");
    expect(ambRes.entities.length).toBe(0);
    expect(ambRes.clarificationQuestionPtBr).toBeTruthy();

    const semanticAmbiguous = CadSemanticIntentEngine.parseIntent(ambiguousPrompt);
    expect(semanticAmbiguous).not.toBeNull();
    expect(semanticAmbiguous!.isAmbiguous).toBe(true);
    expect(semanticAmbiguous!.clarificationNeeded).toBeTruthy();

    // Testar também despacho direto dos comandos tipados (Seção 15.1)
    const chordCmd = executeRevEngTypedCommand({
      type: "radius_from_chord_sagitta",
      chordMm: 80,
      sagittaMm: 10,
    });
    expect(chordCmd.status).toBe("ok");
    expect(chordCmd.entities[0]?.type).toBe("arc");
    if (chordCmd.entities[0]?.type === "arc") {
      expect(chordCmd.entities[0].r).toBeCloseTo(85.0, 5);
    }
  });

  it("Teste T22 — Regressão e Contenção de Escopo: ferramentas existentes do CHAMFER CAD permanecem 100% operacionais", () => {
    // 1. Criação de chapa retangular padrão
    const rect = rectPolyline({ x: 0, y: 0 }, { x: 200, y: 100 }, "corte");
    expect(rect.type).toBe("polyline");
    expect(rect.closed).toBe(true);
    expect(rect.pts.length).toBe(4);

    // 2. Criação de cota linear padrão
    const dim = makeDimension(
      "horizontal",
      [
        { kind: "point", p: { x: 0, y: 0 } },
        { kind: "point", p: { x: 200, y: 0 } },
      ],
      20,
      { suffix: " mm" },
    );
    expect(dim.kind).toBe("horizontal");
    expect(dim.offset).toBe(20);

    // 3. Verificação e otimização CAD padrão (core.ts)
    const hole: Entity = {
      id: "hole-center",
      type: "circle",
      layer: "corte",
      cx: 100,
      cy: 50,
      r: 15,
    };
    const issues = verify([rect, hole]);
    expect(issues.length).toBe(0);

    const opt = optimize([rect, hole]);
    expect(opt.entities.length).toBe(2);
    expect(opt.removed).toBe(0);

    // 4. CHAMFER INTENT tradicional para chapa furada
    const plateIntent = CadSemanticIntentEngine.parseIntent(
      "chapa retangular 200x100 com 4 furos de 12mm",
    );
    expect(plateIntent).not.toBeNull();
    expect(plateIntent!.isAmbiguous).toBe(false);
    expect(plateIntent!.generatedEntities.length).toBeGreaterThanOrEqual(5);
  });
});
