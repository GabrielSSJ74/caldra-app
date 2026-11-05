import { describe, expect, it } from "vitest";
import { rectPolyline, type Entity } from "./core";
import { computeWorkplaneOrbitProjection2D } from "./orbit3dController";
import {
  HOLE_METRIC_SPECS_3D,
  applyDirectHole3DToEntities,
  applyDirectTransform3DToEntities,
  buildDirectTopology3DScene,
  executeMetalStructure10StepBenchmark,
  formatSubElementTelemetry3D,
  generateTechnicalDrawingViews2DFrom3D,
  getEntityDirect3DParams,
  hitTestSubElement3DInScreenSpace,
  project3DSelectionTo2DSketch,
  projectPoint3DToCanvasViewMm,
  resolveDirect3DQuickCommand,
  setEntityDirect3DParams,
} from "./cadDirectModeling3D";
import {
  compilePromptToAgentDslV2Plan,
  createEmptyPartModel,
  createExecutionSandbox,
  executeDslV2ToolCallsBatch,
} from "@/lib/intent";

describe("CHAMFER CAD — Motor de Modelagem Direta 3D, Edição Topológica e Sincronia 2D ⇄ 3D", () => {
  it("1. Constrói coluna Metalon 100×50 mm extrudada a 490 mm com Fillet R10 mm nas 4 quinas e Shell oco de 6 mm", () => {
    let col = rectPolyline({ x: 0, y: 0 }, { x: 100, y: 50 }, "corte", 0);
    col = { ...col, id: "col_metalon_1" };

    // Passo 1: Extrusão 490 mm
    col = setEntityDirect3DParams(col, {
      extrudeHeightMm: 490,
      booleanMode3D: "new_body",
    });

    const sceneStep1 = buildDirectTopology3DScene([col], 10);
    expect(sceneStep1.bodies.length).toBe(1);
    const body1 = sceneStep1.bodies[0]!;

    // Verifica telemetria da face superior: 100 × 50 = 5,000.00 mm²
    const topFace = body1.faces.find((f) => f.role === "top");
    expect(topFace).toBeDefined();
    expect(topFace!.areaMm2).toBeCloseTo(5000, 0);

    const faceTelemetry = formatSubElementTelemetry3D(sceneStep1, {
      faceIds: [topFace!.faceId],
      edgeIds: [],
      bodyIds: [],
      activePivot3D: null,
      activeHingeEdgeId: null,
    });
    expect(faceTelemetry).toBe("1 face | 5,000.00 mm²");

    // Verifica telemetria das 4 arestas verticais: 4 × 490 = 1,960.00 mm
    const verticalEdges = body1.edges.filter((e) => e.role === "vertical");
    expect(verticalEdges.length).toBe(4);
    const edgeTelemetry = formatSubElementTelemetry3D(sceneStep1, {
      faceIds: [],
      edgeIds: verticalEdges.map((e) => e.edgeId),
      bodyIds: [],
      activePivot3D: null,
      activeHingeEdgeId: null,
    });
    expect(edgeTelemetry).toBe("4 arestas | 1,960.00 mm");

    // Passo 2: Fillet 3D R10 mm nas quinas verticais + Shell (Metalon oco parede 6 mm com topo e base abertos)
    col = setEntityDirect3DParams(col, {
      edgeFilletRadiusMm: 10,
      shellThicknessMm: 6,
      shellOpenCaps: ["top", "bottom"],
    });

    const sceneStep2 = buildDirectTopology3DScene([col], 10);
    const body2 = sceneStep2.bodies[0]!;
    expect(body2.edgeFilletRadiusMm).toBe(10);
    expect(body2.innerFilletRadiusMm).toBe(4);
    expect(body2.shellThicknessMm).toBe(6);
    expect(body2.shellOpenCaps).toEqual(["top", "bottom"]);
    expect(body2.faces.length).toBeGreaterThanOrEqual(6);
  });

  it("2. Executa Move/Rotate 3D com Copy: ON para duplicar a coluna a 700 mm e Offset Face +25 mm na sapata", () => {
    let col1 = rectPolyline({ x: 0, y: 0 }, { x: 100, y: 50 }, "corte", 0);
    col1 = setEntityDirect3DParams({ ...col1, id: "col_1" }, {
      extrudeHeightMm: 490,
      shellThicknessMm: 6,
      shellOpenCaps: ["top", "bottom"],
    });

    // Duplica a coluna com Copy: ON deslocando +700 mm em X
    const copyRes = applyDirectTransform3DToEntities(
      [col1],
      ["col_1"],
      { dx: 700, dy: 0, dz: 0 },
      true,
    );
    expect(copyRes.updatedEntities.length).toBe(2);

    // Adiciona sapata inferior e aplica Offset Face +25 mm nas laterais
    let baseplate = rectPolyline({ x: 0, y: 0 }, { x: 100, y: 50 }, "corte", 0);
    baseplate = setEntityDirect3DParams({ ...baseplate, id: "sapata_1" }, {
      extrudeHeightMm: 12,
      offsetFaceSidesMm: 25,
    });

    const scene = buildDirectTopology3DScene([...copyRes.updatedEntities, baseplate], 12);
    expect(scene.bodies.length).toBe(3);

    const sapataBody = scene.bodies.find((b) => b.entityId === "sapata_1")!;
    // 100 + 2*25 = 150 mm; 50 + 2*25 = 100 mm
    expect(sapataBody.deltaX).toBeCloseTo(150, 0);
    expect(sapataBody.deltaY).toBeCloseTo(100, 0);
  });

  it("3. Executa Rotate Around Axis (Corte em Meia-Esquadria 45° / -45°) e Raycasting de Sub-Elementos", () => {
    let brace = rectPolyline({ x: 0, y: 0 }, { x: 60, y: 40 }, "corte", 0);
    brace = setEntityDirect3DParams({ ...brace, id: "mao_francesa_1" }, {
      extrudeHeightMm: 300,
      miterCutTopDeg: 45,
      miterCutBottomDeg: -45,
    });

    const scene = buildDirectTopology3DScene([brace], 10);
    const body = scene.bodies[0]!;
    const params = getEntityDirect3DParams(brace, 10);
    expect(params.miterCutTopDeg).toBe(45);
    expect(params.miterCutBottomDeg).toBe(-45);

    const orbitProj = computeWorkplaneOrbitProjection2D(45, 35.264, { x: 30, y: 20 }, 300);
    const topFace = body.faces.find((f) => f.faceId.endsWith("_face_top"))!;
    const proj = projectPoint3DToCanvasViewMm(topFace.centroid, orbitProj);
    const hit = hitTestSubElement3DInScreenSpace(
      proj,
      scene,
      orbitProj,
      { tx: 0, ty: 0, k: 1 },
      18,
    );
    expect(hit.kind).not.toBe("none");
    expect(hit.body?.bodyId).toBe(body.bodyId);
  });

  it("4. Sincronia Bidirecional 2D ⇄ 3D: furos adicionados no 2D subtraem imediatamente o volume do sólido 3D", () => {
    const plate = setEntityDirect3DParams(
      { ...rectPolyline({ x: 0, y: 0 }, { x: 200, y: 100 }, "corte", 0), id: "plate_sync" },
      { extrudeHeightMm: 20 },
    );
    const hole: Entity = {
      id: "hole_sync",
      layer: "furo",
      type: "circle",
      cx: 100,
      cy: 50,
      r: 20,
    };

    const sceneNoHole = buildDirectTopology3DScene([plate], 20);
    const sceneWithHole = buildDirectTopology3DScene([plate, hole], 20);

    const topAreaNoHole = sceneNoHole.bodies[0]!.faces.find((f) => f.role === "top")!.areaMm2;
    const topAreaWithHole = sceneWithHole.bodies[0]!.faces.find((f) => f.role === "top")!.areaMm2;

    expect(topAreaNoHole).toBeCloseTo(20000, 0);
    expect(topAreaWithHole).toBeLessThan(topAreaNoHole - 1200);
    expect(sceneWithHole.bodies[0]!.faces.some((f) => f.role === "inner_side")).toBe(true);
  });

  it("5. Compila e executa comandos de Modelagem Direta 3D via CHAMFER INTENT", () => {
    const pm = createEmptyPartModel();
    const plan = compilePromptToAgentDslV2Plan(
      "Coluna metalon 100 por 50 extrudada 490 mm com quinas R10 parede 6 mm e corte meia-esquadria 45 graus",
      { partModel: pm },
    );

    expect(plan.toolCalls.some((c) => c.name === "create_rectangle")).toBe(true);
    expect(plan.toolCalls.some((c) => c.name === "extrude_3d")).toBe(true);
    expect(plan.toolCalls.some((c) => c.name === "fillet_edges_3d")).toBe(true);
    expect(plan.toolCalls.some((c) => c.name === "shell_body_3d")).toBe(true);
    expect(plan.toolCalls.some((c) => c.name === "miter_cut_face_3d")).toBe(true);

    const sandbox = createExecutionSandbox({});
    const report = executeDslV2ToolCallsBatch(plan.toolCalls, sandbox);
    expect(report.ok).toBe(true);
    const createdEntity = report.finalState.entities[0]!;
    const p3d = getEntityDirect3DParams(createdEntity, 10);
    expect(p3d.extrudeHeightMm).toBe(490);
    expect(p3d.edgeFilletRadiusMm).toBe(10);
    expect(p3d.shellThicknessMm).toBe(6);
    expect(p3d.miterCutTopDeg).toBe(45);
  });

  it("6. Separação completa e estrita entre Extrude (extrudeHeight=500mm), Espessura da Parede (shellWallThickness=4.75mm) e CHAPA (sheetThickness=3.0mm)", () => {
    let tube = rectPolyline({ x: 0, y: 0 }, { x: 80, y: 40 }, "corte", 0);
    tube = { ...tube, id: "tubo_metalon_500" };

    // Define extrusão de 500 mm
    tube = setEntityDirect3DParams(tube, {
      extrudeHeightMm: 500,
      booleanMode3D: "new_body",
    });

    const paramsAfterExtrude = getEntityDirect3DParams(tube, 3.0);
    expect(paramsAfterExtrude.extrudeHeightMm).toBe(500);
    expect(paramsAfterExtrude.shellWallThicknessMm).toBe(0);

    // Aplica Shell (espessura da parede do tubo = 4.75 mm)
    tube = setEntityDirect3DParams(tube, {
      shellWallThicknessMm: 4.75,
      shellThicknessMm: 4.75,
      shellOpenCaps: ["top", "bottom"],
    });

    const scene = buildDirectTopology3DScene([tube], 3.0);
    expect(scene.bodies.length).toBe(1);
    const body = scene.bodies[0]!;

    expect(body.extrudeHeightMm).toBe(500);
    expect(body.shellWallThicknessMm).toBe(4.75);
    expect(body.shellThicknessMm).toBe(4.75);

    tube = setEntityDirect3DParams(tube, {
      shellWallThicknessMm: 2.0,
      shellThicknessMm: 2.0,
    });
    const paramsAfterWallChange = getEntityDirect3DParams(tube, 3.0);
    expect(paramsAfterWallChange.extrudeHeightMm).toBe(500);
    expect(paramsAfterWallChange.shellWallThicknessMm).toBe(2.0);

    tube = setEntityDirect3DParams(tube, {
      extrudeHeightMm: 1000,
    });
    const paramsAfterHeightChange = getEntityDirect3DParams(tube, 3.0);
    expect(paramsAfterHeightChange.extrudeHeightMm).toBe(1000);
    expect(paramsAfterHeightChange.shellWallThicknessMm).toBe(2.0);
  });

  it("7. Translação nos eixos +X e +Y do Gizmo move a entidade mantendo propriedades 3D intactas", () => {
    let part = rectPolyline({ x: 10, y: 20 }, { x: 110, y: 70 }, "corte", 0);
    part = setEntityDirect3DParams({ ...part, id: "part_gizmo_trans" }, {
      extrudeHeightMm: 250,
      shellWallThicknessMm: 3.2,
    });

    const transX = applyDirectTransform3DToEntities([part], ["part_gizmo_trans"], { dx: 50, dy: 0, dz: 0 }, false);
    const updatedX = transX.updatedEntities.find((e) => e.id === "part_gizmo_trans")!;
    expect(updatedX).toBeDefined();
    const paramsX = getEntityDirect3DParams(updatedX, 3.0);
    expect(paramsX.extrudeHeightMm).toBe(250);
    expect(paramsX.shellWallThicknessMm).toBe(3.2);

    const transY = applyDirectTransform3DToEntities([updatedX], ["part_gizmo_trans"], { dx: 0, dy: 75, dz: 0 }, false);
    const updatedY = transY.updatedEntities.find((e) => e.id === "part_gizmo_trans")!;
    const paramsY = getEntityDirect3DParams(updatedY, 3.0);
    expect(paramsY.extrudeHeightMm).toBe(250);
    expect(paramsY.shellWallThicknessMm).toBe(3.2);
  });

  it("8. Executa e valida os 10 Passos da Prova de Fogo da Estrutura Metálica Industrial e Invariantes Volumétricas B-Rep", () => {
    const benchmark = executeMetalStructure10StepBenchmark(10);
    expect(benchmark.stepReports.length).toBe(10);
    expect(benchmark.stepReports.every((r) => r.passed)).toBe(true);

    // Invariantes matemáticas da Seção 10 & 11:
    // Passo 2: Volume = 2,450,000 mm³ e V - E + F = 2
    expect(benchmark.invariantsValid.step2Volume2450000).toBe(true);
    expect(benchmark.invariantsValid.step2EulerChi2).toBe(true);

    // Passo 3: 4 arestas | 1,960.00 mm e Volume c/ Fillet R10 ≈ 2,407,938 mm³
    expect(benchmark.invariantsValid.step3Edges1960).toBe(true);
    expect(benchmark.invariantsValid.step3FilletVolume2407938).toBe(true);

    // Passo 4: Anel do Tubo Metalon 6mm = 1,583.9 mm² e Volume Metálico ≈ 776,108 mm³
    expect(benchmark.invariantsValid.step4ShellRingArea1583_9).toBe(true);
    expect(benchmark.invariantsValid.step4ShellVolume776108).toBe(true);

    // Passo 10: Sapata expandida +25 mm nas 4 faces laterais (100×50 -> 150×100 mm)
    expect(benchmark.invariantsValid.step10Baseplate150x100).toBe(true);

    // Total de corpos: 4 colunas + 4 travessas + 2 mãos-francesas + 4 sapatas = 14 corpos sólidos
    expect(benchmark.scene.bodies.length).toBe(14);
  });

  it("9. Valida tabela métrica ISO de Furação 3D (Hole M6 a M20) e subtração de volume em tempo real", () => {
    expect(HOLE_METRIC_SPECS_3D.M6.tapDrillDiameterMm).toBe(5.0);
    expect(HOLE_METRIC_SPECS_3D.M6.clearanceDiameterMm).toBe(6.6);
    expect(HOLE_METRIC_SPECS_3D.M8.tapDrillDiameterMm).toBe(6.8);
    expect(HOLE_METRIC_SPECS_3D.M8.clearanceDiameterMm).toBe(9.0);
    expect(HOLE_METRIC_SPECS_3D.M10.tapDrillDiameterMm).toBe(8.5);
    expect(HOLE_METRIC_SPECS_3D.M10.clearanceDiameterMm).toBe(11.0);
    expect(HOLE_METRIC_SPECS_3D.M12.tapDrillDiameterMm).toBe(10.2);
    expect(HOLE_METRIC_SPECS_3D.M12.clearanceDiameterMm).toBe(13.5);
    expect(HOLE_METRIC_SPECS_3D.M16.tapDrillDiameterMm).toBe(14.0);
    expect(HOLE_METRIC_SPECS_3D.M16.clearanceDiameterMm).toBe(17.5);
    expect(HOLE_METRIC_SPECS_3D.M20.tapDrillDiameterMm).toBe(17.5);
    expect(HOLE_METRIC_SPECS_3D.M20.clearanceDiameterMm).toBe(22.0);

    const flange = setEntityDirect3DParams(
      { ...rectPolyline({ x: 0, y: 0 }, { x: 100, y: 100 }, "corte", 0), id: "flange_m12" },
      { extrudeHeightMm: 15 },
    );
    const { updatedEntities, createdHoleIds } = applyDirectHole3DToEntities(
      [flange],
      ["flange_m12"],
      { threadSize: "M12", holeType: "through" },
    );
    expect(createdHoleIds.length).toBe(1);
    const scene = buildDirectTopology3DScene(updatedEntities, 15);
    expect(scene.bodies.length).toBe(1);
    const body = scene.bodies[0]!;
    // Volume sem furo = 150,000 mm³; com furo passante Ø13.5 mm (A ≈ 143.14 mm²) -> V ≈ 147,853 mm³
    expect(body.volumeMm3).toBeCloseTo(150000 - Math.PI * 6.75 * 6.75 * 15, 0);
  });

  it("10. Valida Project 3D -> 2D, Create Drawing (Vistas Ortográficas 2D) e Atalhos AutoCAD 3D", () => {
    const benchmark = executeMetalStructure10StepBenchmark(4);
    const colBody = benchmark.scene.bodies[0]!;

    const projected = project3DSelectionTo2DSketch(
      benchmark.scene,
      {
        faceIds: [],
        edgeIds: [],
        bodyIds: [colBody.bodyId],
        activePivot3D: null,
        activeHingeEdgeId: null,
      },
      true,
    );
    expect(projected.length).toBeGreaterThanOrEqual(1);
    expect(projected[0]!.isConstruction).toBe(true);

    const views2D = generateTechnicalDrawingViews2DFrom3D(benchmark.scene);
    // Deve conter retângulos das 3 vistas (Superior, Frontal, Lateral) + textos + cotas
    expect(views2D.length).toBeGreaterThanOrEqual(8);
    expect(views2D.some((e) => e.layer === "cota")).toBe(true);

    expect(resolveDirect3DQuickCommand("EXT")).toBe("extrude_3d");
    expect(resolveDirect3DQuickCommand("PRESSPULL")).toBe("offset_face_3d");
    expect(resolveDirect3DQuickCommand("FIL")).toBe("fillet_3d");
    expect(resolveDirect3DQuickCommand("CHA")).toBe("chamfer_3d");
    expect(resolveDirect3DQuickCommand("SHELL")).toBe("shell_3d");
    expect(resolveDirect3DQuickCommand("MOV")).toBe("transform_3d");
    expect(resolveDirect3DQuickCommand("SLI")).toBe("rotate_axis_3d");
    expect(resolveDirect3DQuickCommand("HOLE")).toBe("hole_3d");
    expect(resolveDirect3DQuickCommand("PROJ")).toBe("project_3d");
    expect(resolveDirect3DQuickCommand("DRAWING")).toBe("create_drawing_3d");
  });
});

