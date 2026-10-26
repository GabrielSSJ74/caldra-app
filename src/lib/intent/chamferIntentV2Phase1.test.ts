import { describe, it, expect } from "vitest";
import { uid, type Entity } from "@/lib/lab2d/core";
import {
  CHAMFER_DSL_V2_FUNCTION_DECLARATIONS,
  CHAMFER_DSL_V2_VERSION,
  CHAMFER_REAL_INVENTORY,
  CHAMFER_TOOL_REGISTRY_V2,
  PART_MODEL_MAX_DETAILED_ENTITIES,
  buildPartModelFromCanvas,
  computeTypedHolePatternCenters,
  createExecutionSandbox,
  executeDslV2ToolCallsBatch,
  executeSingleDslV2Tool,
  resolveTargetEntityIds,
} from "./index";

describe("CHAMFER INTENT 2.0 — Fase 1 (Claude): Inventário, Schemas DSL v2, PartModel e ToolRegistryV2", () => {
  describe("1. Inventário Real do CHAMFER e Catálogo de Ferramentas DSL v2 (§0, §2 e §6)", () => {
    it("Expõe o inventário completo e verificado de entidades, camadas, cotas, snaps e exportadores do CHAMFER", () => {
      expect(CHAMFER_DSL_V2_VERSION).toBe("2.0.0");
      expect(CHAMFER_REAL_INVENTORY.entityTypes).toEqual([
        "line",
        "polyline",
        "circle",
        "arc",
        "ellipse",
        "point",
        "hatch",
        "path",
        "text",
      ]);
      expect(CHAMFER_REAL_INVENTORY.layers.map((l) => l.id)).toContain("corte");
      expect(CHAMFER_REAL_INVENTORY.layers.map((l) => l.id)).toContain("dobra");
      expect(CHAMFER_REAL_INVENTORY.layers.map((l) => l.id)).toContain("referencia");
      expect(CHAMFER_REAL_INVENTORY.layers.map((l) => l.id)).toContain("cota");
      expect(CHAMFER_REAL_INVENTORY.dimensionKinds.length).toBe(14);
      expect(CHAMFER_REAL_INVENTORY.snapKinds).toContain("end");
      expect(CHAMFER_REAL_INVENTORY.snapKinds).toContain("center");
      expect(CHAMFER_REAL_INVENTORY.snapKinds).toContain("tangent");
      expect(CHAMFER_REAL_INVENTORY.exportFormats).toEqual(["dxf", "svg", "pdf", "json"]);
      expect(CHAMFER_REAL_INVENTORY.supportsUndoRedo).toBe(true);
    });

    it("Registra todas as 46 ferramentas das 8 famílias da especificação §6.1–§6.8", () => {
      expect(CHAMFER_DSL_V2_FUNCTION_DECLARATIONS.length).toBe(46);
      const registeredNames = Object.keys(CHAMFER_TOOL_REGISTRY_V2);
      expect(registeredNames.length).toBe(46);
      expect(registeredNames).toContain("create_plate");
      expect(registeredNames).toContain("add_holes");
      expect(registeredNames).toContain("add_cutout");
      expect(registeredNames).toContain("develop_cylinder");
      expect(registeredNames).toContain("develop_cone");
      expect(registeredNames).toContain("develop_square_to_round");
      expect(registeredNames).toContain("develop_pipe_branch");
      expect(registeredNames).toContain("develop_mitered_bend");
      expect(registeredNames).toContain("create_gusset");
      expect(registeredNames).toContain("bend_allowance");
      expect(registeredNames).toContain("edit_feature");
      expect(registeredNames).toContain("check_manufacturing");
      expect(registeredNames).toContain("estimate_weight");
      expect(registeredNames).toContain("declare_assumptions");
      expect(registeredNames).toContain("ask_clarification");
      expect(registeredNames).toContain("report_unsupported");
    });
  });

  describe("2. PartModel — Estado Vivo, Reconciliação de Edições Manuais e Compressão >200 Entidades (§3.3)", () => {
    it("Constrói o PartModel vivo e reconcilia automaticamente edições manuais feitas no canvas", () => {
      const sandbox = createExecutionSandbox({});
      const report = executeDslV2ToolCallsBatch(
        [
          {
            id: "call_1",
            name: "create_plate",
            args: { id: "plate_1", width: 400, height: 250, corner_radius: 20, corners: "all" },
          },
          {
            id: "call_2",
            name: "add_holes",
            args: {
              id: "holes_1",
              parent: "plate_1",
              d: 12,
              pattern: "line",
              count: 5,
              axis: "x",
              distribution: "equal_division",
            },
          },
        ],
        sandbox,
      );

      expect(report.ok).toBe(true);
      const pm1 = report.finalState.partModel;
      expect(pm1.bbox).toEqual([0, 0, 400, 250]);
      const plateSummary = pm1.entities.find((e) => e.id === "plate_1");
      expect(plateSummary).toBeDefined();
      expect(plateSummary?.params.w).toBe(400);
      expect(plateSummary?.params.h).toBe(250);

      const holesSummary = pm1.entities.find((e) => e.id === "holes_1");
      expect(holesSummary).toBeDefined();
      expect(holesSummary?.params.count).toBe(5);
      expect(holesSummary?.params.d).toBe(12);
      expect(holesSummary?.derived?.centers).toEqual([
        [40, 125],
        [120, 125],
        [200, 125],
        [280, 125],
        [360, 125],
      ]);

      // Simula edição manual direta no canvas (usuário alterou o raio dos furos para r=9 -> Ø18)
      const manuallyEditedEntities = report.finalState.entities.map((e) =>
        e.type === "circle" ? { ...e, r: 9 } : e,
      );
      const pmAfterManualEdit = buildPartModelFromCanvas({
        entities: manuallyEditedEntities,
        dimensions: report.finalState.dimensions,
        session: report.finalState.session,
      });
      const updatedHoles = pmAfterManualEdit.entities.find((e) => e.id === "holes_1");
      expect(updatedHoles?.params.d).toBe(18);
    });

    it("Comprime desenhos com mais de 200 entidades preservando seleção e últimas 30 entidades em detalhe (§3.3)", () => {
      const manyCircles: Entity[] = Array.from({ length: 240 }, (_, i) => ({
        id: `c_${i + 1}`,
        layer: "corte",
        type: "circle",
        cx: (i % 20) * 15,
        cy: Math.floor(i / 20) * 15,
        r: 4,
      }));

      const pm = buildPartModelFromCanvas({
        entities: manyCircles,
        selectedEntityIds: ["c_1", "c_2"],
      });

      expect(manyCircles.length).toBeGreaterThan(PART_MODEL_MAX_DETAILED_ENTITIES);
      // 2 selecionadas + 30 recentes = 32 entidades detalhadas; as outras 208 ficam em overflowGroups
      expect(pm.entities.length).toBe(32);
      expect(pm.overflowGroups).toBeDefined();
      expect(pm.overflowGroups![0]!.count).toBe(208);
      expect(pm.entities.some((e) => e.id === "c_1")).toBe(true);
      expect(pm.entities.some((e) => e.id === "c_240")).toBe(true);
    });

    it("Resolve seletores contextuais (@id, selection, last_created, all_holes, outer_contour)", () => {
      const sandbox = createExecutionSandbox({});
      const batch = executeDslV2ToolCallsBatch(
        [
          { id: "c1", name: "create_plate", args: { id: "plate_1", width: 300, height: 200 } },
          {
            id: "c2",
            name: "add_holes",
            args: { id: "holes_1", parent: "plate_1", d: 10, pattern: "corners", margin: 20 },
          },
        ],
        sandbox,
      );

      const state = batch.finalState;
      const holeIds = resolveTargetEntityIds("all_holes", state.partModel, state.entities);
      expect(holeIds.length).toBe(4);

      const byAtToken = resolveTargetEntityIds("@holes_1", state.partModel, state.entities);
      expect(byAtToken.length).toBe(4);

      const contourIds = resolveTargetEntityIds("outer_contour", state.partModel, state.entities);
      expect(contourIds.length).toBe(1);
    });
  });

  describe("3. Matemática Determinística dos 8 Padrões de Furação de add_holes (§6.3)", () => {
    const hostBounds = { minX: 0, minY: 0, width: 400, height: 250 };

    it("Calcula pattern='corners' exatamente nos 4 cantos (nunca em linha)", () => {
      const res = computeTypedHolePatternCenters(
        { d: 12, pattern: "corners", margin_x: 25, margin_y: 25 },
        hostBounds,
      );
      expect(res.errors).toEqual([]);
      expect(res.centers).toEqual([
        { x: 25, y: 25 },
        { x: 375, y: 25 },
        { x: 375, y: 225 },
        { x: 25, y: 225 },
      ]);
    });

    it("Calcula pattern='line' nas 4 distribuições (equal_division, between_ends, fixed_pitch, equal_gap_including_edges)", () => {
      // 1. equal_division (§6): N segmentos iguais, x_i = (i+0.5)*L/N -> p = 400 / 5 = 80
      const eqDiv = computeTypedHolePatternCenters(
        { d: 12, pattern: "line", count: 5, axis: "x", distribution: "equal_division" },
        hostBounds,
      );
      expect(eqDiv.computedPitch).toBeCloseTo(80, 3);
      expect(eqDiv.centers.length).toBe(5);
      expect(eqDiv.centers.map((c) => c.x)).toEqual([40, 120, 200, 280, 360]);

      // 2. between_ends com end_margin = 40: p = (400 - 80) / 4 = 80
      const betEnds = computeTypedHolePatternCenters(
        {
          d: 12,
          pattern: "line",
          count: 5,
          axis: "x",
          distribution: "between_ends",
          end_margin: 40,
        },
        hostBounds,
      );
      expect(betEnds.computedPitch).toBeCloseTo(80, 4);
      expect(betEnds.centers.map((c) => c.x)).toEqual([40, 120, 200, 280, 360]);

      // 3. fixed_pitch com pitch = 50: centrado em x = 200 -> [100, 150, 200, 250, 300]
      const fixedP = computeTypedHolePatternCenters(
        { d: 12, pattern: "line", count: 5, axis: "x", distribution: "fixed_pitch", pitch: 50 },
        hostBounds,
      );
      expect(fixedP.centers.map((c) => c.x)).toEqual([100, 150, 200, 250, 300]);

      // 4. equal_gap_including_edges: gap = (400 - 5*16)/6 = 320/6 = 53.3333
      const eqGap = computeTypedHolePatternCenters(
        {
          d: 16,
          pattern: "line",
          count: 5,
          axis: "x",
          distribution: "equal_gap_including_edges",
        },
        hostBounds,
      );
      expect(eqGap.centers.length).toBe(5);
      expect(eqGap.centers[0]!.x).toBeCloseTo(53.3333 + 8, 3);
    });

    it("Calcula pattern='grid', 'bolt_circle', 'along_edge' e 'perimeter'", () => {
      const gridRes = computeTypedHolePatternCenters(
        { d: 10, pattern: "grid", cols: 3, rows: 2, margin_x: 50, margin_y: 50 },
        hostBounds,
      );
      expect(gridRes.centers.length).toBe(6);

      const pcdRes = computeTypedHolePatternCenters(
        { d: 14, pattern: "bolt_circle", count: 6, pcd: 160 },
        hostBounds,
      );
      expect(pcdRes.centers.length).toBe(6);

      const edgeRes = computeTypedHolePatternCenters(
        { d: 10, pattern: "along_edge", edge: "top", count: 4, edge_offset: 20, end_margin: 30 },
        hostBounds,
      );
      expect(edgeRes.centers.length).toBe(4);
      expect(edgeRes.centers.every((c) => c.y === 230)).toBe(true);

      const perimRes = computeTypedHolePatternCenters(
        { d: 10, pattern: "perimeter", cols: 3, rows: 3, margin: 25 },
        hostBounds,
      );
      // Perímetro de grade 3x3 = 8 furos na borda (sem o furo central)
      expect(perimRes.centers.length).toBe(8);
    });
  });

  describe("4. Execução Dry-Run de Caldeiraria, DFM, Estimativa de Peso e Modificação", () => {
    it("Executa ferramentas de caldeiraria, cálculo de dobra (bend_allowance), DFM e peso líquido", () => {
      const sandbox = createExecutionSandbox({ thickness: 10, material: "steel_1020" });

      const batch = executeDslV2ToolCallsBatch(
        [
          { id: "1", name: "create_plate", args: { id: "plate_1", width: 500, height: 300, thickness: 10 } },
          {
            id: "2",
            name: "add_holes",
            args: { id: "holes_1", parent: "plate_1", d: 8, pattern: "corners", margin: 25 },
          },
          {
            id: "3",
            name: "check_manufacturing",
            args: { process: "laser", thickness: 10 },
          },
          {
            id: "4",
            name: "estimate_weight",
            args: { material: "steel_1020", thickness: 10, quantity: 2 },
          },
          {
            id: "5",
            name: "bend_allowance",
            args: { thickness: 6, inside_radius: 6, angle_deg: 90, k_factor: 0.44 },
          },
        ],
        sandbox,
      );

      expect(batch.ok).toBe(true);
      // Furo Ø8 mm < espessura 10 mm deve gerar alerta DFM para corte laser
      expect(batch.allWarnings.some((w) => w.includes("DFM [LASER]"))).toBe(true);

      const weightResult = batch.results.find((r) => r.tool === "estimate_weight");
      expect(weightResult?.data?.unitWeightKg).toBeGreaterThan(11);
      expect(weightResult?.data?.totalWeightKg).toBeCloseTo(
        Number(weightResult?.data?.unitWeightKg) * 2,
        2,
      );

      const bendResult = batch.results.find((r) => r.tool === "bend_allowance");
      expect(bendResult?.data?.bendAllowanceMm).toBeCloseTo(13.572, 2);
    });
  });
});
