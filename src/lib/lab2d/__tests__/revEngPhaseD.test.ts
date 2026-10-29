import { describe, expect, it } from "vitest";
import type { Entity } from "../core";
import {
  analyzeDesignIntentSuggestions,
  applyDesignIntentSuggestion,
  computeConstantWallPocket,
  detectHolePatternsPCD,
  estimateGearModuleFromMeasurement,
  evaluateVirtualRadiusGauge,
  generateLinearRackProfile,
  generateSpurGearProfile,
  regularizeBoltCirclePCD,
  rejectDesignIntentSuggestion,
} from "../revEngContourDetails";

describe("FASE D — Contorno, Intenção de Projeto, PCD, Auto-Pocket 2D e Engrenagens/Cremalheiras", () => {
  it("Seção 12: Sugestor de Intenção de Projeto sugere R80 para R=79.7 mm sem alterar em silêncio", () => {
    const measuredArc: Entity = {
      id: "arc-measured-1",
      type: "arc",
      layer: "corte",
      cx: 0,
      cy: 0,
      r: 79.7,
      a0: 0,
      a1: Math.PI / 2,
      params: { infoStatus: "AJUSTADO" },
    };

    const suggestions = analyzeDesignIntentSuggestions([measuredArc]);
    expect(suggestions.length).toBe(1);
    const sug = suggestions[0];
    expect(sug.kind).toBe("nominal_radius");
    expect(sug.suggestedNominalValue).toBe(80);
    expect(sug.deltaValue).toBeCloseTo(0.3, 3);
    expect(sug.infoStatus).toBe("HIPOTESE");

    // Garantir que a entidade original NÃO foi alterada pela análise
    expect(measuredArc.r).toBe(79.7);

    // Aceite explícito -> atualiza para R80.0 e marca NOMINAL_ACEITO
    const afterAccept = applyDesignIntentSuggestion([measuredArc], sug);
    const updatedArc = afterAccept[0] as Extract<Entity, { type: "arc" }>;
    expect(updatedArc.r).toBe(80.0);
    expect(updatedArc.params?.infoStatus).toBe("NOMINAL_ACEITO");

    // Rejeição explícita -> preserva R79.7 e marca MEDIDO, não sugerindo novamente
    const afterReject = rejectDesignIntentSuggestion([measuredArc], sug);
    const keptArc = afterReject[0] as Extract<Entity, { type: "arc" }>;
    expect(keptArc.r).toBe(79.7);
    expect(keptArc.params?.infoStatus).toBe("MEDIDO");
    expect(analyzeDesignIntentSuggestions(afterReject).length).toBe(0);
  });

  it("Seção 11.3: Gabarito de Raio Virtual avalia concordância entre 2 retas ortogonais ou pontos", () => {
    const l1: Extract<Entity, { type: "line" }> = {
      id: "l1",
      type: "line",
      layer: "corte",
      x1: 0,
      y1: 0,
      x2: 50,
      y2: 0,
    };
    const l2: Extract<Entity, { type: "line" }> = {
      id: "l2",
      type: "line",
      layer: "corte",
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 50,
    };

    const res = evaluateVirtualRadiusGauge({
      radiusMm: 12,
      mode: "concavo",
      cornerLines: [l1, l2],
    });
    expect(res.radiusMm).toBe(12);
    expect(res.center.x).toBeCloseTo(12, 4);
    expect(res.center.y).toBeCloseTo(12, 4);
    expect(res.entityPreview.type).toBe("arc");
  });

  it("Teste T10: Auto-Pocket 2D de Parede Constante gera cavidade fechada sem auto-interseção e respeita fresa 2*r_c", () => {
    // Contorno retangular 120 x 60 mm com 2 furos internos Ø20 em (25, 30) e (95, 30)
    const outerRect = [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 60 },
      { x: 0, y: 60 },
    ];
    const islands = [
      { id: "h1", cx: 25, cy: 30, r: 10 },
      { id: "h2", cx: 95, cy: 30, r: 10 },
    ];

    const pocket = computeConstantWallPocket({
      outerPolygon: outerRect,
      borderWallThicknessMm: 5.0,
      islandCollarThicknessMm: 5.0,
      cornerRadiusMm: 3.0,
      islands,
    });

    expect(pocket.status).toBe("ok");
    expect(pocket.hasSelfIntersection).toBe(false);
    expect(pocket.maxEndmillDiameterMm).toBeCloseTo(6.0, 4);
    expect(pocket.areaMm2).toBeGreaterThan(2000);
    expect(pocket.entities.length).toBeGreaterThanOrEqual(1);
    expect(pocket.entities[0].type).toBe("polyline");
    if (pocket.entities[0].type === "polyline") {
      expect(pocket.entities[0].closed).toBe(true);
    }

    // Caso de colapso de área quando t_b = 35 mm em altura de 60 mm
    const collapsed = computeConstantWallPocket({
      outerPolygon: outerRect,
      borderWallThicknessMm: 35.0,
      islandCollarThicknessMm: 5.0,
      cornerRadiusMm: 3.0,
      islands: [],
    });
    expect(collapsed.status).toBe("colapso_area");
    expect(collapsed.areaMm2).toBe(0);
  });

  it("Teste T11: Cremalheira Linear (Z=10, p=5mm -> L=50.0mm) e Engrenagem ISO 54 (Z=20, De=44.1mm -> m=2.0, Dp=40.0, Df=35.0)", () => {
    // 1. Cremalheira Linear (Z = 10, p = 5 mm, h = 3 mm, α = 20°)
    const rack = generateLinearRackProfile({
      toothCountZ: 10,
      pitchMm: 5.0,
      toothHeightMm: 3.0,
      pressureAngleDeg: 20,
      baseHeightMm: 8.0,
    });

    expect(rack.toothCountZ).toBe(10);
    expect(rack.effectivePitchMm).toBeCloseTo(5.0, 6);
    expect(rack.exactTotalLengthMm).toBeCloseTo(50.0, 6);
    expect(rack.hasSelfIntersection).toBe(false);
    expect(rack.entity.closed).toBe(true);

    // Verificar extensão X exata de 0 a 50.0 mm
    const xs = rack.pts.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeCloseTo(50.0, 6);

    // 2. Engrenagem Cilíndrica ISO 54 (Z = 20, De = 44.1 mm)
    const gearEst = estimateGearModuleFromMeasurement({
      toothCountZ: 20,
      measuredOuterDiameterMm: 44.1,
      pressureAngleDeg: 20,
    });

    expect(gearEst.estimatedModuleMm).toBeCloseTo(44.1 / 22, 4); // 2.0045 mm
    expect(gearEst.suggestedIsoModuleMm).toBe(2.0);
    expect(gearEst.pitchDiameterMm).toBeCloseTo(40.0, 4);
    expect(gearEst.rootDiameterMm).toBeCloseTo(35.0, 4);
    expect(gearEst.wildhaberSpanTeethK).toBe(3);

    const gearProfile = generateSpurGearProfile({
      toothCountZ: 20,
      moduleMm: gearEst.suggestedIsoModuleMm,
      centerBoreDiameterMm: 12.0,
    });
    expect(gearProfile.outerGearEntity.closed).toBe(true);
    expect(gearProfile.pitchCircleEntity.r).toBeCloseTo(20.0, 4);
    expect(gearProfile.boreEntity?.r).toBeCloseTo(6.0, 4);
  });

  it("Teste T13: Detecção de Padrão PCD Circular (6 furos em Ø100 mm a cada 60° com ruído ±0.1 mm)", () => {
    const noises = [
      { dx: 0.08, dy: -0.05 },
      { dx: -0.07, dy: 0.09 },
      { dx: 0.05, dy: 0.06 },
      { dx: -0.09, dy: -0.04 },
      { dx: 0.06, dy: -0.08 },
      { dx: -0.04, dy: 0.07 },
    ];

    const holes = noises.map((n, i) => {
      const ang = (i * 60 * Math.PI) / 180;
      return {
        id: `hole-${i + 1}`,
        x: 50 * Math.cos(ang) + n.dx,
        y: 50 * Math.sin(ang) + n.dy,
        r: 5,
      };
    });

    const pcd = detectHolePatternsPCD(holes);
    expect(pcd).not.toBeNull();
    expect(pcd!.holeCount).toBe(6);
    expect(pcd!.measuredPcdMm).toBeGreaterThan(99.7);
    expect(pcd!.measuredPcdMm).toBeLessThan(100.3);
    expect(pcd!.suggestedNominalPcdMm).toBe(100.0);
    expect(pcd!.nominalAngularStepDeg).toBeCloseTo(60.0, 3);
    expect(pcd!.isRegularBoltCircle).toBe(true);

    // Regularização explícita -> posiciona exatamente no raio 50.0 mm (PCD 100.0 mm)
    const initialEntities: Entity[] = holes.map((h) => ({
      id: h.id,
      type: "circle",
      layer: "recorte",
      cx: h.x,
      cy: h.y,
      r: h.r,
      params: { infoStatus: "MEDIDO" },
    }));

    const regularized = regularizeBoltCirclePCD({
      entities: initialEntities,
      holeIds: holes.map((h) => h.id),
      center: { x: 0, y: 0 },
      nominalPcdMm: 100.0,
    });

    const regCircles = regularized.filter(
      (e): e is Extract<Entity, { type: "circle" }> =>
        e.type === "circle" && !e.isConstruction,
    );
    expect(regCircles.length).toBe(6);
    for (const c of regCircles) {
      expect(Math.hypot(c.cx, c.cy)).toBeCloseTo(50.0, 5);
      expect(c.params?.infoStatus).toBe("NOMINAL_ACEITO");
    }
  });
});
