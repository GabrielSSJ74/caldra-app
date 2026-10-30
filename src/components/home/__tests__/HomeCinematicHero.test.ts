import { describe, it, expect } from "vitest";
import {
  CINEMATIC_WORKFLOW_SCENES,
  STAGE_CENTER,
  SCENE_DURATION_MS,
  ACT2_PROGRESS_THRESHOLD,
  resolveSceneLiveTelemetry,
  runChamferSandboxDemo,
  buildChamferPlaygroundProject,
  prepareInstantPlaygroundForScene,
  computeChamferStageFrame,
  runBoilermakingSandboxDemo,
  runCalculatorSandboxDemo,
  runFabricationSandboxDemo,
} from "../HomeCinematicHero";
import { getProject, listProjects, PLAYGROUND_SANDBOX_ID } from "@/lib/lab2d/projects";

describe("HomeCinematicHero — Live Engineering Playground & Micro-HUD de Conversão", () => {
  it("Teste A & D — Execução real e fidelidade dimensional dos motores em sandbox", () => {
    // 1. CHAMFER CAD (computeInstances de cadArrayEngine.ts)
    const chamfer = runChamferSandboxDemo();
    expect(chamfer.outerDiameterMm).toBe(160);
    expect(chamfer.innerBoreMm).toBe(60);
    expect(chamfer.hubDiameterMm).toBe(84);
    expect(chamfer.pcdMm).toBe(116);
    expect(chamfer.holeDiameterMm).toBe(18);
    expect(chamfer.holeCount).toBe(6);
    expect(chamfer.thicknessMm).toBe(3.0);
    expect(chamfer.stepAngleDeg).toBe(60);
    expect(chamfer.polarHoles).toHaveLength(6);
    // 1º furo em (58, 0), 2º furo em 60° (29, 50.23)
    expect(chamfer.polarHoles[0]?.x).toBeCloseTo(58, 1);
    expect(chamfer.polarHoles[0]?.y).toBeCloseTo(0, 1);
    expect(chamfer.polarHoles[0]?.isOriginal).toBe(true);
    expect(chamfer.polarHoles[1]?.x).toBeCloseTo(29, 1);
    expect(chamfer.polarHoles[1]?.y).toBeCloseTo(50.23, 1);

    // 2. Caldeiraria e Planificação 1:1 (getEngine('tronco-de-cone') de geometry/engines.ts)
    const boiler = runBoilermakingSandboxDemo();
    expect(boiler.d1Mm).toBe(120);
    expect(boiler.d2Mm).toBe(60);
    expect(boiler.heightMm).toBe(100);
    expect(boiler.thicknessMm).toBe(3.0);
    expect(boiler.divisions).toBe(12);
    // Geratriz real √(100² + 30²) = 104.40 mm
    expect(boiler.slantHeightMm).toBeCloseTo(104.4, 1);
    expect(boiler.outerRadiusMm).toBeCloseTo(208.8, 1);
    expect(boiler.innerRadiusMm).toBeCloseTo(104.4, 1);

    // 3. Bancada de Cálculos Mecânicos (evaluateExpression: Corda c=120, Flecha f=16.08 -> R=120.0 mm)
    const calc = runCalculatorSandboxDemo();
    expect(calc.chordInputMm).toBe(120);
    expect(calc.sagittaInputMm).toBe(16.08);
    expect(calc.radiusResultMm).toBeCloseTo(120.0, 1);
    expect(calc.geratrizMm).toBeCloseTo(104.4, 2);
    expect(calc.angleDeg).toBeCloseTo(16.7, 1);
    expect(calc.sheetMassKg).toBeCloseTo(105.98, 1);

    // 4. Corte CNC, Peso e Orçamento (fabricationCost + cutTimeMinutes para Chapa 1500×3000 3.0mm)
    const fab = runFabricationSandboxDemo();
    expect(fab.sheetWidthMm).toBe(1500);
    expect(fab.sheetLengthMm).toBe(3000);
    expect(fab.thicknessMm).toBe(3.0);
    expect(fab.cutLengthMm).toBe(1480);
    expect(fab.pierces).toBe(8);
    expect(fab.cutTimeMin).toBeGreaterThan(1.0);
    expect(fab.totalCostBrl).toBeGreaterThan(200);
  });

  it("Teste B & C — Palco único centralizado e coreografia de 7 etapas sincronizada com Ato 1 (0..55%) e Ato 2 (55..100%)", () => {
    expect(STAGE_CENTER).toEqual({ x: 210, y: 112 });
    expect(ACT2_PROGRESS_THRESHOLD).toBe(0.55);

    const s1 = computeChamferStageFrame(0.05);
    expect(s1.stepId).toBe("start_outer_profile");
    expect(s1.extrusionFactor).toBe(0);
    expect(s1.elevationDeg).toBe(90);

    const s2 = computeChamferStageFrame(0.16);
    expect(s2.stepId).toBe("inner_profile_complete");
    expect(s2.innerStrokeProgress).toBeGreaterThan(0.4);

    const s3 = computeChamferStageFrame(0.32);
    expect(s3.stepId).toBe("polar_array_execution");
    expect(s3.visibleHoleCount).toBeGreaterThanOrEqual(3);

    const s4 = computeChamferStageFrame(0.46);
    expect(s4.stepId).toBe("dimensions_and_refs");
    expect(s4.dimensionsOpacity).toBeGreaterThan(0.6);

    const s5 = computeChamferStageFrame(0.52);
    expect(s5.stepId).toBe("geometry_validation_pulse");
    expect(s5.validationPulse).toBeGreaterThan(0.4);

    const s6 = computeChamferStageFrame(0.64);
    expect(s6.stepId).toBe("in_place_3d_extrusion");
    expect(s6.extrusionFactor).toBeGreaterThan(0.4);
    expect(s6.elevationDeg).toBeLessThan(85);

    const s7 = computeChamferStageFrame(0.95);
    expect(s7.stepId).toBe("orbit_3d_frontal_hero");
    expect(s7.extrusionFactor).toBe(1);
    expect(s7.elevationDeg).toBeCloseTo(26, 0);
    expect(s7.azimuthDeg).toBeCloseTo(14, 0);
  });

  it("Teste E — Cabeçalho Duplo (Título + Subtítulo de Valor), Micro-CTA e Telemetria ao Vivo sincronizada", () => {
    expect(SCENE_DURATION_MS).toBe(6000);
    expect(CINEMATIC_WORKFLOW_SCENES).toHaveLength(4);

    expect(CINEMATIC_WORKFLOW_SCENES.map((s) => s.title)).toEqual([
      "Desenho técnico no CHAMFER",
      "Caldeiraria e planificação 1:1",
      "Bancada de cálculos mecânicos",
      "Corte CNC, peso e orçamento",
    ]);

    expect(CINEMATIC_WORKFLOW_SCENES.map((s) => s.subtitle)).toEqual([
      "Desenhe no toque com arrays, cotas reais e vista 3D imediata",
      "Do modelo 3D ao desenvolvimento plano pronto para dobrar",
      "Descubra raios por corda/flecha, triangulação e peso de chapa",
      "Aproveitamento de chapa, tempo de corte e custo em segundos",
    ]);

    expect(CINEMATIC_WORKFLOW_SCENES.map((s) => s.ctaLabel)).toEqual([
      "Abrir peça no CAD →",
      "Testar planificação →",
      "Abrir calculadora →",
      "Simular orçamento →",
    ]);

    // Telemetria exata da Cena 1 (6.0s):
    // 0.0s–1.2s, 1.2s–2.6s, 2.6s–3.4s, 3.4s–6.0s
    expect(resolveSceneLiveTelemetry("chamfer-cad", 0.1)).toBe(
      "[ 2D SKETCH • CONTORNO Ø160.0 MM ]",
    );
    expect(resolveSceneLiveTelemetry("chamfer-cad", 0.3)).toBe(
      "[ ARRAY POLAR • 6x FUROS Ø18 (PCD 116) ]",
    );
    expect(resolveSceneLiveTelemetry("chamfer-cad", 0.5)).toBe(
      "[ COTAGEM TÉCNICA • VALIDAÇÃO OK ]",
    );
    expect(resolveSceneLiveTelemetry("chamfer-cad", 0.75)).toBe(
      "[ CAD 3D • ÓRBITA FRONTAL (CHAPA 3.0MM) ]",
    );
  });

  it("Teste F — Instant Playground: carrega a peça de demonstração em sandbox sem tocar nos projetos salvos", () => {
    const savedBefore = listProjects();

    const pgProject = buildChamferPlaygroundProject();
    expect(pgProject.id).toBe(PLAYGROUND_SANDBOX_ID);
    expect(pgProject.thickness).toBe(3.0);
    expect(pgProject.plans[0]?.entities.length).toBeGreaterThanOrEqual(10);
    expect(pgProject.plans[0]?.groups?.[0]?.arraySpec?.type).toBe("polar");

    // getProject encontra o rascunho sandbox, mas listProjects() continua intacto!
    const loaded = getProject(PLAYGROUND_SANDBOX_ID);
    expect(loaded?.id).toBe(PLAYGROUND_SANDBOX_ID);
    expect(listProjects()).toEqual(savedBefore);

    // Rotas do Instant Playground para as 4 cenas
    expect(prepareInstantPlaygroundForScene("chamfer-cad")).toEqual({
      to: "/desenho-2d/$projectId",
      params: { projectId: PLAYGROUND_SANDBOX_ID },
    });
    expect(prepareInstantPlaygroundForScene("caldeiraria-tracagem")).toEqual({
      to: "/tracagem/$slug",
      params: { slug: "tronco-de-cone" },
      search: { preset: "d1:120,d2:60,h:100,thickness:3,n:12" },
    });
    expect(prepareInstantPlaygroundForScene("calculos-engenharia")).toEqual({
      to: "/calculadora",
    });
    expect(prepareInstantPlaygroundForScene("preparacao-fabricacao")).toEqual({
      to: "/oficina",
      search: { tab: "orcamento" },
    });
  });
});
