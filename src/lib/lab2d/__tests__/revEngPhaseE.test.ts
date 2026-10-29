import { describe, expect, it } from "vitest";
import type { Entity } from "../core";
import type {
  RevEngCrossViewLink,
  RevEngGeometricConstraint,
  RevEngRegion25D,
} from "../revEngTypes";
import {
  compute25DVolumeAndMass,
  computeTechnicalSectionAA,
  evaluate25DConversionReadiness,
  evaluateConstraintSystemDOFAndConflicts,
  evaluateCrossViewConsistency,
  generateSectionAACadEntities,
  generateSyntheticCylinderStlAscii,
  parseStlAsciiMesh,
  sliceStlMeshByPlaneZ,
  syncRegions25DFromEntities,
} from "../revEng25D";

describe("FASE E — Vistas Vinculadas, Mapa 2.5D, Corte Técnico A-A, Restrições (T16) e Malha STL (T20)", () => {
  it("T12 — Calcula área, volume líquido, massa (Alumínio/Aço), balança e Corte Técnico A-A com hachura 45°", () => {
    // Chapa 100 × 50 mm (5000 mm²), espessura H = 10 mm (V_bruto = 50.000 mm³)
    // Rebaixo cego 50 × 40 mm (2000 mm²), profundidade h_p = 4 mm (ΔV = -8.000 mm³, fundo = 6 mm)
    // 2 furos passantes Ø10 mm (r = 5 mm, A = 2 * 25π = 157,0796 mm², ΔV = -1570,7963 mm³)
    const entities: Entity[] = [
      {
        id: "plate-outer",
        type: "polyline",
        layer: "corte",
        closed: true,
        pts: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 50 },
          { x: 0, y: 50 },
        ],
      },
      {
        id: "pocket-blind",
        type: "polyline",
        layer: "recorte",
        closed: true,
        pts: [
          { x: 25, y: 5 },
          { x: 75, y: 5 },
          { x: 75, y: 45 },
          { x: 25, y: 45 },
        ],
      },
      {
        id: "hole-left",
        type: "circle",
        layer: "corte",
        cx: 12,
        cy: 25,
        r: 5,
      },
      {
        id: "hole-right",
        type: "circle",
        layer: "corte",
        cx: 88,
        cy: 25,
        r: 5,
      },
    ];

    const synced = syncRegions25DFromEntities({
      entities,
      baseThicknessMm: 10,
      baseThicknessStatus: "MEDIDO",
    });

    // Garantir que o rebaixo cego tenha h_p = 4 mm
    const regions: RevEngRegion25D[] = synced.map((r) =>
      r.entityId === "pocket-blind"
        ? { ...r, regionKind: "rebaixo_cego", depthMm: 4, depthStatus: "MEDIDO" }
        : r,
    );

    const massAlu = compute25DVolumeAndMass({
      regions,
      baseThicknessMm: 10,
      materialKey: "aluminio_6061",
      weighedMassGrams: 109.0,
    });

    expect(massAlu.baseAreaMm2).toBeCloseTo(5000, 3);
    expect(massAlu.grossVolumeMm3).toBeCloseTo(50000, 3);
    expect(massAlu.blindRemovedVolumeMm3).toBeCloseTo(8000, 3);
    expect(massAlu.throughRemovedVolumeMm3).toBeCloseTo(2 * Math.PI * 25 * 10, 3);

    const expectedNetVolMm3 = 50000 - 8000 - 500 * Math.PI; // ~40429.20367 mm³
    expect(massAlu.netVolumeMm3).toBeCloseTo(expectedNetVolMm3, 2);
    expect(massAlu.netVolumeCm3).toBeCloseTo(expectedNetVolMm3 / 1000, 4);

    // Alumínio 2.70 g/cm³ -> ~109.1588 g
    expect(massAlu.estimatedMassGrams).toBeCloseTo((expectedNetVolMm3 / 1000) * 2.7, 2);
    expect(massAlu.scaleCheckCompatible).toBe(true);

    // Aço Carbono 7.85 g/cm³ -> ~317.369 g
    const massSteel = compute25DVolumeAndMass({
      regions,
      baseThicknessMm: 10,
      materialKey: "aco_carbono",
    });
    expect(massSteel.estimatedMassGrams).toBeCloseTo((expectedNetVolMm3 / 1000) * 7.85, 2);

    // Corte Técnico A–A passando pela linha média Y = 25 mm (atravessa os 2 furos Ø10 e o rebaixo cego)
    const sectionAA = computeTechnicalSectionAA({
      entities,
      regions,
      baseThicknessMm: 10,
      sectionLine: {
        id: "sec-aa",
        label: "A",
        p1: { x: -10, y: 25 },
        p2: { x: 110, y: 25 },
        sightDirection: "up",
        enabled: true,
      },
    });

    expect(sectionAA.partIntersectedWidthMm).toBeCloseTo(100, 3);
    expect(sectionAA.holeAxes).toHaveLength(2);

    const blindInterval = sectionAA.intervals.find((i) => i.state === "rebaixo_cego");
    expect(blindInterval).toBeDefined();
    expect(blindInterval!.solidHeightMm).toBeCloseTo(6, 3); // H - h_p = 10 - 4 = 6 mm
    expect(blindInterval!.lengthMm).toBeCloseTo(50, 3); // x de 25 a 75 mm

    const throughIntervals = sectionAA.intervals.filter((i) => i.state === "furo_passante");
    expect(throughIntervals).toHaveLength(2);
    expect(throughIntervals[0]!.solidHeightMm).toBe(0);
    expect(throughIntervals[0]!.lengthMm).toBeCloseTo(10, 3);

    // Gerar entidades CAD da vista de Corte A–A
    const cadEntities = generateSectionAACadEntities({
      sectionResult: sectionAA,
      placementOrigin: { x: 0, y: 80 },
      hatchPitchMm: 4,
    });
    expect(cadEntities.length).toBeGreaterThan(10);
    expect(cadEntities.some((e) => e.params?.featureKind === "section_aa_hatch_45")).toBe(true);
    expect(cadEntities.some((e) => e.params?.featureKind === "section_aa_hole_axis")).toBe(true);
  });

  it("T14 — Vistas vinculadas detectam inconsistência de largura e profundidade DESCONHECIDA bloqueia conversão 3D", () => {
    const links: RevEngCrossViewLink[] = [
      {
        id: "link-width",
        label: "Largura Total Frontal × Lateral",
        dimensionKind: "largura_x",
        viewA: "frontal",
        valueAMm: 120.0,
        viewB: "lateral",
        valueBMm: 117.4,
        toleranceMm: 0.3,
        infoStatus: "MEDIDO",
      },
      {
        id: "link-height",
        label: "Espessura Frontal × Lateral",
        dimensionKind: "espessura_z",
        viewA: "frontal",
        valueAMm: 12.0,
        viewB: "lateral",
        valueBMm: 12.1,
        toleranceMm: 0.25,
        infoStatus: "MEDIDO",
      },
    ];

    const viewReport = evaluateCrossViewConsistency({
      links,
      projectionDihedral: "1_diedro",
    });

    expect(viewReport.status).toBe("inconsistente");
    expect(viewReport.inconsistentCount).toBe(1);
    expect(viewReport.maxDiscrepancyMm).toBeCloseTo(2.6, 4);

    // Verificar bloqueio 3D quando uma cavidade tem profundidade DESCONHECIDA
    const regionsUnknown: RevEngRegion25D[] = [
      {
        id: "r-base",
        entityId: "e-base",
        label: "Contorno Base",
        regionKind: "corpo_base",
        depthMm: 12,
        depthStatus: "MEDIDO",
        zStartMm: 0,
        areaMm2: 6000,
      },
      {
        id: "r-pocket-unknown",
        entityId: "e-pocket",
        label: "Alojamento Interno Sem Medida",
        regionKind: "rebaixo_cego",
        depthMm: null,
        depthStatus: "DESCONHECIDO",
        zStartMm: 0,
        areaMm2: 1200,
      },
    ];

    const blockedReport = evaluate25DConversionReadiness({
      regions: regionsUnknown,
      baseThicknessMm: 12,
      baseThicknessStatus: "MEDIDO",
    });

    expect(blockedReport.canConvertTo3D).toBe(false);
    expect(blockedReport.pendingUnknownRegionIds).toContain("r-pocket-unknown");
    expect(blockedReport.blockingMessages[0]).toContain("DESCONHECIDA");

    // Quando a profundidade é medida (ex.: 5 mm), a conversão 3D é liberada
    const regionsKnown: RevEngRegion25D[] = regionsUnknown.map((r) =>
      r.id === "r-pocket-unknown" ? { ...r, depthMm: 5, depthStatus: "MEDIDO" } : r,
    );
    const readyReport = evaluate25DConversionReadiness({
      regions: regionsKnown,
      baseThicknessMm: 12,
      baseThicknessStatus: "MEDIDO",
    });
    expect(readyReport.canConvertTo3D).toBe(true);
    expect(readyReport.blockingMessages).toHaveLength(0);

    // Se a profundidade cega exceder a espessura H (ex.: h_p = 14 mm > H = 12 mm), bloqueia por ruptura de fundo
    const regionsBreach: RevEngRegion25D[] = regionsUnknown.map((r) =>
      r.id === "r-pocket-unknown" ? { ...r, depthMm: 14, depthStatus: "MEDIDO" } : r,
    );
    const breachReport = evaluate25DConversionReadiness({
      regions: regionsBreach,
      baseThicknessMm: 12,
      baseThicknessStatus: "MEDIDO",
    });
    expect(breachReport.canConvertTo3D).toBe(false);
    expect(breachReport.conflictsAndWarnings.some((c) => c.code === "RUPTURA_FUNDO_CEGO")).toBe(
      true,
    );
  });

  it("T16 — Restrições incompatíveis geram aviso de conflito com relações envolvidas sem deslocamento silencioso", () => {
    const lineEntity: Entity = {
      id: "line-1",
      type: "line",
      layer: "corte",
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
      params: { infoStatus: "MEDIDO", lockedByMeasurement: true },
    };

    const holeEntity: Entity = {
      id: "hole-locked",
      type: "circle",
      layer: "corte",
      cx: 50,
      cy: 25,
      r: 10, // Ø20 mm MEDIDO
      params: { infoStatus: "MEDIDO", lockedByMeasurement: true },
    };

    const constraints: RevEngGeometricConstraint[] = [
      {
        id: "c-horiz",
        kind: "horizontal",
        entityIds: ["line-1"],
        infoStatus: "MEDIDO",
      },
      {
        id: "c-vert-conflict",
        kind: "vertical",
        entityIds: ["line-1"],
        infoStatus: "HIPOTESE",
      },
      {
        id: "c-diam-conflict",
        kind: "diametro",
        entityIds: ["hole-locked"],
        targetValueMmOrDeg: 26, // Conflita com Ø20 mm MEDIDO travado
        toleranceMmOrDeg: 0.1,
        infoStatus: "HIPOTESE",
      },
    ];

    const audit = evaluateConstraintSystemDOFAndConflicts({
      entities: [lineEntity, holeEntity],
      constraints,
    });

    expect(audit.systemState).toBe("sobredeterminado_conflito");
    expect(audit.conflicts.length).toBeGreaterThanOrEqual(2);
    expect(
      audit.conflicts.some(
        (c) =>
          c.conflictKind === "ORIENTACAO_CONTRADITORIA" &&
          c.involvedConstraintIds.includes("c-horiz") &&
          c.involvedConstraintIds.includes("c-vert-conflict"),
      ),
    ).toBe(true);
    expect(
      audit.conflicts.some((c) => c.conflictKind === "CONFLITO_COM_ENTIDADE_MEDIDA_TRAVADA"),
    ).toBe(true);

    // Garantir que nenhuma coordenada original das entidades foi alterada silenciosamente
    expect(lineEntity.x2).toBe(100);
    expect(lineEntity.y2).toBe(0);
    expect(holeEntity.r).toBe(10);
  });

  it("T20 — Malha STL de cilindro Ø40 mm fatiada por plano Z gera seção circular Ø40 marcada como ESTIMADO", () => {
    const stlText = generateSyntheticCylinderStlAscii({
      diameterMm: 40,
      heightMm: 30,
      cx: 15,
      cy: -10,
      radialSegments: 96,
    });

    const mesh = parseStlAsciiMesh(stlText);
    expect(mesh.triangles.length).toBe(192);
    expect(mesh.decimated).toBe(false);

    const slice = sliceStlMeshByPlaneZ({
      triangles: mesh.triangles,
      zPlaneMm: 12.5,
      weldToleranceMm: 0.05,
    });

    expect(slice.infoStatus).toBe("ESTIMADO");
    expect(slice.loops.length).toBeGreaterThanOrEqual(1);
    expect(slice.estimatedCircle).not.toBeNull();
    expect(slice.estimatedCircle!.cx).toBeCloseTo(15, 2);
    expect(slice.estimatedCircle!.cy).toBeCloseTo(-10, 2);
    expect(slice.estimatedCircle!.diameterMm).toBeCloseTo(40.0, 2);
    expect(slice.estimatedCircle!.rmsErrorMm).toBeLessThan(0.02);
    expect(slice.entities[0]!.params?.infoStatus).toBe("ESTIMADO");
  });
});
