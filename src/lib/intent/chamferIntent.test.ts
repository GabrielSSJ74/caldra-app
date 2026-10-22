import { describe, it, expect } from "vitest";
import type { Entity } from "@/lib/lab2d/core";
import type { Dimension } from "@/lib/lab2d/dimensions";
import {
  CHAMFER_INTENT_SCHEMA_VERSION,
  CHAMFER_COMMAND_REGISTRY,
  ChamferGeometricExecutionEngine,
  ChamferIntentInterpreter,
  ChamferTransactionManager,
  ChamferValidationEngine,
  normalizeNaturalLanguageNumbers,
  parseCornerSelector,
  parseDistanceMeasurementMode,
  toMillimeters,
} from "./index";
import { evaluateLivePlateValidation } from "@/components/lab2d/ChamferLiveMiniViewport";

describe("CHAMFER Intent — Compilador Geométrico Paramétrico por Linguagem Natural", () => {
  // ===========================================================================
  // 15.1 TESTES DE INTERPRETAÇÃO, UNIDADES E AMBIGUIDADE
  // ===========================================================================
  describe("15.1 Interpretação Semântica, Unidades e Detecção de Ambiguidade", () => {
    it("Converte unidades explícitas e expressões coloquiais (mm, cm, m, pol, extenso) para mm", () => {
      expect(toMillimeters(500, "mm")).toBe(500);
      expect(toMillimeters(25, "cm")).toBe(250);
      expect(toMillimeters(1.2, "m")).toBe(1200);
      expect(toMillimeters(2, "in")).toBeCloseTo(50.8, 3);

      const normalized = normalizeNaturalLanguageNumbers(
        "Chapa de meio metro por 25 centímetros com quatro furos de doze e raio vinte",
      );
      expect(normalized).toContain("500 mm");
      expect(normalized).toContain("250 mm");
      expect(normalized).toContain("4 furos");
      expect(normalized).toContain("12");
      expect(normalized).toContain("20");

      const plan = ChamferIntentInterpreter.compilePrompt(
        "Chapa de meio metro por 25 centímetros com quatro furos de doze nos cantos a 30 mm das bordas e raio vinte",
      );
      expect(plan.schema_version).toBe(CHAMFER_INTENT_SCHEMA_VERSION);
      expect(plan.parameters.width).toBe(500);
      expect(plan.parameters.height).toBe(250);
      expect(plan.parameters.hole_count).toBe(4);
      expect(plan.parameters.hole_diameter).toBe(12);
      expect(plan.parameters.corner_radius).toBe(20);
      expect(plan.validation.status).toBe("valid");
    });

    it("Distingue medição centro-borda vs borda-externa-do-furo à borda da chapa (Seção 7)", () => {
      expect(parseDistanceMeasurementMode("furos a 25 mm das bordas")).toBe("center_to_edge");
      expect(parseDistanceMeasurementMode("borda externa do furo a 25 mm da borda")).toBe(
        "outer_edge_to_edge",
      );

      const planCenter = ChamferIntentInterpreter.compilePrompt(
        "Chapa 500 x 300 com 4 furos de 12 mm nos cantos a 25 mm das bordas",
      );
      const firstHoleCenter = planCenter.compiled?.previewEntities.find(
        (e) => e.type === "circle" && e.layer === "corte",
      ) as Extract<Entity, { type: "circle" }>;
      expect(firstHoleCenter.cx).toBe(25);
      expect(firstHoleCenter.cy).toBe(25);

      const planOuter = ChamferIntentInterpreter.compilePrompt(
        "Chapa 500 x 300 com 4 furos de 12 mm nos cantos com borda externa do furo a 25 mm das bordas",
      );
      const firstHoleOuter = planOuter.compiled?.previewEntities.find(
        (e) => e.type === "circle" && e.layer === "corte",
      ) as Extract<Entity, { type: "circle" }>;
      // m_center = m_edge + r = 25 + 6 = 31 mm
      expect(firstHoleOuter.cx).toBe(31);
      expect(firstHoleOuter.cy).toBe(31);
    });

    it("Detecta ambiguidade no Exemplo da Seção 8.2: 'chapa de 400 por 250 mm com cantos arredondados de raio 20 e cinco furos centrais de 12 mm, divididos igualmente'", () => {
      const plan = ChamferIntentInterpreter.compilePrompt(
        "Faça uma chapa de 400 por 250 mm com cantos arredondados de raio 20 e cinco furos centrais de 12 mm, divididos igualmente.",
      );

      expect(plan.parameters.width).toBe(400);
      expect(plan.parameters.height).toBe(250);
      expect(plan.parameters.corner_radius).toBe(20);
      expect(plan.parameters.hole_count).toBe(5);
      expect(plan.parameters.hole_diameter).toBe(12);

      // Deve sinalizar needs_clarification e oferecer opções claras para o padrão dos 5 furos
      expect(plan.validation.status).toBe("needs_clarification");
      expect(plan.unresolved.length).toBeGreaterThan(0);
      const holeAmb = plan.unresolved.find((u) => u.id === "amb_hole_distribution");
      expect(holeAmb).toBeDefined();
      expect(holeAmb!.options.some((o) => o.patch.hole_distribution === "linear_centerline_x")).toBe(
        true,
      );
      expect(holeAmb!.options.some((o) => o.patch.hole_distribution === "circular_pcd")).toBe(true);

      // Se o usuário escolher "Em círculo (PCD)" sem informar o diâmetro PCD, deve pedir o PCD!
      const pcdPlanWithoutDiameter = ChamferIntentInterpreter.compilePrompt(
        "Faça uma chapa de 400 por 250 mm com cantos arredondados de raio 20 e cinco furos centrais de 12 mm, divididos igualmente.",
        {
          parameterOverrides: { hole_distribution: "circular_pcd" },
        },
      );
      expect(pcdPlanWithoutDiameter.validation.status).toBe("needs_clarification");
      expect(
        pcdPlanWithoutDiameter.unresolved.some((u) => u.id === "amb_missing_pcd_diameter"),
      ).toBe(true);

      // Quando o diâmetro PCD (ex: 160 mm) é informado, o plano se torna 100% válido!
      const pcdPlanResolved = ChamferIntentInterpreter.compilePrompt(
        "Faça uma chapa de 400 por 250 mm com cantos arredondados de raio 20 e cinco furos centrais de 12 mm, divididos igualmente.",
        {
          parameterOverrides: { hole_distribution: "circular_pcd", pcd: 160 },
        },
      );
      expect(pcdPlanResolved.validation.status).toBe("valid");
      expect(pcdPlanResolved.unresolved.length).toBe(0);
    });

    it("Não inventa parâmetros quando o comando é vago ou incompleto", () => {
      const vaguePlan = ChamferIntentInterpreter.compilePrompt("Crie uma peça qualquer");
      expect(vaguePlan.validation.status).toBe("needs_clarification");
      expect(vaguePlan.unresolved.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // 15.2 TESTES MATEMÁTICOS, GEOMÉTRICOS E VALIDAÇÃO TOPOLÓGICA
  // ===========================================================================
  describe("15.2 Matemática Geométrica e Motor de Restrições (Seções 2.5 e 9)", () => {
    it("9.1 Calcula exatamente as 3 fórmulas de distribuição linear de furos", () => {
      // Fórmula 1: Comprimento útil L=300 e N=4 furos -> p = 300 / 3 = 100
      const f1 = ChamferGeometricExecutionEngine.computeLinearPositionsFromSpan(50, 300, 4);
      expect(f1.pitch).toBeCloseTo(100, 5);
      expect(f1.positions).toEqual([50, 150, 250, 350]);

      // Fórmula 2: Largura W=400, margem m=40, N=5 furos -> p = (400 - 80)/4 = 80
      const f2 = ChamferGeometricExecutionEngine.computeLinearPositionsWithMargin(0, 400, 40, 5);
      expect(f2.pitch).toBeCloseTo(80, 5);
      expect(f2.positions).toEqual([40, 120, 200, 280, 360]);

      // Fórmula 3: Largura W=360, subdivisão igual com bordas N=5 -> p = 360 / (5 + 1) = 60
      const f3 = ChamferGeometricExecutionEngine.computeLinearPositionsEqualSubdivision(0, 360, 5);
      expect(f3.pitch).toBeCloseTo(60, 5);
      expect(f3.positions).toEqual([60, 120, 180, 240, 300]);
    });

    it("9.2 Calcula exatamente a distribuição circular de furos em PCD", () => {
      const centers = ChamferGeometricExecutionEngine.computeCircularPcdCenters(
        { x: 200, y: 125 },
        160, // R_pcd = 80
        4,
        0,
      );
      expect(centers.length).toBe(4);
      expect(centers[0]).toEqual({ x: 280, y: 125 });
      expect(centers[1]).toEqual({ x: 200, y: 205 });
      expect(centers[2]).toEqual({ x: 120, y: 125 });
      expect(centers[3]).toEqual({ x: 200, y: 45 });
    });

    it("9.3 Aplica arredondamento seletivo ou uniforme de cantos (left_two, right_two, all)", () => {
      expect(parseCornerSelector("Arredonde somente os dois cantos esquerdos")).toBe("left_two");
      expect(parseCornerSelector("Arredonde os dois cantos direitos")).toBe("right_two");

      const radiiLeft = ChamferGeometricExecutionEngine.resolveCornerRadii(25, "left_two");
      expect(radiiLeft).toEqual({
        top_left: 25,
        bottom_left: 25,
        top_right: 0,
        bottom_right: 0,
      });

      const contour = ChamferGeometricExecutionEngine.createPlateContourEntity(
        { x: 0, y: 0 },
        400,
        250,
        radiiLeft,
        "corte",
        0,
        "left_two",
      );
      expect(contour.type).toBe("polyline");
      if (contour.type === "polyline") {
        // Os dois cantos direitos devem permanecer retos em (400, 0) e (400, 250)
        expect(contour.pts.some((p) => p.x === 400 && p.y === 0)).toBe(true);
        expect(contour.pts.some((p) => p.x === 400 && p.y === 250)).toBe(true);
        // Os cantos esquerdos foram arredondados, logo (0,0) e (0,250) não são vértices agudos
        expect(contour.pts.some((p) => p.x === 0 && p.y === 0)).toBe(false);
        expect(contour.pts.some((p) => p.x === 0 && p.y === 250)).toBe(false);
      }
    });

    it("Valida e bloqueia raio de canto impossível R > min(W, H) / 2", () => {
      const plan = ChamferIntentInterpreter.compilePrompt(
        "Chapa de 200 por 100 mm com cantos arredondados de raio 60",
      );
      expect(plan.validation.status).toBe("invalid");
      expect(
        plan.validation.issues.some((i) => i.code === "CORNER_RADIUS_EXCEEDS_HALF_SIDE"),
      ).toBe(true);
    });

    it("Valida e bloqueia furos fora dos limites da chapa e colisão entre furos", () => {
      // Furo fora da chapa
      const outReport = ChamferValidationEngine.validatePlate({
        width: 200,
        height: 100,
        cornerRadii: { top_left: 0, top_right: 0, bottom_right: 0, bottom_left: 0 },
        holes: [{ id: "h1", cx: 210, cy: 50, r: 10 }],
      });
      expect(outReport.status).toBe("invalid");
      expect(outReport.issues.some((i) => i.code === "HOLE_OUTSIDE_BOUNDARY")).toBe(true);

      // Colisão entre dois furos sobrepostos
      const collisionReport = ChamferValidationEngine.validatePlate({
        width: 400,
        height: 200,
        cornerRadii: { top_left: 0, top_right: 0, bottom_right: 0, bottom_left: 0 },
        holes: [
          { id: "h1", cx: 100, cy: 100, r: 15 },
          { id: "h2", cx: 120, cy: 100, r: 15 }, // dist=20 <= r1+r2=30
        ],
      });
      expect(collisionReport.status).toBe("invalid");
      expect(collisionReport.issues.some((i) => i.code === "HOLE_COLLISION")).toBe(true);
    });
  });

  // ===========================================================================
  // 15.3 TESTES DE INTEGRAÇÃO, CONTINUIDADE MULTI-TURNO, UNDO E IDEMPOTÊNCIA
  // ===========================================================================
  describe("15.3 Integração CHAMFER CAD, Continuidade Multi-Turno e Transações (Seções 10 e 13)", () => {
    it("Executa fluxo multi-turno completo preservando entidades não relacionadas, histórico Undo e idempotência", () => {
      // Entidade pré-existente não relacionada que jamais deve ser apagada
      const existingUnrelatedLine: Entity = {
        id: "unrelated_line_1",
        layer: "referencia",
        type: "line",
        x1: -100,
        y1: -100,
        x2: -50,
        y2: -100,
      };

      let canvasEntities: Entity[] = [existingUnrelatedLine];
      let canvasDimensions: Dimension[] = [];
      let selectedIds: string[] = [];
      const historyStack: Entity[][] = [];

      const commitEntities = (next: Entity[] | ((prev: Entity[]) => Entity[])) => {
        historyStack.push(canvasEntities);
        canvasEntities = typeof next === "function" ? next(canvasEntities) : next;
      };
      const setDimensions = (next: Dimension[] | ((prev: Dimension[]) => Dimension[])) => {
        canvasDimensions = typeof next === "function" ? next(canvasDimensions) : next;
      };
      const triggerUndo = () => {
        const last = historyStack.pop();
        if (last) canvasEntities = last;
      };

      const tx = new ChamferTransactionManager();

      // TURNO 1: Criar chapa 400 x 250 com 4 furos Ø12 nos cantos a 25 mm das bordas e raio 20
      const plan1 = ChamferIntentInterpreter.compilePrompt(
        "Crie uma chapa de 400 por 250 mm com cantos arredondados de raio 20 e 4 furos de 12 mm nos cantos a 25 mm das bordas",
        {
          existingEntities: canvasEntities,
          session: tx.getSession(),
        },
      );
      expect(plan1.validation.status).toBe("valid");

      const res1 = tx.commitPlan(plan1, {
        commitEntities,
        setDimensions,
        setSelection: (ids) => {
          selectedIds = ids;
        },
      });
      expect(res1.committed).toBe(true);
      // 1 linha não relacionada + 1 chapa + 4 furos = 6 entidades
      expect(canvasEntities.length).toBe(6);
      expect(canvasEntities.some((e) => e.id === "unrelated_line_1")).toBe(true);
      expect(canvasDimensions.length).toBe(2);

      // TESTE DE IDEMPOTÊNCIA: Tentar aplicar o mesmo plan1 duas vezes deve ser bloqueado
      const dupRes = tx.commitPlan(plan1, { commitEntities });
      expect(dupRes.committed).toBe(false);
      expect(dupRes.reason).toBe("DUPLICATE_PLAN_ID");
      expect(canvasEntities.length).toBe(6);

      // TURNO 2: "Agora aumente esses furos para 16 mm"
      const plan2 = ChamferIntentInterpreter.compilePrompt(
        "Agora aumente esses furos para 16 mm",
        {
          existingEntities: canvasEntities,
          selectedEntityIds: selectedIds,
          session: tx.getSession(),
        },
      );
      expect(plan2.validation.status).toBe("valid");
      expect(plan2.parameters.hole_diameter).toBe(16);

      const res2 = tx.commitPlan(plan2, {
        commitEntities,
        setDimensions,
        setSelection: (ids) => {
          selectedIds = ids;
        },
      });
      expect(res2.committed).toBe(true);
      const holesAfterTurn2 = canvasEntities.filter(
        (e): e is Extract<Entity, { type: "circle" }> => e.type === "circle",
      );
      expect(holesAfterTurn2.length).toBe(4);
      expect(holesAfterTurn2.every((h) => h.r === 8)).toBe(true); // Ø16 -> r=8

      // TURNO 3: "Aumente a chapa para 600 mm de largura"
      const plan3 = ChamferIntentInterpreter.compilePrompt(
        "Aumente a chapa para 600 mm de largura",
        {
          existingEntities: canvasEntities,
          selectedEntityIds: selectedIds,
          session: tx.getSession(),
        },
      );
      expect(plan3.validation.status).toBe("valid");
      expect(plan3.parameters.width).toBe(600);
      expect(plan3.parameters.height).toBe(250);
      tx.commitPlan(plan3, { commitEntities, setDimensions });
      expect(tx.getSession().activeFeature?.width).toBe(600);

      // TURNO 4: "Adicione mais dois furos com o mesmo espaçamento"
      const plan4 = ChamferIntentInterpreter.compilePrompt(
        "Adicione mais dois furos com o mesmo espaçamento",
        {
          existingEntities: canvasEntities,
          session: tx.getSession(),
        },
      );
      expect(plan4.validation.status).toBe("valid");
      expect(plan4.parameters.hole_count).toBe(6);
      tx.commitPlan(plan4, { commitEntities, setDimensions });
      expect(canvasEntities.filter((e) => e.type === "circle" && e.layer === "corte").length).toBe(
        6,
      );

      // TURNO 5: "Arredonde somente os dois cantos esquerdos"
      const plan5 = ChamferIntentInterpreter.compilePrompt(
        "Arredonde somente os dois cantos esquerdos com raio 25",
        {
          existingEntities: canvasEntities,
          session: tx.getSession(),
        },
      );
      expect(plan5.validation.status).toBe("valid");
      expect(plan5.parameters.corner_selector).toBe("left_two");
      tx.commitPlan(plan5, { commitEntities, setDimensions });
      expect(tx.getSession().activeFeature?.cornerRadii).toEqual({
        top_left: 25,
        bottom_left: 25,
        top_right: 0,
        bottom_right: 0,
      });

      // TURNO 6: "Espelhe o conjunto em relação ao eixo vertical"
      const plan6 = ChamferIntentInterpreter.compilePrompt(
        "Espelhe o conjunto em relação ao eixo vertical",
        {
          existingEntities: canvasEntities,
          session: tx.getSession(),
        },
      );
      expect(plan6.validation.status).toBe("valid");
      tx.commitPlan(plan6, { commitEntities });
      expect(tx.getSession().activeFeature?.cornerSelector).toBe("right_two");

      // TURNO 7: "Desfaça a última alteração"
      const plan7 = ChamferIntentInterpreter.compilePrompt("Desfaça a última alteração", {
        existingEntities: canvasEntities,
        session: tx.getSession(),
      });
      expect(plan7.intent.category).toBe("undo");
      tx.commitPlan(plan7, { commitEntities, triggerUndo });
      expect(canvasEntities.some((e) => e.id === "unrelated_line_1")).toBe(true);
    });
  });

  // ===========================================================================
  // 15.4 MÉTRICAS REPRODUTÍVEIS DO COMPILADOR (BENCHMARK TÉCNICO)
  // ===========================================================================
  describe("15.4 Métricas Reprodutíveis de Compilação e Validação", () => {
    it("Atinge 100% de precisão no corpus de avaliação de comandos válidos, ambíguos e inválidos", () => {
      expect(Object.keys(CHAMFER_COMMAND_REGISTRY).length).toBeGreaterThanOrEqual(25);

      const validCorpus = [
        "Crie uma chapa de 500 x 300 com quatro furos Ø12 a 25 mm das bordas",
        "Chapa de meio metro por 25 centímetros com 4 furos de doze nos cantos a 30 mm das bordas e raio vinte",
        "Chapa 400 x 250 mm com 5 furos de 12 mm na linha central horizontal com margem de 40 mm",
        "Flange externo 400 interno 200 com PCD 320 e 8 furos de 18 mm",
        "Suporte 280 por 140 mm com rasgo oblongo",
        "Transição quadrado 400 para redondo 250 altura 300",
        "Tronco de cone base 500 topo 250 altura 350",
        "Curva de gomos diâmetro 300 raio 450 90 graus 4 gomos",
        "Boca de lobo coletor 400 ramal 200",
        "Círculo de diâmetro 150 mm",
        "Anel externo 300 interno 160",
        "Hexágono de raio 80 mm",
      ];

      let validSuccess = 0;
      for (const prompt of validCorpus) {
        const plan = ChamferIntentInterpreter.compilePrompt(prompt);
        if (
          plan.validation.status === "valid" &&
          (plan.compiled?.previewEntities.length ?? 0) > 0
        ) {
          validSuccess++;
        }
      }
      const validRate = validSuccess / validCorpus.length;
      expect(validRate).toBe(1);

      const ambiguousCorpus = [
        "Faça uma chapa de 400 por 250 mm com cantos arredondados de raio 20 e cinco furos centrais de 12 mm, divididos igualmente.",
        "Chapa 300 x 300 com 6 furos de 14 mm em círculo PCD",
        "Crie uma peça",
      ];
      let ambiguityDetected = 0;
      for (const prompt of ambiguousCorpus) {
        const plan = ChamferIntentInterpreter.compilePrompt(prompt);
        if (plan.validation.status === "needs_clarification" && plan.unresolved.length > 0) {
          ambiguityDetected++;
        }
      }
      expect(ambiguityDetected / ambiguousCorpus.length).toBe(1);

      const invalidGeometryCorpus = [
        "Chapa de 200 por 100 mm com cantos arredondados de raio 80",
        "Chapa de 200 por 100 mm com 4 furos de 120 mm nos cantos a 10 mm das bordas",
      ];
      let invalidDetected = 0;
      for (const prompt of invalidGeometryCorpus) {
        const plan = ChamferIntentInterpreter.compilePrompt(prompt);
        if (plan.validation.status === "invalid") {
          invalidDetected++;
        }
      }
      expect(invalidDetected / invalidGeometryCorpus.length).toBe(1);
    });

    it("Valida em tempo real (0ms) o Mini-Viewport 2D CAD (R > min(W,H)/2, pitch <= diametro, margem < diametro/2)", () => {
      // Caso válido: 400 x 250, R20, 5 furos Ø12, margem 25 -> pitch = (400 - 50) / 4 = 87.5 mm
      const validState = evaluateLivePlateValidation({
        width: 400,
        height: 250,
        cornerRadius: 20,
        cornerSelector: "all",
        holeCount: 5,
        holeDiameter: 12,
        margin: 25,
      });
      expect(validState.isValid).toBe(true);
      expect(validState.computedPitch).toBeCloseTo(87.5, 4);

      // Conflito 1: R > min(W, H) / 2 (140 > 125)
      const radiusErr = evaluateLivePlateValidation({
        width: 400,
        height: 250,
        cornerRadius: 140,
        cornerSelector: "all",
        holeCount: 5,
        holeDiameter: 12,
        margin: 25,
      });
      expect(radiusErr.isValid).toBe(false);
      expect(radiusErr.isRadiusError).toBe(true);

      // Conflito 2: Colisão entre furos (pitch <= diametro)
      const pitchErr = evaluateLivePlateValidation({
        width: 200,
        height: 150,
        cornerRadius: 10,
        cornerSelector: "all",
        holeCount: 6,
        holeDiameter: 40,
        margin: 25,
      });
      expect(pitchErr.isValid).toBe(false);
      expect(pitchErr.isPitchCollision).toBe(true);

      // Conflito 3: Margem de borda menor que Ø/2 (margem 4 < 12/2 = 6)
      const marginErr = evaluateLivePlateValidation({
        width: 400,
        height: 250,
        cornerRadius: 20,
        cornerSelector: "all",
        holeCount: 5,
        holeDiameter: 12,
        margin: 4,
      });
      expect(marginErr.isValid).toBe(false);
      expect(marginErr.isMarginError).toBe(true);
    });
  });
});
