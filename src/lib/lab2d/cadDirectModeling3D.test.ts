import { describe, expect, it } from "vitest";
import { rectPolyline, type Entity } from "./core";
import { computeWorkplaneOrbitProjection2D } from "./orbit3dController";
import {
  applyDirectTransform3DToEntities,
  buildDirectTopology3DScene,
  formatSubElementTelemetry3D,
  getEntityDirect3DParams,
  hitTestSubElement3DInScreenSpace,
  projectPoint3DToCanvasViewMm,
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
});
