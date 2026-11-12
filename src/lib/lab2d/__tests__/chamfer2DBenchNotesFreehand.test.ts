import test from "node:test";
import assert from "node:assert/strict";
import {
  BenchCalculatorError,
  DEFAULT_BENCH_CALC_STATE,
  applyDeterministicBenchRescueToggle,
  clampFloatingBenchPosition,
  convertBenchInchMm,
  evaluateBenchExpression,
  evaluateInlineNoteFormulaText,
  extractCadEntityMeasurements,
  formatBenchValue,
  formatMmToCommercialInchDisplay,
} from "@/lib/lab2d/chamferBenchCalculator";
import {
  applyFormattingToRunRange,
  buildRichNoteEntity,
  hitTestRichNoteGlyphsMm,
  isRangeUniformlyFormatted,
  layoutRichNoteMm,
  runsToPlainText,
  syncPlainTextEditIntoRuns,
  type RichNoteSpec,
} from "@/lib/lab2d/chamferRichNoteEngine";
import {
  FREEHAND_MAX_VERTICES,
  applyEndpointSnapWithTailDamping,
  buildFreehandVectorEntity,
  detectFreehandPrimitiveSuggestion,
  projectFreehandOrthoSteps,
  simplifyFreehandRDP,
  smoothFreehandStrokeArcLength,
} from "@/lib/lab2d/chamferFreehandEngine";
import { buildCncDxf, cncCutLength, DEFAULT_CNC_OPTIONS } from "@/lib/dxf/cncExport";
import { exportDXF } from "@/lib/dxf/exportService";
import { buildDirectTopology3DScene } from "@/lib/lab2d/cadDirectModeling3D";
import {
  CHAMFER_COMMAND_REGISTRY,
  generateChamferCommandCoverageReport,
} from "@/lib/lab2d/chamferCommandRegistry";
import type { Entity } from "@/lib/lab2d/core";

test("Mini-Calculadora de Bancada: precedência algébrica, precisão IEEE-754 e caldeiraria", () => {
  assert.equal(evaluateBenchExpression("2 + 3 × 4", "DEG"), 14);
  assert.equal(evaluateBenchExpression("0,1 + 0,2", "DEG"), 0.3);
  assert.equal(evaluateBenchExpression("hypot(300; 400)", "DEG"), 500);
  const diag = evaluateBenchExpression("350 × √2", "DEG");
  assert.equal(formatBenchValue(diag, "2"), "494,97");
  assert.equal(evaluateBenchExpression("2 * Ans + 10", "DEG", 25), 60);
});

test("Mini-Calculadora de Bancada: redução modular trigonométrica exata em DEG, RAD e GRAD", () => {
  assert.equal(evaluateBenchExpression("sin(30°)", "DEG"), 0.5);
  assert.equal(evaluateBenchExpression("sin(180)", "DEG"), 0);
  assert.equal(evaluateBenchExpression("cos(90)", "DEG"), 0);
  assert.equal(evaluateBenchExpression("tan(45)", "DEG"), 1);
  assert.equal(evaluateBenchExpression("sin(33,333333)", "GRAD"), 0.5);
  assert.equal(evaluateBenchExpression("cos(100)", "GRAD"), 0);
  assert.equal(evaluateBenchExpression("sin(π)", "RAD"), 0);

  assert.throws(
    () => evaluateBenchExpression("tan(90)", "DEG"),
    (err: unknown) => err instanceof BenchCalculatorError && err.message === "Indefinido",
  );
  assert.throws(
    () => evaluateBenchExpression("10 ÷ 0", "DEG"),
    (err: unknown) => err instanceof BenchCalculatorError && err.message === "Indefinido",
  );
  assert.throws(
    () => evaluateBenchExpression("√(-1)", "DEG"),
    (err: unknown) => err instanceof BenchCalculatorError && err.message === "Erro",
  );
  assert.throws(
    () => evaluateBenchExpression("asin(2)", "DEG"),
    (err: unknown) => err instanceof BenchCalculatorError && err.message === "Erro",
  );
});

test("Mini-Calculadora de Bancada: conversão in ↔ mm (25,4) e fração comercial até 1/64\"", () => {
  assert.equal(convertBenchInchMm(25.4, "mm_to_in"), 1);
  assert.equal(convertBenchInchMm(2, "in_to_mm"), 50.8);
  assert.equal(formatMmToCommercialInchDisplay(12.7), '1/2"');
  assert.equal(formatMmToCommercialInchDisplay(25.4), '1"');
  assert.equal(formatMmToCommercialInchDisplay(38.1), '1 1/2"');
});

test("Mini-Calculadora de Bancada: resgate rápido determinístico preserva 100% da expressão, Ans e histórico", () => {
  const closedState = {
    ...DEFAULT_BENCH_CALC_STATE,
    open: false,
    dockMode: "floating" as const,
    expression: "hypot(300; 400)",
    ans: 500,
    history: [
      {
        id: "h1",
        expression: "hypot(300; 400)",
        result: 500,
        formattedResult: "500",
        inchFraction: '19 11/16"',
        angleMode: "DEG" as const,
        timestamp: 1,
      },
    ],
  };

  // 1) Oculta -> abre na Posição Padrão Fixa à Direita
  const openedDocked = applyDeterministicBenchRescueToggle(closedState);
  assert.equal(openedDocked.open, true);
  assert.equal(openedDocked.dockMode, "docked_right");
  assert.equal(openedDocked.expression, "hypot(300; 400)");
  assert.equal(openedDocked.ans, 500);

  // 2) Flutuando longe/minimizada -> resgata imediatamente p/ Posição Padrão Fixa à Direita sem apagar memória
  const floatingAway = {
    ...openedDocked,
    dockMode: "floating" as const,
    minimized: true,
    floatingPos: { x: 980, y: 620 },
  };
  const rescued = applyDeterministicBenchRescueToggle(floatingAway);
  assert.equal(rescued.open, true);
  assert.equal(rescued.minimized, false);
  assert.equal(rescued.dockMode, "docked_right");
  assert.equal(rescued.expression, "hypot(300; 400)");
  assert.equal(rescued.history.length, 1);

  // 3) Já fixa à direita e expandida -> fecha suavemente
  const closedAgain = applyDeterministicBenchRescueToggle(rescued);
  assert.equal(closedAgain.open, false);

  // Clamp de segurança de viewport mantém >= 48px dentro da tela
  const clamped = clampFloatingBenchPosition({ x: 5000, y: 4000 }, 390, 844, 260);
  assert.ok(clamped.x <= 390 - 48);
  assert.ok(clamped.y <= 844 - 48);
});

test("Ponte CAD: extração de medidas reais de entidades e cálculo inline em Notas Técnicas", () => {
  const circle: Entity = { id: "c1", layer: "corte", type: "circle", cx: 50, cy: 50, r: 20 };
  const chips = extractCadEntityMeasurements(circle);
  assert.ok(chips.some((c) => c.shortTag === "Ø" && c.value === 40));
  assert.ok(chips.some((c) => c.shortTag === "R" && c.value === 20));

  const formulaEval = evaluateInlineNoteFormulaText("Desenvolvimento:\nC = 40 * π", "DEG", 0);
  assert.ok(formulaEval);
  assert.equal(formulaEval.updatedText, "Desenvolvimento:\nC = 40 * π = 125,66 mm");
});

test("Anotações Técnicas: formatação por palavra isolada, Justificado matemático real e Hit-Test apenas nos glifos", () => {
  const initialRuns = [{ text: "Chapa SAE 1020 dobrada a frio na prensa hidráulica com tolerância fina" }];
  // Aplica Negrito e Grifado Amarelo exclusivamente em "SAE 1020" (índices 6..14)
  const formattedRuns = applyFormattingToRunRange(initialRuns, 6, 14, {
    bold: true,
    highlightColor: "#FACC15",
  });

  assert.equal(runsToPlainText(formattedRuns), runsToPlainText(initialRuns));
  assert.equal(isRangeUniformlyFormatted(formattedRuns, 6, 14, (r) => Boolean(r.bold)), true);
  assert.equal(isRangeUniformlyFormatted(formattedRuns, 0, 5, (r) => Boolean(r.bold)), false);
  assert.equal(isRangeUniformlyFormatted(formattedRuns, 15, 22, (r) => Boolean(r.bold)), false);

  // Sincronização de edição preserva os runs vizinhos
  const synced = syncPlainTextEditIntoRuns(
    formattedRuns,
    "Chapa SAE 1020 decapada dobrada a frio na prensa hidráulica com tolerância fina",
  );
  assert.equal(isRangeUniformlyFormatted(synced, 6, 14, (r) => r.highlightColor === "#FACC15"), true);

  // Layout Justificado Real: linhas intermediárias preenchem innerWidthMm de ponta a ponta; última linha fica à esquerda
  const spec: RichNoteSpec = {
    widthMm: 95,
    fontSizeMm: 6,
    rotationDeg: 0,
    textAlign: "justify",
    lineHeight: 1.35,
    categoryLayer: "Fabricação",
    boxStyle: "none",
    isFormula: false,
    runs: formattedRuns,
  };
  const layout = layoutRichNoteMm(spec);
  assert.ok(layout.lines.length >= 2, "Deve quebrar em múltiplas linhas");
  const firstLine = layout.lines[0]!;
  const lastLine = layout.lines[layout.lines.length - 1]!;
  assert.equal(firstLine.isLastLineOfParagraph, false);
  assert.ok(
    Math.abs((firstLine.xEndMm - firstLine.xStartMm) - layout.innerWidthMm) < 1e-3,
    "Primeira linha justificada deve preencher exatamente innerWidthMm de borda a borda",
  );
  assert.equal(lastLine.isLastLineOfParagraph, true);
  assert.ok(
    Math.abs(lastLine.xStartMm - layout.padXMm) < 1e-4,
    "Última linha do parágrafo deve permanecer alinhada à esquerda",
  );

  // Hit-Test Inteligente: acerta sobre glifo real, mas retorna FALSE no espaço vazio à direita da última linha!
  const shortNoteSpec: RichNoteSpec = {
    ...spec,
    widthMm: 140,
    boxStyle: "none",
    textAlign: "left",
    runs: [{ text: "SOLDA MIG" }],
  };
  const noteEntity = buildRichNoteEntity("note_1", { x: 10, y: 20 }, shortNoteSpec);
  const shortLayout = layoutRichNoteMm(shortNoteSpec);
  const firstFrag = shortLayout.fragments.find((f) => !f.isWhitespace)!;

  assert.equal(
    hitTestRichNoteGlyphsMm(
      { x: 10 + firstFrag.xMm + 2, y: 20 + firstFrag.yMm + 2 },
      noteEntity,
      1.2,
    ),
    true,
    "Clique sobre glifo real deve selecionar a nota",
  );
  assert.equal(
    hitTestRichNoteGlyphsMm({ x: 10 + 125, y: 20 + firstFrag.yMm + 2 }, noteEntity, 1.2),
    false,
    "Clique no espaço vazio interno da nota deve atravessar para permitir selecionar peças CAD abaixo",
  );
});

test("Desenho Livre Vetorial + Proteção CNC DXF / BOM / 3D", () => {
  // Gera um traço circular denso com 600 pontos e leve tremor simulado
  const rawCirclePts = Array.from({ length: 600 }, (_, i) => {
    const theta = (i / 599) * Math.PI * 2;
    const jitter = i === 0 || i === 599 ? 0 : Math.sin(i * 19) * 0.15;
    return {
      x: 100 + (40 + jitter) * Math.cos(theta),
      y: 100 + (40 + jitter) * Math.sin(theta),
    };
  });

  // 1) Pré-suavização trava 100% início e fim
  const smoothed = smoothFreehandStrokeArcLength(rawCirclePts, 7);
  assert.deepEqual(smoothed[0], rawCirclePts[0]);
  assert.deepEqual(smoothed[smoothed.length - 1], rawCirclePts[rawCirclePts.length - 1]);

  // 2) RDP respeita teto <= 400 vértices
  const simplified = simplifyFreehandRDP(rawCirclePts, 0.0001, FREEHAND_MAX_VERTICES);
  assert.ok(simplified.length <= FREEHAND_MAX_VERTICES);

  // 3) Amortecimento linear de 10% no Snap final não cria degrau brusco
  const lineRaw = Array.from({ length: 21 }, (_, i) => ({ x: i * 5, y: 0 }));
  const damped = applyEndpointSnapWithTailDamping(lineRaw, null, { x: 100, y: 2 }, 0.1);
  assert.deepEqual(damped[damped.length - 1], { x: 100, y: 2 });
  assert.equal(damped[10]!.y, 0, "Metade do traço (fora dos 10% finais) permanece intacta");
  assert.ok(
    damped[19]!.y > 0 && damped[19]!.y < 2,
    "Penúltimo ponto nos 10% finais interpola suavemente até o Snap sem degrau",
  );

  // 4) Projeção ORTO: ON gera apenas segmentos 0° / 90°
  const orthoPts = projectFreehandOrthoSteps([
    { x: 0, y: 0 },
    { x: 30, y: 4 },
    { x: 33, y: 45 },
  ]);
  for (let i = 1; i < orthoPts.length; i++) {
    const dx = Math.abs(orthoPts[i]!.x - orthoPts[i - 1]!.x);
    const dy = Math.abs(orthoPts[i]!.y - orthoPts[i - 1]!.y);
    assert.ok(dx < 1e-4 || dy < 1e-4, "Todo segmento com ORTO: ON deve ser horizontal ou vertical");
  }

  // 5) Sugestão inteligente detecta círculo desenhado à mão
  const suggestion = detectFreehandPrimitiveSuggestion(rawCirclePts);
  assert.ok(suggestion && suggestion.kind === "circle");

  // 6) Papel Geometria (fechado) vs. Marcação (rascunho) + Nota Técnica em DXF e 3D
  const geomRes = buildFreehandVectorEntity({
    rawPointsWorld: rawCirclePts,
    cameraZoomK: 2,
    tolerancePx: 1.5,
    mode: "suave",
    usageRole: "geometry",
    forceClose: true,
    activeLayer: "corte",
  });
  assert.ok(geomRes);
  assert.equal(geomRes.entity.type, "polyline");
  if (geomRes.entity.type === "polyline") {
    assert.equal(geomRes.entity.closed, true);
  }

  const markupRes = buildFreehandVectorEntity({
    rawPointsWorld: [
      { x: 0, y: 0 },
      { x: 40, y: 15 },
      { x: 80, y: 5 },
    ],
    cameraZoomK: 2,
    tolerancePx: 1.5,
    mode: "fiel",
    usageRole: "markup",
  });
  assert.ok(markupRes);

  const richNote = buildRichNoteEntity("note_dxf", { x: 10, y: 10 }, {
    widthMm: 80,
    fontSizeMm: 5,
    rotationDeg: 0,
    textAlign: "left",
    lineHeight: 1.35,
    categoryLayer: "Observação",
    boxStyle: "card",
    isFormula: true,
    runs: [{ text: "C = 40 * π = 125,66 mm" }],
  });

  const sceneEntities: Entity[] = [geomRes.entity, markupRes.entity, richNote];

  // Corte CNC considera apenas o contorno de Geometria (exclui Marcação e Nota Técnica)
  const cutLen = cncCutLength(sceneEntities);
  assert.ok(cutLen > 200);
  const defaultDxf = buildCncDxf(sceneEntities, DEFAULT_CNC_OPTIONS);
  assert.equal(defaultDxf.entities.length, 1, "DXF Laser padrão contém apenas a geometria de corte");

  // Quando o usuário marca 'Incluir anotações no DXF', a nota entra na layer ANOTACOES mantendo CypCut válido
  const dxfWithNotes = exportDXF({
    geometry: sceneEntities,
    includeAnnotations: true,
  });
  assert.equal(
    dxfWithNotes.doc.entities.some((e) => e.type === "TEXT" && e.layer === "ANOTACOES"),
    true,
  );
  assert.equal(dxfWithNotes.verification.ok, true);

  // Motor 3D extruda apenas o contorno fechado de Geometria (ignora Marcação e Nota Técnica)
  const scene3D = buildDirectTopology3DScene(sceneEntities, 6.35);
  assert.equal(scene3D.bodies.length, 1);
});

test("Registro Único de Comandos: global.bench_calc, tool.freehand e tool.text com 0 órfãos", () => {
  const report = generateChamferCommandCoverageReport();
  assert.equal(report.orphanCommands.length, 0);
  assert.equal(report.duplicateIds.length, 0);
  assert.equal(report.top20Exceeding2Touches.length, 0);
  assert.equal(report.anyExceeding3Touches.length, 0);
  assert.ok(CHAMFER_COMMAND_REGISTRY.some((c) => c.id === "global.bench_calc"));
  assert.ok(CHAMFER_COMMAND_REGISTRY.some((c) => c.id === "tool.freehand" && c.toolId === "freehand"));
  assert.ok(CHAMFER_COMMAND_REGISTRY.some((c) => c.id === "tool.text" && c.label === "Texto / Nota"));
});

