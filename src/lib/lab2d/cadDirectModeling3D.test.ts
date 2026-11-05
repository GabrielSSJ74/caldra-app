import { describe, expect, it } from "vitest";
import { rectPolyline, type Entity } from "./core";
import { computeWorkplaneOrbitProjection2D } from "./orbit3dController";
import {
  HOLE_METRIC_SPECS_3D,
  applyDirectFilletOrChamfer3DToEntities,
  applyDirectHole3DToEntities,
  applyDirectOffsetFace3DToEntities,
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

  it("11. Escopo por Sub-Elemento vs Peça Inteira: Fillet/Chanfro em 1 única aresta vertical mantém as outras 3 quinas vivas", () => {
    let block = rectPolyline({ x: 0, y: 0 }, { x: 100, y: 60 }, "corte", 0);
    block = setEntityDirect3DParams({ ...block, id: "block_single_edge" }, {
      extrudeHeightMm: 80,
    });

    // Aplica Fillet R15 mm SOMENTE na quina vertical 0 (targetEdgeIndices = [0])
    const singleEdgeUpdated = applyDirectFilletOrChamfer3DToEntities(
      [block],
      ["block_single_edge"],
      "fillet",
      15,
      [0],
    );
    const paramsSingle = getEntityDirect3DParams(singleEdgeUpdated[0]!, 10);
    expect(paramsSingle.cornerFilletsMm[0]).toBe(15);
    expect(paramsSingle.cornerFilletsMm[1] ?? 0).toBe(0);
    expect(paramsSingle.edgeFilletRadiusMm).toBe(0);

    const sceneSingle = buildDirectTopology3DScene(singleEdgeUpdated, 10);
    const bodySingle = sceneSingle.bodies[0]!;
    expect(bodySingle.cornerFilletsMm[0]).toBe(15);
    expect(bodySingle.cornerFilletsMm[1] ?? 0).toBe(0);
    // Volume com apenas 1 quina R15 deve ser maior que o volume com todas as 4 quinas R15
    const allEdgesUpdated = applyDirectFilletOrChamfer3DToEntities(
      [block],
      ["block_single_edge"],
      "fillet",
      15,
    );
    const sceneAll = buildDirectTopology3DScene(allEdgesUpdated, 10);
    const bodyAll = sceneAll.bodies[0]!;
    expect(bodySingle.volumeMm3).toBeGreaterThan(bodyAll.volumeMm3);
  });

  it("12. Chanfro em Bisel Localizado 3D (Vértice ou Borda do Topo) cria face chanfrada 45° na quina sem cortar a coluna inteira", () => {
    let block = rectPolyline({ x: 0, y: 0 }, { x: 100, y: 60 }, "corte", 0);
    block = setEntityDirect3DParams({ ...block, id: "block_vertex_bevel" }, {
      extrudeHeightMm: 120,
    });

    // Aplica bisel localizado de 12 mm apenas no vértice superior 0 ("top_0")
    const beveledEntities = applyDirectFilletOrChamfer3DToEntities(
      [block],
      ["block_vertex_bevel"],
      "chamfer",
      12,
      undefined,
      ["top_0"],
    );
    const params = getEntityDirect3DParams(beveledEntities[0]!, 10);
    expect(params.vertexBevelsMm.top_0).toBe(12);
    expect(params.edgeChamferDistMm).toBe(0);

    const scene = buildDirectTopology3DScene(beveledEntities, 10);
    const body = scene.bodies[0]!;
    const bevelFace = body.faces.find((f) => f.faceId.endsWith("_face_bevel_top_0"));
    expect(bevelFace).toBeDefined();
    expect(bevelFace!.polygon3D.length).toBe(3);
  });

  it("13. Offset Face Individual move apenas a face lateral selecionada (+X) mantendo a face oposta (-X) ancorada", () => {
    let block = rectPolyline({ x: 0, y: 0 }, { x: 100, y: 50 }, "corte", 0);
    block = setEntityDirect3DParams({ ...block, id: "block_offset_pos_x" }, {
      extrudeHeightMm: 40,
    });

    const updated = applyDirectOffsetFace3DToEntities(
      [block],
      ["block_offset_pos_x"],
      "pos_x",
      25,
    );
    const scene = buildDirectTopology3DScene(updated, 10);
    const body = scene.bodies[0]!;
    expect(body.deltaX).toBeCloseTo(125, 1);
    expect(body.deltaY).toBeCloseTo(50, 1);
    // Com a face -X ancorada em x=0 e a face +X deslocada para x=125, o centroide X deve estar em 62.5 mm
    expect(body.pivot3D.x).toBeCloseTo(62.5, 1);
  });

  it("14. Furação Real 2D/3D (Estilo Flange): furos circulares perfuram a malha triangular das tampas superior/inferior (vazado real)", () => {
    const flange = setEntityDirect3DParams(
      { ...rectPolyline({ x: 0, y: 0 }, { x: 120, y: 120 }, "corte", 0), id: "flange_holes" },
      { extrudeHeightMm: 16 },
    );
    const centerHole: Entity = {
      id: "center_bore",
      layer: "corte", // Mesmo em layer 'corte', contorno menor interno deve ser reconhecido como furo passante!
      type: "circle",
      cx: 60,
      cy: 60,
      r: 25,
    };

    const scene = buildDirectTopology3DScene([flange, centerHole], 16);
    expect(scene.tessellatedShape).toBeDefined();
    expect(scene.tessellatedShape.mesh.positions.length).toBeGreaterThan(100);
    // Verifica que a cavidade cilíndrica interna foi gerada como face inner_side e reduziu a área da tampa
    expect(scene.bodies[0]!.faces.some((f) => f.role === "inner_side")).toBe(true);
    const topFace = scene.bodies[0]!.faces.find((f) => f.role === "top")!;
    expect(topFace.areaMm2).toBeCloseTo(120 * 120 - Math.PI * 25 * 25, 0);
  });

  it("15. Fluxo Completo Loft 3D Multisseção (AutoCAD 3D): Retângulo (Z=0) ➔ Hexágono (Z=60) ➔ Círculo (Z=120) com Parametrização Polar Zero-Twist (N=120 × M=36)", async () => {
    const { regularPolygon } = await import("./core");
    const {
      LOFT_N_SAMPLES,
      LOFT_V_RINGS,
      buildLoft3DMesh,
      createLoft3DEntity,
      sampleProfileCrossSection3D,
      setEntityElevationZ,
    } = await import("./cadLoft3DEngine");

    expect(LOFT_N_SAMPLES).toBe(120);
    expect(LOFT_V_RINGS).toBe(36);

    // Etapa 1: 3 perfis concêntricos em Z=0 com is3DProfileCurve: true (não são engolidos como furos!)
    let rectBase = setEntityDirect3DParams(
      { ...rectPolyline({ x: 50, y: 50 }, { x: 150, y: 150 }, "corte", 0), id: "loft_rect_z0" },
      { is3DProfileCurve: true, extrudeHeightMm: 0 },
    );
    let hexMid = setEntityDirect3DParams(
      {
        ...regularPolygon({ x: 100, y: 100 }, 34, 6, 0, "corte"),
        id: "loft_hex_z60",
        isPolygon3D: true,
        polygonSides: 6,
      } as Entity,
      { is3DProfileCurve: true, extrudeHeightMm: 0 },
    );
    let circleTop = setEntityDirect3DParams(
      {
        id: "loft_circle_z120",
        layer: "corte",
        type: "circle",
        cx: 100,
        cy: 100,
        r: 42,
      },
      { is3DProfileCurve: true, extrudeHeightMm: 0 },
    );

    // Verifica que mesmo todos em Z=0 dentro do retângulo, os 3 perfis permanecem corpos 3D independentes e selecionáveis
    const sceneAtZ0 = buildDirectTopology3DScene([rectBase, hexMid, circleTop], 3.0);
    expect(sceneAtZ0.bodies.length).toBe(3);

    // Etapa 2: Elevação individual em +Z (Hexágono para Z=60 mm e Círculo para Z=120 mm)
    rectBase = setEntityElevationZ(rectBase, 0);
    hexMid = setEntityElevationZ(hexMid, 60);
    circleTop = setEntityElevationZ(circleTop, 120);

    const s1 = sampleProfileCrossSection3D(rectBase, LOFT_N_SAMPLES)!;
    const s2 = sampleProfileCrossSection3D(hexMid, LOFT_N_SAMPLES)!;
    const s3 = sampleProfileCrossSection3D(circleTop, LOFT_N_SAMPLES)!;
    expect(s1.points.length).toBe(120);
    expect(s2.points.length).toBe(120);
    expect(s3.points.length).toBe(120);
    expect(s1.elevationZ).toBe(0);
    expect(s2.elevationZ).toBe(60);
    expect(s3.elevationZ).toBe(120);

    // Etapa 3 & 4: Transição Loft 3D Suave (Catmull-Rom Cúbico) -> "Somente seções transversais"
    const loftMesh = buildLoft3DMesh([rectBase, hexMid, circleTop], {
      surfaceMode: "smooth",
      bodyMode: "solid",
      vRings: LOFT_V_RINGS,
    });
    expect(loftMesh).not.toBeNull();
    expect(loftMesh!.rings.length).toBe(LOFT_V_RINGS + 1);
    expect(loftMesh!.quads.length).toBe(LOFT_V_RINGS * LOFT_N_SAMPLES + 2 * LOFT_N_SAMPLES); // Faces laterais + Tampas superior e inferior

    // Verifica cintura côncava no meio (Z=60, raio do hexágono ~34mm < raio da base ~50mm e topo 42mm)
    const midRing = loftMesh!.rings[Math.floor(36 / 2)]!;
    const avgMidRadius =
      midRing.reduce((acc, pt) => acc + Math.hypot(pt.x - 100, pt.y - 100), 0) / midRing.length;
    expect(avgMidRadius).toBeGreaterThan(28);
    expect(avgMidRadius).toBeLessThan(36);

    const loftEntity = createLoft3DEntity([rectBase, hexMid, circleTop], "smooth", "solid", 3.0);
    expect(loftEntity).not.toBeNull();

    const finalScene = buildDirectTopology3DScene([loftEntity!], 3.0);
    expect(finalScene.bodies.length).toBe(1);
    const loftBody = finalScene.bodies[0]!;
    expect(loftBody.extrudeHeightMm).toBeCloseTo(120, 1);
    expect(loftBody.faces.length).toBeGreaterThanOrEqual(2);
    expect(loftBody.faces.every((f) => f.centroid && Number.isFinite(f.centroid.x))).toBe(true);
    expect(loftBody.edges.every((e) => e.midpoint && Number.isFinite(e.midpoint.x))).toBe(true);
    expect(finalScene.tessellatedShape.mesh.positions.length).toBeGreaterThan(1000);

    // Verifica também o modo Casca Oca (bodyMode === "shell")
    const shellLoftMesh = buildLoft3DMesh([rectBase, hexMid, circleTop], {
      surfaceMode: "smooth",
      bodyMode: "shell",
      wallThicknessMm: 3.0,
      vRings: LOFT_V_RINGS,
    });
    expect(shellLoftMesh).not.toBeNull();
    expect(shellLoftMesh!.innerRings?.length).toBe(LOFT_V_RINGS + 1);
  });

  it("16. Fase 0 Auditoria do Loft 3D (Base Quadrada ➔ Topo Circular): Continuidade C0 de normais na costura i=0, V - E + F = 2, Volume > 0 e Unfold 2D da Casca", async () => {
    const {
      buildLoft3DMesh,
      createLoft3DEntity,
      setEntityElevationZ,
      unfoldLoft3DShellToFlatPattern2D,
    } = await import("./cadLoft3DEngine");

    const sqBase = setEntityElevationZ(
      { ...rectPolyline({ x: 0, y: 0 }, { x: 100, y: 100 }, "corte", 0), id: "sq_base_z0" },
      0,
    );
    const circTop = setEntityElevationZ(
      {
        id: "circ_top_z100",
        layer: "corte",
        type: "circle",
        cx: 50,
        cy: 50,
        r: 40,
      },
      100,
    );

    const mesh = buildLoft3DMesh([sqBase, circTop], {
      surfaceMode: "smooth",
      bodyMode: "solid",
      vRings: 36,
    })!;
    expect(mesh).not.toBeNull();

    // 1. Sólido fechado (Watertight): V - E + F = 2 e Volume analítico > 0
    expect(mesh.eulerCharacteristic.isWatertight).toBe(true);
    expect(mesh.eulerCharacteristic.chi).toBe(2);
    expect(mesh.volumeMm3).toBeGreaterThan(500_000);

    // 2. Continuidade simétrica de normais na costura i=0 (entre i=119 e i=0 no meio da transição r=18)
    const sideQuadsRow18 = mesh.quads.filter((q) => !q.isCap && q.vRow === 18);
    expect(sideQuadsRow18.length).toBe(120);
    const quadFirst = sideQuadsRow18.find((q) => q.uCol === 0)!;
    const quadLast = sideQuadsRow18.find((q) => q.uCol === 119)!;
    // A normal direita do último quad (vn1/vn2) deve ser exatamente igual à normal esquerda do primeiro quad (vn0/vn3) na costura i=0
    expect(quadLast.vn1!.x).toBeCloseTo(quadFirst.vn0!.x, 5);
    expect(quadLast.vn1!.y).toBeCloseTo(quadFirst.vn0!.y, 5);
    expect(quadLast.vn1!.z).toBeCloseTo(quadFirst.vn0!.z, 5);

    // 3. Unfold 2D da Casca do Loft (Planificação por Triangulação em Verdadeira Grandeza)
    const loftEnt = createLoft3DEntity([sqBase, circTop], "ruled", "shell", 2.0)!;
    const unfolded = unfoldLoft3DShellToFlatPattern2D(loftEnt, {
      seamIndex: 0,
      thicknessMm: 2.0,
      kFactor: 0.33,
    });
    expect(unfolded).not.toBeNull();
    expect(unfolded!.panelCount).toBe(120);
    expect(unfolded!.developedWidthMm).toBeGreaterThan(250);
    expect(unfolded!.totalTrueAreaMm2).toBeGreaterThan(25_000);
    expect(unfolded!.flatEntities.some((e) => e.layer === "corte")).toBe(true);
    expect(unfolded!.flatEntities.some((e) => e.layer === "dobra")).toBe(true);
  });

  it("17. Pacote P1: Revolve 3D (90° e 360° + bloqueio de auto-interseção), Sweep 3D em Arco (validação de raio de curvatura) e Booleana 3D", async () => {
    const {
      applyDirectBoolean3DBetweenBodies,
      applyDirectRevolve3DToEntities,
      applyDirectSweep3DToEntities,
    } = await import("./chamfer3DMasterSuite");

    // Perfil afastado do eixo Y (x entre 20 e 50) -> Revolve 360° válido
    const revProfile = {
      ...rectPolyline({ x: 20, y: 0 }, { x: 50, y: 40 }, "corte", 0),
      id: "rev_prof_ok",
    };
    const rev360 = applyDirectRevolve3DToEntities([revProfile], ["rev_prof_ok"], {
      axis: "y",
      angleDeg: 360,
    });
    expect(rev360.validationError).toBeUndefined();
    // Volume Pappus-Guldinus: A = 30*40 = 1200 mm², R_centroid = 35 mm -> V = 2*pi*35*1200 ≈ 263,893.78 mm³
    expect(rev360.revolvedVolumeMm3).toBeCloseTo(2 * Math.PI * 35 * 1200, 0);

    // Revolve 90° deve ter exatamente 1/4 do volume de 360°
    const rev90 = applyDirectRevolve3DToEntities([revProfile], ["rev_prof_ok"], {
      axis: "y",
      angleDeg: 90,
    });
    expect(rev90.revolvedVolumeMm3).toBeCloseTo((2 * Math.PI * 35 * 1200) / 4, 0);

    // Perfil cruzando o eixo Y (x de -20 a +30) -> Deve bloquear auto-interseção
    const crossingProfile = {
      ...rectPolyline({ x: -20, y: 0 }, { x: 30, y: 40 }, "corte", 0),
      id: "rev_prof_cross",
    };
    const revCross = applyDirectRevolve3DToEntities([crossingProfile], ["rev_prof_cross"], {
      axis: "y",
      angleDeg: 360,
    });
    expect(revCross.validationError).toBeDefined();

    // Sweep 3D ao longo de arco 90° com R=120mm e perfil R=25mm -> Válido
    const arcPts = Array.from({ length: 7 }, (_, idx) => {
      const t = (idx / 6) * (Math.PI / 2);
      return { x: 120 * (1 - Math.cos(t)), y: 0, z: 120 * Math.sin(t) };
    });
    const sweepOk = applyDirectSweep3DToEntities([revProfile], ["rev_prof_ok"], {
      pathPoints3D: arcPts,
      profileRadiusMm: 25,
      wallThicknessMm: 3,
    });
    expect(sweepOk.validationError).toBeUndefined();
    expect(sweepOk.pathLengthMm).toBeCloseTo((Math.PI / 2) * 120, -1);

    // Sweep com raio de curvatura menor que o raio do perfil (R_arc=15 < r_prof=25) -> Bloqueado
    const tightArcPts = Array.from({ length: 7 }, (_, idx) => {
      const t = (idx / 6) * (Math.PI / 2);
      return { x: 15 * (1 - Math.cos(t)), y: 0, z: 15 * Math.sin(t) };
    });
    const sweepTight = applyDirectSweep3DToEntities([revProfile], ["rev_prof_ok"], {
      pathPoints3D: tightArcPts,
      profileRadiusMm: 25,
    });
    expect(sweepTight.validationError).toBeDefined();

    // Booleana 3D entre dois corpos que se cruzam
    const bodyA = setEntityDirect3DParams(
      { ...rectPolyline({ x: 0, y: 0 }, { x: 100, y: 100 }, "corte", 0), id: "bool_a" },
      { extrudeHeightMm: 100 },
    );
    const bodyB = setEntityDirect3DParams(
      { ...rectPolyline({ x: 50, y: 50 }, { x: 150, y: 150 }, "corte", 0), id: "bool_b" },
      { extrudeHeightMm: 100 },
    );
    const boolSub = applyDirectBoolean3DBetweenBodies([bodyA, bodyB], "bool_a", "bool_b", "subtract");
    expect(boolSub.intersectionVolumeMm3).toBeCloseTo(50 * 50 * 100, 0);
    expect(boolSub.resultingVolumeMm3).toBeCloseTo(1_000_000 - 250_000, 0);
  });

  it("18. Pacote P1: Furo Avançado (Escareado/Rebaixado/Cego em Face Inclinada), Section Plane X/Y/Z com Hachura e Array 3D", async () => {
    const {
      applyAdvancedHole3DToEntities,
      applyDirectArray3DToEntities,
      evaluateSectionPlane3DCrossSection,
    } = await import("./chamfer3DMasterSuite");

    let part = setEntityDirect3DParams(
      { ...rectPolyline({ x: 0, y: 0 }, { x: 100, y: 100 }, "corte", 0), id: "part_adv_hole" },
      { extrudeHeightMm: 80, miterCutTopDeg: 45 },
    );
    const scene0 = buildDirectTopology3DScene([part], 10);
    const inclinedTopFace = scene0.bodies[0]!.faces.find((f) => f.role === "top" || f.role === "miter")!;

    const holeRes = applyAdvancedHole3DToEntities([part], ["part_adv_hole"], {
      holeType: "countersink",
      threadSize: "M10",
      targetFace: inclinedTopFace,
    });
    expect(holeRes.createdHoleIds.length).toBe(1);
    expect(holeRes.holeSummary).toContain("COUNTERSINK M10");

    // Section Plane X=50 mm deve cortar o bloco 100×100×80 gerando seção transversal e linhas de hachura
    const secRes = evaluateSectionPlane3DCrossSection(scene0, {
      enabled: true,
      axis: "x",
      offsetMm: 50,
      flipDirection: false,
      showHatch: true,
    });
    expect(secRes.intersectedBodyIds).toContain(scene0.bodies[0]!.bodyId);
    expect(secRes.cutPolygons3D.length).toBe(1);
    expect(secRes.sectionAreaMm2).toBeGreaterThanOrEqual(100 * 80);
    expect(secRes.hatchSegments3D.length).toBeGreaterThan(3);

    // Array Polar 3D (6 cópias em 360°)
    const arrRes = applyDirectArray3DToEntities([part], ["part_adv_hole"], {
      mode: "polar",
      polarCount: 6,
      polarTotalAngleDeg: 360,
      polarCenter3D: { x: 200, y: 200, z: 0 },
    });
    expect(arrRes.createdIds.length).toBe(5);
    expect(arrRes.updatedEntities.length).toBe(6);
  });

  it("19. Pacote P2 (Estruturas Metálicas): Fórmula Exata de Meia-Esquadria 45° e Geração de Lista de Corte (Cut List + CSV)", async () => {
    const {
      computeExactMiterCutLength,
      generateStructuralCutListFrom3DScene,
    } = await import("./chamfer3DMasterSuite");

    // Metalon 100×50 com comprimento base 500 mm e corte 45° no topo e -45° na base
    const miter = computeExactMiterCutLength(500, 100, 45, -45);
    // tan(45°) = 1 -> delta = (100/2)*1 + (100/2)*1 = 100 mm -> L_maior = 600 mm, L_menor = 400 mm
    expect(miter.longPointLengthMm).toBeCloseTo(600, 1);
    expect(miter.shortPointLengthMm).toBeCloseTo(400, 1);

    // Testa na cena completa do benchmark de 10 passos (14 corpos)
    const benchmark = executeMetalStructure10StepBenchmark(10);
    const cutList = generateStructuralCutListFrom3DScene(benchmark.scene);
    expect(cutList.totalPieces).toBe(14);
    expect(cutList.rows.length).toBeGreaterThanOrEqual(3);
    expect(cutList.totalMassKg).toBeGreaterThan(20);
    expect(cutList.csvContent).toContain("Item;Perfil;Qtd;Comp_Maior_mm");
  });

  it("20. Pacote P3 (Chapa Metálica e Caldeiraria): Fórmulas de Referência Exatas (Tolerância <= 0.1%) e Demo Chapa 3D", async () => {
    const {
      computeExactBendAllowance,
      computePipeSaddleDevelopment,
      computeTruncatedConeDevelopment,
      executeDemoChapaCaldeiraria3D,
    } = await import("./chamfer3DMasterSuite");

    // 1. Dobra 90° em Chapa 2.0 mm, Raio Interno R = 2.0 mm, Fator K = 0.33 -> BA ≈ 4.178 mm
    const ba = computeExactBendAllowance(90, 2.0, 2.0, 0.33);
    expect(ba.bendAllowanceMm).toBeCloseTo(4.178, 2);

    // 2. Tronco de Cone Concêntrico: D1 = 400 mm, D2 = 200 mm, H = 300 mm
    // G ≈ 316.23 mm, R1 ≈ 632.46 mm, R2 ≈ 316.23 mm, α ≈ 113.84°
    const cone = computeTruncatedConeDevelopment(400, 200, 300, 2.0);
    expect(cone.slantHeightGMm).toBeCloseTo(316.23, 1);
    expect(cone.outerRadiusR1Mm).toBeCloseTo(632.46, 1);
    expect(cone.innerRadiusR2Mm).toBeCloseTo(316.23, 1);
    expect(cone.sectorAngleDeg).toBeCloseTo(113.84, 1);
    expect(cone.flatPatternEntities.length).toBeGreaterThanOrEqual(4);

    // 3. Boca de Lobo (Pipe Saddle): Tubo ramal Ø101.6 mm em tubo coletor Ø152.4 mm a 90°
    const saddle = computePipeSaddleDevelopment(152.4, 101.6, 200, 90, 36);
    expect(saddle.circumferenceMm).toBeCloseTo(Math.PI * 101.6, 1);
    expect(saddle.maxSaddleDepthMm).toBeGreaterThan(15);
    expect(saddle.flatEntities.some((e) => e.layer === "corte")).toBe(true);

    // 4. Demo Chapa 3D completa (3D + Planificação 2D com layers CORTE, DOBRA, FUROS, ANOTAÇÕES)
    const demoChapa = executeDemoChapaCaldeiraria3D(2.0, 2.0, 0.33);
    expect(demoChapa.bendAllowanceMm).toBeCloseTo(4.178, 2);
    expect(demoChapa.entities3D.length).toBeGreaterThanOrEqual(4);
    expect(demoChapa.flatPatternEntities2D.some((e) => e.layer === "corte")).toBe(true);
    expect(demoChapa.flatPatternEntities2D.some((e) => e.layer === "dobra")).toBe(true);
  });

  it("21. Pacotes P4–P7: Inspeção de Interferência / Folga Mínima, Vista Explodida e Matriz Unificada de Capacidades", async () => {
    const {
      CHAMFER_3D_CAPABILITY_MATRIX,
      PROGRESSIVE_CAD_3D_CATEGORIES,
      applyExplodedView3DToEntities,
      runAssemblyInterferenceAndClearanceCheck,
    } = await import("./chamfer3DMasterSuite");

    expect(PROGRESSIVE_CAD_3D_CATEGORIES.length).toBe(8);
    expect(CHAMFER_3D_CAPABILITY_MATRIX.length).toBeGreaterThanOrEqual(20);
    expect(CHAMFER_3D_CAPABILITY_MATRIX.every((c) => c.automatedTestPassed)).toBe(true);

    const benchmark = executeMetalStructure10StepBenchmark(10);
    const check = runAssemblyInterferenceAndClearanceCheck(benchmark.scene);
    expect(check.pairs.length).toBeGreaterThan(10);
    expect(Number.isFinite(check.minClearanceMm)).toBe(true);

    const exploded = applyExplodedView3DToEntities(benchmark.entities, 0.5);
    expect(exploded.length).toBe(benchmark.entities.length);
  });
});



