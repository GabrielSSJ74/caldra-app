import { describe, it, expect } from "vitest";
import {
  normalizePtBrVoiceTranscript,
  buildPartModelFromCanvas,
  getAvailableMentionSuggestions,
  detectActiveAtMentionQuery,
  insertAtMentionToken,
  resolveContextualMentionsAndDeictics,
  recompileCardWithoutLLM,
  recordTurnObservabilityLog,
  computeObservabilityMetricsSummary,
  clearTurnObservabilityLogs,
  runGoldenSuiteV2,
  saveMisinterpretedCaseToGoldenSuite,
  listUserSavedGoldenCases,
  evaluateParametricExpression,
  saveIntentTemplate,
  listSavedIntentTemplates,
  deleteSavedIntentTemplate,
  saveUserIntentPreferences,
  loadUserIntentPreferences,
  parseDxfTextToIntentAttachment,
  parseSketchImageToIntentAttachment,
  ChamferIntentInterpreter,
  createExecutionSandbox,
  executeDslV2ToolCallsBatch,
  resolveCanonicalPositionRef,
} from "./index";

describe("CHAMFER INTENT 2.0 — Fases 4, 5, 6 e 7 do Claude (Voz, Modificação Contextual, Suíte Golden ≥40 e Extras)", () => {
  it("Fase 4 (§5): Normaliza transcrição de voz em pt-BR (números por extenso compostos, vírgula decimal, por/vezes, unidades e glossário)", () => {
    const raw1 =
      "chapa de quinhentos por duzentos e cinquenta milímetros com quatro furos diâmetro doze vírgula cinco e raio vinte";
    const norm1 = normalizePtBrVoiceTranscript(raw1);
    expect(norm1).toContain("500 × 250 mm");
    expect(norm1).toContain("4 furos");
    expect(norm1).toContain("Ø12,5");
    expect(norm1).toContain("R20");

    const raw2 = "flanje com p c d trezentos e vinte e rasgo ovalado com xanfro";
    const norm2 = normalizePtBrVoiceTranscript(raw2);
    expect(norm2).toContain("flange");
    expect(norm2).toContain("PCD");
    expect(norm2).toContain("320");
    expect(norm2).toContain("rasgo oblongo");
    expect(norm2).toContain("chanfro");
  });

  it("Fase 5: Resolve menções @entidade, pronomes demonstrativos/posicionais e recompila parâmetros no cartão SEM chamar o LLM", () => {
    const basePlan = ChamferIntentInterpreter.compilePrompt(
      "Chapa 500 por 250 mm com raio 20 e 5 furos centrais de 12 mm divididos igualmente",
      { existingEntities: [], selectedEntityIds: [], activeLayer: "corte" },
    );
    const entities = basePlan.compiled?.previewEntities ?? [];
    const partModel = buildPartModelFromCanvas({
      entities,
      selectedEntityIds: [entities[1]?.id ?? "hole-1"],
      session: {
        turnIndex: 1,
        activeFeature: basePlan.compiled?.updatedFeature ?? null,
        featureHistory: [],
        lastPlan: basePlan,
        conversationLog: [],
      },
    });

    // Autocompletar @
    const detected = detectActiveAtMentionQuery("Aumente @pl");
    expect(detected.active).toBe(true);
    expect(detected.query).toBe("pl");

    const suggestions = getAvailableMentionSuggestions(partModel, "");
    expect(suggestions.some((s) => s.token === "@selecionado")).toBe(true);
    expect(suggestions.some((s) => s.featureType === "plate")).toBe(true);


    const inserted = insertAtMentionToken("Altere @pl", "@plate_1");
    expect(inserted).toBe("Altere @plate_1 ");

    // Resolução dêitica e posicional
    const resolved = resolveContextualMentionsAndDeictics(
      "Aumente esses furos igual ao anterior",
      partModel,
      { hole_diameter: 16 },
    );
    expect(resolved.resolvedTargetIds.length).toBeGreaterThan(0);
    expect(resolved.inheritedParams.hole_diameter).toBe(16);

    // Recompilação 0ms no cartão sem chamar o LLM
    const recompiled = recompileCardWithoutLLM({
      previousPlan: basePlan,
      changedKey: "corner_radius",
      oldValue: 20,
      newValue: 25,
      currentOverrides: {},
      existingEntities: [],
      selectedEntityIds: [],
      activeLayer: "corte",
    });
    expect(recompiled.usedLLM).toBe(false);
    expect(recompiled.manualEditContextNote).toBe("usuário alterou R de 20 para 25");
    expect(recompiled.recompiledPlan.parameters.corner_radius).toBe(25);
  });

  it("Fase 6 (§10): Executa a Suíte Golden com ≥ 40 frases em pt-BR atingindo ≥ 95% de acerto e 0 geometrias inválidas aplicadas", () => {
    const report = runGoldenSuiteV2();
    expect(report.totalCases).toBeGreaterThanOrEqual(40);
    expect(report.invalidGeometryAppliedCount).toBe(0);
    expect(report.passRatePercent).toBeGreaterThanOrEqual(95);
    expect(report.meets95PercentCriterion).toBe(true);
    expect(report.p50DurationMs).toBeLessThan(1000);

    // Observabilidade por turno + botão "Interpretou errado"
    clearTurnObservabilityLogs();
    recordTurnObservabilityLog({
      turnId: "t-obs-1",
      timestamp: new Date().toISOString(),
      rawInput: "Chapa 500x250",
      normalizedInput: "Chapa 500 × 250",
      assumptions: [],
      toolCallNames: ["create_base_plate"],
      validationStatus: "valid",
      validationErrors: [],
      dfmWarnings: [],
      understandingTimeMs: 4.5,
      compilationTimeMs: 11.2,
      feedback: { rating: "up" },
    });

    const summary = computeObservabilityMetricsSummary();
    expect(summary.totalTurns).toBe(1);
    expect(summary.invalidGeometryAppliedCount).toBe(0);
    expect(summary.upvotes).toBe(1);

    const savedCase = saveMisinterpretedCaseToGoldenSuite({
      prompt: "Chapa especial teste",
      actualPlanSummary: "Chapa 400x200",
      userNote: "Deveria ter rasgo",
    });
    expect(listUserSavedGoldenCases().some((c) => c.id === savedCase.id)).toBe(true);
  });

  it("Fase 7: Avalia expressões paramétricas globais (W/2, D=2*R), gerencia Meus Gabaritos, Preferências e entrada DXF/Croqui", () => {
    const vars = { W: 500, H: 250, R: 20, D: 12, M: 25 };
    expect(evaluateParametricExpression("W/2", vars)).toBe(250);
    expect(evaluateParametricExpression("D=2*R", vars)).toBe(40);
    expect(evaluateParametricExpression("W - 2*M", vars)).toBe(450);

    // Meus Gabaritos
    const tpl = saveIntentTemplate({
      name: "Suporte Padrão M16",
      category: "suporte",
      prompt: "Chapa 300x150 com 2 furos de 18 mm",
      defaultParameters: { width: 300, height: 150, hole_count: 2, hole_diameter: 18 },
    });
    expect(listSavedIntentTemplates().some((t) => t.id === tpl.id)).toBe(true);
    expect(deleteSavedIntentTemplate(tpl.id)).toBe(true);

    // Preferências do Usuário
    const prefs = saveUserIntentPreferences({
      defaultMaterial: "Aço Inox AISI 304",
      defaultThicknessMm: 4.75,
      ttsEnabled: true,
    });
    expect(prefs.defaultMaterial).toBe("Aço Inox AISI 304");
    expect(loadUserIntentPreferences().defaultThicknessMm).toBe(4.75);

    // Entrada DXF e Croqui
    const sampleDxf = [
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      "0",
      "LINE",
      "10",
      "0",
      "20",
      "0",
      "11",
      "600",
      "21",
      "350",
      "0",
      "CIRCLE",
      "10",
      "30",
      "20",
      "30",
      "40",
      "8",
      "0",
      "CIRCLE",
      "10",
      "570",
      "20",
      "30",
      "40",
      "8",
      "0",
      "ENDSEC",
    ].join("\n");

    const parsedDxf = parseDxfTextToIntentAttachment(sampleDxf, "chapa_base.dxf");
    expect(parsedDxf.extractedMetrics.widthMm).toBe(600);
    expect(parsedDxf.extractedMetrics.heightMm).toBe(350);
    expect(parsedDxf.extractedMetrics.holeCount).toBe(2);
    expect(parsedDxf.extractedMetrics.holeDiameterMm).toBe(16);

    const parsedSketch = parseSketchImageToIntentAttachment("croqui_chapa_450x220_furo14.png");
    expect(parsedSketch.extractedMetrics.widthMm).toBe(450);
    expect(parsedSketch.extractedMetrics.heightMm).toBe(220);
    expect(parsedSketch.extractedMetrics.holeDiameterMm).toBe(14);
  });

  it("ChatGPT Fases B a G: Voz fracionária (três oitavos / meio metro), deleção seletiva do furo do meio, consulta de passo, espessura CHAPA, TRIM parcial, limite de 500 operações e status provisório", () => {
    // 1. Normalização de voz para frações de polegada e metros (§9.3 & §17.1)
    const normPol = normalizePtBrVoiceTranscript("chapa de meio metro com furo de três oitavos");
    expect(normPol).toContain("500 mm");
    expect(normPol).toContain("9,525 mm");

    // 2. Criação de chapa base com 5 furos
    const basePlan = ChamferIntentInterpreter.compilePrompt(
      "Chapa de 500 por 250 mm com 5 furos centrais de 12 mm divididos igualmente",
      { existingEntities: [], selectedEntityIds: [], activeLayer: "corte" },
    );
    const baseEntities = basePlan.compiled?.previewEntities ?? [];
    const baseSession = {
      turnIndex: 1,
      activeFeature: basePlan.compiled?.updatedFeature ?? null,
      featureHistory: [],
      lastPlan: basePlan,
      conversationLog: [],
    };

    // 3. Consulta determinística de quantidade de furos e passo (§23 Exemplo H)
    const queryPlan = ChamferIntentInterpreter.compilePrompt(
      "Quantos furos tem a peça e qual é o passo?",
      {
        existingEntities: baseEntities,
        selectedEntityIds: [],
        activeLayer: "corte",
        session: baseSession,
      },
    );
    expect(queryPlan.parameters.hole_count).toBe(5);
    expect(Number(queryPlan.parameters.pitch)).toBeGreaterThan(0);
    expect(queryPlan.intent.summary).toContain("passo");

    // 4. Deleção seletiva de apenas o furo do meio (§2.4 & §12.3)
    const deleteMidHolePlan = ChamferIntentInterpreter.compilePrompt(
      "Apague apenas o furo do meio",
      {
        existingEntities: baseEntities,
        selectedEntityIds: [],
        activeLayer: "corte",
        session: baseSession,
      },
    );
    const remainingCircles = (deleteMidHolePlan.compiled?.previewEntities ?? []).filter(
      (e) => e.type === "circle",
    );
    expect(remainingCircles.length).toBe(4);
    expect(deleteMidHolePlan.v2?.entityDelta?.deleteCount).toBe(1);

    // 5. Atualização direta de espessura da CHAPA em fração de polegada (§20)
    const thicknessPlan = ChamferIntentInterpreter.compilePrompt("Chapa de três oitavos", {
      existingEntities: baseEntities,
      selectedEntityIds: [],
      activeLayer: "corte",
      session: baseSession,
    });
    expect(Number(thicknessPlan.parameters.thickness)).toBeCloseTo(9.525, 2);

    // 6. TRIM parcial em linha + circunferência (§23 Exemplo G)
    const trimPlan = ChamferIntentInterpreter.compilePrompt(
      "Apare somente o trecho superior que ultrapassa a circunferência",
      {
        existingEntities: [
          { id: "c-1", type: "circle", cx: 100, cy: 100, r: 40, layer: "corte" },
          { id: "l-1", type: "line", x1: 100, y1: 20, x2: 100, y2: 180, layer: "corte" },
        ],
        selectedEntityIds: [],
        activeLayer: "corte",
      },
    );
    expect(trimPlan.validation.status).toBe("valid");
    expect(trimPlan.operations.some((op) => op.type === "trim_entity")).toBe(true);

    // 7. Limite de 500 operações por turno (§19.3)
    const runawayPlan = ChamferIntentInterpreter.compilePrompt(
      "Chapa 2000 por 1000 mm com 600 furos de 5 mm",
      { existingEntities: [], selectedEntityIds: [], activeLayer: "corte" },
    );
    expect(
      runawayPlan.v2?.manufacturingReport.errors.some(
        (err) => err.code === "OPERATION_LIMIT_EXCEEDED",
      ),
    ).toBe(true);

    // 8. Decisão provisória com premissa explícita (§10 & §15)
    const provisionalPlan = ChamferIntentInterpreter.compilePrompt(
      "Chapa 400 por 200 mm com furos concêntricos de 20 mm",
      { existingEntities: [], selectedEntityIds: [], activeLayer: "corte" },
    );
    expect(provisionalPlan.v2?.decisionStatus).toBe("provisional");
    expect(provisionalPlan.v2?.requiresPremiseConfirmation).toBe(true);
  });

  it("Gemini 4 Argon Fases B a G: Ancoragem canônica pos (abs, center, edge_offset, from, polar) e create_cutout", () => {
    const sandbox = createExecutionSandbox({});
    const batch = executeDslV2ToolCallsBatch(
      [
        {
          id: "g1",
          name: "create_plate",
          args: { id: "plate_1", width: 400, height: 250 },
        },
        {
          id: "g2",
          name: "create_cutout",
          args: {
            id: "cutout_1",
            parent: "plate_1",
            shape: "rect",
            width: 80,
            height: 50,
            pos: { center: "plate_1" },
          },
        },
        {
          id: "g3",
          name: "create_circle",
          args: {
            id: "hole_offset",
            d: 16,
            pos: { edge_offset: { id: "plate_1", side: "left", dist: 40 } },
          },
        },
      ],
      sandbox,
    );

    expect(batch.ok).toBe(true);
    const state = batch.finalState;

    // Ancoragem center
    expect(resolveCanonicalPositionRef({ center: "plate_1" }, state)).toEqual({ x: 200, y: 125 });

    // Ancoragem edge_offset
    expect(
      resolveCanonicalPositionRef({ edge_offset: { id: "plate_1", side: "right", dist: 30 } }, state),
    ).toEqual({ x: 370, y: 125 });

    // Ancoragem from (tl, br, top)
    expect(
      resolveCanonicalPositionRef({ from: { id: "plate_1", anchor: "tl", dx: 20, dy: -20 } }, state),
    ).toEqual({ x: 20, y: 230 });
    expect(
      resolveCanonicalPositionRef({ from: { id: "plate_1", anchor: "br", dx: -25, dy: 25 } }, state),
    ).toEqual({ x: 375, y: 25 });

    // Ancoragem polar
    expect(
      resolveCanonicalPositionRef({ polar: { center: [200, 125], r: 50, angle: 0 } }, state),
    ).toEqual({ x: 250, y: 125 });
  });
});

