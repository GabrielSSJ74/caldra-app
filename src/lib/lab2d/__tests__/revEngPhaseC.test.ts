import { describe, it, expect } from "vitest";
import {
  computeHoleByCaliper,
  solveTrilateration2D,
  solveHoleNetworkGaussNewton,
  evaluateDimensionChain,
  computeRadiusFromChordSagitta,
  generateOrdinateStationPoints,
} from "../revEngBench";
import {
  buildConcentricEye,
  solveTangentBridge,
  computeEyeTrimPreview,
} from "../revEngTangentBridges";

describe("CHAMFER CAD — Engenharia Reversa: Fase C (Bancada, Furos, Cadeias e Pontes TTR)", () => {
  it("T3 — Paquímetro: Ø20 e Ø30 parede a parede 87,4 -> 112,4 mm; fora a fora 137,4 -> 112,4 mm; centro a centro direto e borda a borda", () => {
    // 1. Parede a parede: L = 87.4 + (20 + 30)/2 = 112.4 mm
    const p2p = computeHoleByCaliper({
      mode: "parede_a_parede",
      refX: 0,
      refY: 0,
      refDiameterMm: 20,
      targetDiameterMm: 30,
      measuredDistanceMm: 87.4,
      angleDeg: 0,
    });
    expect(p2p.valid).toBe(true);
    expect(p2p.centerToCenterMm).toBeCloseTo(112.4, 4);
    expect(p2p.centerX).toBeCloseTo(112.4, 4);
    expect(p2p.remainingWallMm).toBeCloseTo(87.4, 4);
    expect(p2p.infoStatus).toBe("CALCULADO");

    // 2. Fora a fora: L = 137.4 - (20 + 30)/2 = 112.4 mm
    const o2o = computeHoleByCaliper({
      mode: "fora_a_fora",
      refX: 0,
      refY: 0,
      refDiameterMm: 20,
      targetDiameterMm: 30,
      measuredDistanceMm: 137.4,
      angleDeg: 0,
    });
    expect(o2o.valid).toBe(true);
    expect(o2o.centerToCenterMm).toBeCloseTo(112.4, 4);
    expect(o2o.remainingWallMm).toBeCloseTo(87.4, 4);

    // 3. Centro a centro direto: L = 112.4 mm
    const c2c = computeHoleByCaliper({
      mode: "centro_a_centro",
      refX: 0,
      refY: 0,
      refDiameterMm: 20,
      targetDiameterMm: 30,
      measuredDistanceMm: 112.4,
      angleDeg: 0,
    });
    expect(c2c.valid).toBe(true);
    expect(c2c.centerToCenterMm).toBeCloseTo(112.4, 4);
    expect(c2c.infoStatus).toBe("MEDIDO");

    // 4. Borda a borda: bx = 12.0, by = 18.5, Ø = 10.0 -> Xc = 17.0, Yc = 23.5
    const b2b = computeHoleByCaliper({
      mode: "borda_a_borda",
      refX: 0,
      refY: 0,
      targetDiameterMm: 10,
      edgeDistXMm: 12.0,
      edgeDistYMm: 18.5,
      signX: 1,
      signY: 1,
    });
    expect(b2b.valid).toBe(true);
    expect(b2b.centerX).toBeCloseTo(17.0, 4);
    expect(b2b.centerY).toBeCloseTo(23.5, 4);
  });

  it("T4 — Trilateração: P1(0;0), P2(100;0), L1=60, L2=80 -> (36; ±48); L1=30, L2=40 -> sem solução com folga de 30 mm explicada", () => {
    const ok = solveTrilateration2D({
      p1: { x: 0, y: 0 },
      p2: { x: 100, y: 0 },
      targetDiameterMm: 12,
      reading1Mm: 60,
      reading2Mm: 80,
    });
    expect(ok.valid).toBe(true);
    expect(ok.solutionA).toBeDefined();
    expect(ok.solutionB).toBeDefined();
    expect(ok.solutionA!.x).toBeCloseTo(36, 4);
    expect(ok.solutionA!.y).toBeCloseTo(48, 4);
    expect(ok.solutionB!.x).toBeCloseTo(36, 4);
    expect(ok.solutionB!.y).toBeCloseTo(-48, 4);

    const noSol = solveTrilateration2D({
      p1: { x: 0, y: 0 },
      p2: { x: 100, y: 0 },
      targetDiameterMm: 12,
      reading1Mm: 30,
      reading2Mm: 40,
    });
    expect(noSol.valid).toBe(false);
    expect(noSol.gapMm).toBeCloseTo(30, 4);
    expect(noSol.message).toContain("30.0 mm");
  });

  it("T5 — Rede de medidas (Gauss–Newton): retângulo 100 x 60 com ruído ±0,1 mm, detecção de diagonal com +2 mm suspeita e estados de determinância", () => {
    const nodes = [
      { id: "F1", label: "F1", diameterMm: 10, x: 0, y: 0 },
      { id: "F2", label: "F2", diameterMm: 10, x: 100, y: 0 },
      { id: "F3", label: "F3", diameterMm: 10 },
      { id: "F4", label: "F4", diameterMm: 10 },
    ];
    const diagTrue = Math.hypot(100, 60); // 116.61903789690601

    // 1. Rede sobredeterminada (6 distâncias para 4 nós; 2N-3 = 5) com ruído realista de paquímetro
    const cleanEdges = [
      { id: "E12", fromId: "F1", toId: "F2", readingMm: 100.04, mode: "centro_a_centro" as const, uncertaintyMm: 0.1 },
      { id: "E23", fromId: "F2", toId: "F3", readingMm: 59.96, mode: "centro_a_centro" as const, uncertaintyMm: 0.1 },
      { id: "E34", fromId: "F3", toId: "F4", readingMm: 99.97, mode: "centro_a_centro" as const, uncertaintyMm: 0.1 },
      { id: "E41", fromId: "F4", toId: "F1", readingMm: 60.03, mode: "centro_a_centro" as const, uncertaintyMm: 0.1 },
      { id: "E13", fromId: "F1", toId: "F3", readingMm: diagTrue - 0.03, mode: "centro_a_centro" as const, uncertaintyMm: 0.1 },
      { id: "E24", fromId: "F2", toId: "F4", readingMm: diagTrue + 0.04, mode: "centro_a_centro" as const, uncertaintyMm: 0.1 },
    ];

    const resClean = solveHoleNetworkGaussNewton(nodes, cleanEdges, "F1", "F2");
    expect(resClean.valid).toBe(true);
    expect(resClean.determinacy).toBe("sobredeterminada");
    expect(resClean.degreesOfFreedom).toBe(1);

    const n3 = resClean.nodes.find((n) => n.id === "F3")!;
    const n4 = resClean.nodes.find((n) => n.id === "F4")!;
    expect(Math.abs(n3.x - 100)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(n3.y - 60)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(n4.x - 0)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(n4.y - 60)).toBeLessThanOrEqual(0.1);
    expect(n3.infoStatus).toBe("AJUSTADO");

    // 2. Uma diagonal (E13) com erro grosseiro de +2.0 mm é destacada como medida suspeita
    const outlierEdges = cleanEdges.map((e) =>
      e.id === "E13" ? { ...e, readingMm: diagTrue + 2.0 } : e,
    );
    const resOutlier = solveHoleNetworkGaussNewton(nodes, outlierEdges, "F1", "F2");
    expect(resOutlier.suspectEdgeId).toBe("E13");
    const e13Stat = resOutlier.edgeResiduals.find((r) => r.edgeId === "E13")!;
    expect(e13Stat.isSuspect).toBe(true);

    // 3. Verificação dos estados "determinada" (5 arestas) e "subdeterminada" (4 arestas)
    const detRes = solveHoleNetworkGaussNewton(nodes, cleanEdges.slice(0, 5), "F1", "F2");
    expect(detRes.determinacy).toBe("determinada");
    const subRes = solveHoleNetworkGaussNewton(nodes, cleanEdges.slice(0, 4), "F1", "F2");
    expect(subRes.determinacy).toBe("subdeterminada");
  });

  it("T6 — Cadeia de cotas: 30 + 30 + 35 + 40 + 10 + 5 = 150 contra total medido 150,4 -> fechamento de 0,4 mm sinalizado; distribuição só por ação explícita", () => {
    const partials = [30, 30, 35, 40, 10, 5];

    // Sem ação explícita de distribuição: preserva cotas originais e sinaliza alerta de 0.4 mm
    const rawChain = evaluateDimensionChain({
      partialsMm: partials,
      totalMeasuredMm: 150.4,
      closureToleranceMm: 0.2,
      distributeError: false,
    });
    expect(rawChain.sumPartialsMm).toBeCloseTo(150.0, 4);
    expect(rawChain.closureErrorMm).toBeCloseTo(0.4, 4);
    expect(rawChain.hasClosureAlert).toBe(true);
    expect(rawChain.distributed).toBe(false);
    expect(rawChain.steps[rawChain.steps.length - 1]!.accumulatedFinalMm).toBeCloseTo(150.0, 4);
    expect(rawChain.infoStatus).toBe("MEDIDO");

    // Com ação explícita de distribuição: distribui proporcionalmente e marca como AJUSTADO
    const distChain = evaluateDimensionChain({
      partialsMm: partials,
      totalMeasuredMm: 150.4,
      closureToleranceMm: 0.2,
      distributeError: true,
    });
    expect(distChain.distributed).toBe(true);
    expect(distChain.infoStatus).toBe("AJUSTADO");
    expect(distChain.steps[distChain.steps.length - 1]!.accumulatedFinalMm).toBeCloseTo(150.4, 4);
  });

  it("T7 — Corda e flecha: c = 100, f = 10 -> R = 130; c = 120, f = 16,077 -> R = 120,00; f <= 0 -> erro", () => {
    const r1 = computeRadiusFromChordSagitta({ chordMm: 100, sagittaMm: 10 });
    expect(r1.valid).toBe(true);
    expect(r1.radiusMm).toBeCloseTo(130.0, 4);
    expect(r1.infoStatus).toBe("CALCULADO");

    const r2 = computeRadiusFromChordSagitta({ chordMm: 120, sagittaMm: 16.077 });
    expect(r2.valid).toBe(true);
    expect(r2.radiusMm).toBeCloseTo(120.0, 2);

    expect(() => computeRadiusFromChordSagitta({ chordMm: 100, sagittaMm: 0 })).toThrow();
    expect(() => computeRadiusFromChordSagitta({ chordMm: 100, sagittaMm: -5 })).toThrow();
  });

  it("T9 — Pontes Tangentes TTR: olhais R20 em (0;0) e R35 em (132,4;0), ponte côncava R120 -> centro (49,489; 130,961), T1 (7,070; 18,709), T2 (113,678; 29,572), tangência a 1e-6; R_mín côncavo 38,7; convexa R90 -> SEM SOLUÇÃO com R_mín 93,7; retas e apara", () => {
    const c1 = { id: "eye-1", center: { x: 0, y: 0 }, radiusMm: 20 };
    const c2 = { id: "eye-2", center: { x: 132.4, y: 0 }, radiusMm: 35 };

    // 1. Ponte côncava R120
    const concave = solveTangentBridge({
      circle1: c1,
      circle2: c2,
      kind: "arc_concave",
      bridgeRadiusMm: 120,
    });
    expect(concave.valid).toBe(true);
    expect(concave.minConcaveRadiusMm).toBeCloseTo(38.7, 4);
    expect(concave.minConvexRadiusMm).toBeCloseTo(93.7, 4);

    const solA = concave.solutions[0]!;
    expect(solA.arcCenter!.x).toBeCloseTo(49.489, 3);
    expect(solA.arcCenter!.y).toBeCloseTo(130.961, 3);
    expect(solA.t1.x).toBeCloseTo(7.070, 3);
    expect(solA.t1.y).toBeCloseTo(18.709, 3);
    expect(solA.t2.x).toBeCloseTo(113.678, 3);
    expect(solA.t2.y).toBeCloseTo(29.572, 3);
    expect(solA.tangencyErrorMm).toBeLessThan(1e-6);

    // 2. Ponte convexa R90 -> SEM SOLUÇÃO com R mínimo 93.7 mm
    const convexFail = solveTangentBridge({
      circle1: c1,
      circle2: c2,
      kind: "arc_convex",
      bridgeRadiusMm: 90,
    });
    expect(convexFail.valid).toBe(false);
    expect(convexFail.minRadiusMm).toBeCloseTo(93.7, 4);
    expect(convexFail.reasonIfInvalid).toContain("93.70");

    // 3. Retas tangentes externa e interna com tangência < 1e-6
    const lineExt = solveTangentBridge({
      circle1: c1,
      circle2: c2,
      kind: "line_external",
    });
    expect(lineExt.valid).toBe(true);
    expect(lineExt.solutions[0]!.tangencyErrorMm).toBeLessThan(1e-6);

    const lineInt = solveTangentBridge({
      circle1: c1,
      circle2: c2,
      kind: "line_internal",
    });
    expect(lineInt.valid).toBe(true);
    expect(lineInt.solutions[0]!.tangencyErrorMm).toBeLessThan(1e-6);

    // 4. Olhal concêntrico e prévia de apara preservando o círculo original em construção
    const eye1 = buildConcentricEye({
      center: { x: 0, y: 0 },
      holeDiameterMm: 20,
      sizingMode: "outer_radius",
      outerRadiusMm: 20,
    });
    expect(eye1.valid).toBe(true);
    expect(eye1.wallThicknessMm).toBeCloseTo(10, 4);

    const solB = concave.solutions[1]!;
    const trim1 = computeEyeTrimPreview(
      eye1.outerEyeEntity as Extract<typeof eye1.outerEyeEntity, { type: "circle" }>,
      solA.t1,
      solB.t1,
      c2.center,
    );
    expect(trim1.keptOuterArc.type).toBe("arc");
    expect(trim1.removedInnerArc.type).toBe("arc");
    expect(trim1.auxiliaryOriginalCircle.isConstruction).toBe(true);

    // 5. Tabela de ordenadas / estações
    const ordPts = generateOrdinateStationPoints({
      origin: { x: 10, y: 5 },
      axisAngleDeg: 0,
      stationSpacingMm: 25,
      offsetsMm: [0, 12.5, 20.0],
    });
    expect(ordPts).toHaveLength(3);
    expect(ordPts[1]!.x).toBeCloseTo(35, 4);
    expect(ordPts[1]!.y).toBeCloseTo(17.5, 4);
  });
});
