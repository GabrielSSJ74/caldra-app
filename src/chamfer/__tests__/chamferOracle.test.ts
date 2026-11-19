import test from "node:test";
import assert from "node:assert/strict";

import { ParameterStore, evaluateSafeParameterExpression } from "../core/parameterStore";
import { sanitizeNumericInput, sanitizeDxfContent } from "../core/commandEngine";
import {
  solveSketch2D,
  tryAddSketchConstraint,
  getValidConstraintsForSelection,
  autoConstrainSketch,
  type ParametricSketch2D,
} from "../sketch/constraintSolver";
import {
  extractAutoProfileRegions,
  hitTestProfileRegion,
  evaluateCubicControlSpline,
  applyBatchFilletChamfer2D,
  generateTechnicalTextPaths,
} from "../sketch/planarFaceExtractor";
import {
  createChamferParametricEngine,
  createEmptyParametricDocument,
  computePlaneAlongPath,
  STEEL_DENSITY_KG_M3,
} from "../core/timelineEvaluator";
import {
  DEFAULT_SHEET_METAL_RULES,
  computeBendMath,
  computeFlatLengthFromExternals,
  createContourFlange,
  addEdgeFlange,
  addHem,
  setBendsUnfolded,
  addHoleAcrossBend,
  computeFlatPattern,
  exportLaserInsideOutDxf,
  exportBendTableCsv,
} from "../sheetMetal/bendTree";
import {
  runInterferenceAnalysisAsync,
  projectCurrentViewToDxf,
} from "../inspect/sectionAndInspect";

function approx(actual: number, expected: number, tol: number, msg?: string) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg ?? "Valor fora da tolerância"}: obtido=${actual}, esperado=${expected}, tol=${tol}`,
  );
}

test("O1 — Volume e Massa: Chapa Base 100 × 50 × 5 mm em aço carbono (7850 kg/m³)", () => {
  const { engine } = createChamferParametricEngine(createEmptyParametricDocument(STEEL_DENSITY_KG_M3));
  const res = engine.runSafeCommand("solid.extrude", {
    id: "chapa_base",
    name: "Chapa Base",
    widthMm: 100,
    depthMm: 50,
    heightMm: 5,
  });
  assert.equal(res.ok, true);
  const mp = res.state.totalMassProps;
  approx(mp.volumeMm3, 25000.0, 1e-4, "Volume mm³");
  approx(mp.volumeCm3, 25.0, 1e-4, "Volume cm³");
  approx(mp.massGrams, 196.25, 1e-2, "Massa em gramas");
});

test("O2 — Furo Passante: Chapa 100 × 50 × 5 mm com furo Ø 20 mm passante", () => {
  const { engine } = createChamferParametricEngine(createEmptyParametricDocument(STEEL_DENSITY_KG_M3));
  assert.equal(
    engine.runSafeCommand("solid.extrude", {
      id: "chapa_base",
      widthMm: 100,
      depthMm: 50,
      heightMm: 5,
    }).ok,
    true,
  );
  const res = engine.runSafeCommand("solid.hole", {
    id: "furo_central",
    diameterMm: 20,
    through: true,
    targetFaceKey: "chapa_base:top",
    targetBodyId: "chapa_base",
  });
  assert.equal(res.ok, true);
  const mp = res.state.totalMassProps;
  approx(mp.volumeMm3, 23429.2037, 1e-2, "Volume após furo Ø20");
  approx(mp.massGrams, 183.92, 1e-2, "Massa após furo Ø20");
});

test("O3 — Cilindro Ø 50 × 100 mm: Volume, Área Lateral, Massa e Centro de Massa Z", () => {
  const { engine } = createChamferParametricEngine(createEmptyParametricDocument(STEEL_DENSITY_KG_M3));
  const res = engine.runSafeCommand("solid.cylinder", {
    id: "cilindro_1",
    diameterMm: 50,
    heightMm: 100,
  });
  assert.equal(res.ok, true);
  const mp = res.state.totalMassProps;
  approx(mp.volumeMm3, 196349.5408, 1e-2, "Volume cilindro");
  approx(mp.lateralAreaMm2, 15707.9633, 1e-2, "Área lateral cilindro");
  approx(mp.massKg, 1.5413, 1e-3, "Massa cilindro kg");
  approx(mp.centerOfMass.z, 50.0, 1e-6, "Centro de massa Z");
});

test("O4 — Chapa Metálica: Dobra Exata (Casos A e B) + DXF Laser Inside-Out (CUT antes de OUTLINE)", () => {
  // Caso A: L a 90°, 40 + 30 mm, T=3, R=3, K=0.33
  const mathA = computeBendMath(90, 3, 3, 0.33);
  approx(mathA.bendAllowanceMm, 6.2675, 1e-4, "Caso A BA");
  approx(mathA.outsideSetbackMm, 6.0, 1e-4, "Caso A OSSB");
  approx(mathA.bendDeductionMm, 5.7325, 1e-4, "Caso A BD");
  const flatA = computeFlatLengthFromExternals([40, 30], [
    { angleDeg: 90, thicknessMm: 3, innerRadiusMm: 3, kFactor: 0.33 },
  ]);
  approx(flatA.flatLengthMm, 64.2675, 1e-4, "Caso A L_flat");

  // Caso B: L a 90°, 50 + 50 mm, T=2, R=2, K=0.40
  const mathB = computeBendMath(90, 2, 2, 0.4);
  approx(mathB.bendAllowanceMm, 4.3982, 1e-4, "Caso B BA");
  approx(mathB.bendDeductionMm, 3.6018, 1e-4, "Caso B BD");
  const flatB = computeFlatLengthFromExternals([50, 50], [
    { angleDeg: 90, thicknessMm: 2, innerRadiusMm: 2, kFactor: 0.4 },
  ]);
  approx(flatB.flatLengthMm, 96.3982, 1e-4, "Caso B L_flat");

  // Contour Flange + furo interno + dobra para cima e outra para baixo + DXF Inside-Out
  const ruleA = { ...DEFAULT_SHEET_METAL_RULES[4]!, thicknessMm: 3, innerRadiusMm: 3, kFactor: 0.33 };
  let part = createContourFlange({
    name: "Suporte L",
    extrudeWidthMm: 80,
    externalLegsMm: [40, 30],
    bendAnglesDeg: [90],
    rule: ruleA,
    holesOnRoot: [{ id: "h1", x: 15, y: 40, diameterMm: 10 }],
  });
  part = addEdgeFlange(part, { edge: "top", externalLengthMm: 20, angleDeg: -90 });
  part = addHem(part, { edge: "bottom", hemLengthMm: 10, style: "closed" });
  const unfolded = setBendsUnfolded(part, true);
  assert.equal(unfolded.root.children[0]!.unfolded, true);
  const withBendHole = addHoleAcrossBend(unfolded, "bend_1", 37, 40, 8);
  const refolded = setBendsUnfolded(withBendHole, false);
  assert.equal(refolded.root.children[0]!.unfolded, false);

  const fp = computeFlatPattern(part);
  approx(fp.developedLengthMm, 64.2675, 1e-3, "FlatPattern developedLength Caso A");
  assert.ok(fp.bendTable.length >= 2, "Tabela de dobras deve registrar as dobras");
  assert.ok(exportBendTableCsv(fp.bendTable).includes("BEND") || exportBendTableCsv(fp.bendTable).includes("UP"));

  const dxf = exportLaserInsideOutDxf(fp);
  const entitiesIdx = dxf.indexOf("ENTITIES");
  assert.ok(entitiesIdx > 0);
  const entitiesBlock = dxf.slice(entitiesIdx);

  const firstCutIdx = entitiesBlock.indexOf("\nCUT\n");
  const firstOutlineIdx = entitiesBlock.indexOf("\nOUTLINE\n");
  assert.ok(firstCutIdx > 0, "DXF deve conter entidades na camada CUT");
  assert.ok(firstOutlineIdx > 0, "DXF deve conter entidades na camada OUTLINE");
  assert.ok(firstCutIdx < firstOutlineIdx, "Ordem Inside-Out obrigatória: CUT estritamente antes de OUTLINE");
  assert.ok(entitiesBlock.includes("CIRCLE"), "Furos devem ser emitidos como CIRCLE exato");
  assert.ok(entitiesBlock.includes("LINE"), "Contorno deve usar LINE exato");
  assert.ok(entitiesBlock.includes("\nBEND_UP\n"), "Camada BEND_UP deve existir");
  assert.ok(entitiesBlock.includes("\nBEND_DOWN\n"), "Camada BEND_DOWN deve existir");
});

test("O5 — Solver de Restrições 2D: Triângulo 3-4-5 converge para P2 = (1.8, ±2.4) com erro <= 1e-6", () => {
  const sketch: ParametricSketch2D = {
    points: [
      { id: "P0", x: 0, y: 0, fixed: true },
      { id: "P1", x: 4.5, y: 0.3 },
      { id: "P2", x: 2.0, y: 2.0 },
    ],
    lines: [],
    circles: [],
    constraints: [
      { id: "c_h", type: "horizontal", points: ["P0", "P1"] },
      { id: "c_01", type: "distance", points: ["P0", "P1"], value: 5 },
      { id: "c_02", type: "distance", points: ["P0", "P2"], value: 3 },
      { id: "c_12", type: "distance", points: ["P1", "P2"], value: 4 },
    ],
  };

  const res = solveSketch2D(sketch);
  assert.equal(res.converged, true);
  assert.equal(res.dof, 0);
  assert.ok(res.residualNorm < 1e-6, `Resíduo alto: ${res.residualNorm}`);
  const p1 = res.sketch.points.find((p) => p.id === "P1")!;
  const p2 = res.sketch.points.find((p) => p.id === "P2")!;
  approx(p1.x, 5.0, 1e-6, "P1.x");
  approx(p1.y, 0.0, 1e-6, "P1.y");
  approx(p2.x, 1.8, 1e-6, "P2.x");
  approx(Math.abs(p2.y), 2.4, 1e-6, "|P2.y|");
});

test("O6 — Graus de Liberdade (DOF) 8 -> 4 -> 2 -> 0 + recusa de restrição redundante/conflitante", () => {
  let sketch: ParametricSketch2D = {
    points: [
      { id: "p0", x: 0, y: 0 },
      { id: "p1", x: 80, y: 2 },
      { id: "p2", x: 82, y: 40 },
      { id: "p3", x: -1, y: 39 },
    ],
    lines: [
      { id: "l0", p1: "p0", p2: "p1" },
      { id: "l1", p1: "p1", p2: "p2" },
      { id: "l2", p1: "p2", p2: "p3" },
      { id: "l3", p1: "p3", p2: "p0" },
    ],
    circles: [],
    constraints: [],
  };

  // 1) Retângulo livre de 4 pontos = 8 GDL
  let res = solveSketch2D(sketch);
  assert.equal(res.dof, 8, "Retângulo livre deve ter 8 GDL");

  // 2) + 4 restrições H/V = 4 GDL
  const hvConstraints = [
    { id: "h0", type: "horizontal" as const, lines: ["l0"] },
    { id: "v1", type: "vertical" as const, lines: ["l1"] },
    { id: "h2", type: "horizontal" as const, lines: ["l2"] },
    { id: "v3", type: "vertical" as const, lines: ["l3"] },
  ];
  for (const c of hvConstraints) {
    const add = tryAddSketchConstraint(sketch, c);
    assert.equal(add.accepted, true, `Restrição ${c.id} deveria ser aceita`);
    sketch = add.solveResult.sketch;
  }
  res = solveSketch2D(sketch);
  assert.equal(res.dof, 4, "Após 4 H/V deve ter 4 GDL");

  // 3) + largura e altura = 2 GDL
  let addW = tryAddSketchConstraint(sketch, { id: "c_w", type: "distance", lines: ["l0"], value: 100 });
  assert.equal(addW.accepted, true);
  sketch = addW.solveResult.sketch;

  let addH = tryAddSketchConstraint(sketch, { id: "c_h", type: "distance", lines: ["l1"], value: 50 });
  assert.equal(addH.accepted, true);
  sketch = addH.solveResult.sketch;

  res = solveSketch2D(sketch);
  assert.equal(res.dof, 2, "Após largura e altura deve ter 2 GDL");

  // 4) + 1 ponto fixo = 0 GDL ("Totalmente Definido")
  const addFix = tryAddSketchConstraint(sketch, {
    id: "c_fix",
    type: "fixed",
    points: ["p0"],
    fixedX: 0,
    fixedY: 0,
  });
  assert.equal(addFix.accepted, true);
  sketch = addFix.solveResult.sketch;
  res = solveSketch2D(sketch);
  assert.equal(res.dof, 0, "Após fixar 1 ponto deve ter 0 GDL");
  assert.equal(res.status, "fullyDefined");
  assert.ok(res.statusLabel.includes("Totalmente Definido"));

  // 5) Inserir restrição redundante/conflitante é RECUSADO com mensagem clara
  const conflict = tryAddSketchConstraint(sketch, {
    id: "c_conflict",
    type: "distance",
    lines: ["l2"],
    value: 120,
  });
  assert.equal(conflict.accepted, false, "Restrição conflitante deve ser recusada");
  assert.ok(conflict.reason && conflict.reason.length > 5, "Mensagem de conflito clara obrigatória");

  // Smart pill e auto-constrain sanity
  const pill = getValidConstraintsForSelection({ pointIds: [], lineIds: ["l0", "l1"], circleIds: [] });
  assert.ok(pill.primary.length <= 5 && pill.primary.length > 0);
  const autoRes = autoConstrainSketch({ ...sketch, constraints: [] });
  assert.ok(autoRes.addedConstraints.length > 0);
});

test("O7 — Parâmetros e Expressões: unidades (mm, in, °), variáveis e bloqueio de ciclo DFS", () => {
  const store = new ParameterStore(true);
  assert.equal(store.setParameter("largura", "40 mm", { unit: "mm" }).ok, true);
  assert.equal(store.setParameter("angulo", "90°", { unit: "deg" }).ok, true);

  const map = store.getValueMap();
  const resolveVar = (k: string) => map[k];

  const e1 = evaluateSafeParameterExpression("2 * largura + 5 mm", resolveVar);
  assert.equal(e1.ok, true);
  approx(e1.value, 85, 1e-6, "2 * largura + 5 mm");

  const e2 = evaluateSafeParameterExpression("1 in + 5 mm", resolveVar);
  assert.equal(e2.ok, true);
  approx(e2.value, 30.4, 1e-6, "1 in + 5 mm");

  const e3 = evaluateSafeParameterExpression("angulo / 2", resolveVar);
  assert.equal(e3.ok, true);
  approx(e3.value, 45, 1e-6, "angulo / 2");

  // Ciclo A = B + 1; B = A + 1 -> bloqueado pelo detector DFS
  assert.equal(store.setParameter("B", "10", { unit: "mm" }).ok, true);
  assert.equal(store.setParameter("A", "B + 1", { unit: "mm" }).ok, true);
  const cyc = store.setParameter("B", "A + 1", { unit: "mm" });
  assert.equal(cyc.ok, false, "Referência circular deve ser bloqueada");
  assert.ok(cyc.cyclePath && cyc.cyclePath.length >= 2, "Deve retornar caminho do ciclo");
  assert.ok(cyc.error && /circular/i.test(cyc.error));

  // Configurações (Flange DN50 / DN100 / DN150)
  assert.ok(store.getConfigurations().length >= 3);
  const cfgRes = store.applyConfiguration("cfg_dn150");
  assert.equal(cfgRes.ok, true);
});

test("O8 — Timeline Paramétrica: Edição, Rollback, Supressão e Cache Incremental", () => {
  const { engine, evaluator } = createChamferParametricEngine(createEmptyParametricDocument(STEEL_DENSITY_KG_M3));
  assert.equal(
    engine.runSafeCommand("solid.extrude", {
      id: "bloco_1",
      widthMm: 100,
      depthMm: 60,
      heightMm: 24,
    }).ok,
    true,
  );
  approx(engine.getState().totalMassProps.volumeMm3, 144000, 1e-4, "Volume inicial 100×60×24");

  // Editar h para 32 mm -> 192 000 mm³
  assert.equal(engine.runSafeCommand("timeline.edit", { nodeId: "bloco_1", heightMm: 32 }).ok, true);
  approx(engine.getState().totalMassProps.volumeMm3, 192000, 1e-4, "Volume após h=32mm");

  // Adicionar fillet
  assert.equal(
    engine.runSafeCommand("solid.fillet", {
      id: "fillet_1",
      radiusMm: 4,
      edgeLengthTotalMm: 320,
      targetBodyId: "bloco_1",
    }).ok,
    true,
  );
  const volWithFillet = engine.getState().totalMassProps.volumeMm3;
  assert.ok(volWithFillet < 192000 && volWithFillet > 180000, "Fillet deve reduzir volume");

  // Suprimir fillet devolve 192 000 mm³; reativar devolve exatamente volWithFillet
  assert.equal(engine.runSafeCommand("timeline.suppress", { nodeId: "fillet_1", suppressed: true }).ok, true);
  approx(engine.getState().totalMassProps.volumeMm3, 192000, 1e-6, "Fillet suprimido");
  assert.ok(evaluator.lastCacheHitNodeIds.includes("bloco_1"), "Nó anterior deve vir do cache incremental");

  assert.equal(engine.runSafeCommand("timeline.suppress", { nodeId: "fillet_1", suppressed: false }).ok, true);
  approx(engine.getState().totalMassProps.volumeMm3, volWithFillet, 1e-6, "Fillet reativado exatamente");

  // Arrastar marcador de Rollback antes da extrusão (index 0) oculta o corpo
  assert.equal(engine.runSafeCommand("timeline.rollback", { rollbackIndex: 0 }).ok, true);
  assert.equal(engine.getState().bodies.length, 0);
  approx(engine.getState().totalMassProps.volumeMm3, 0, 1e-6, "Rollback para 0 oculta corpo");
});

test("O9 — Press-Pull (+8mm -> 192 000 mm³) e Thin Extrude (L aberto 50+50mm, t=3mm, h=40mm)", () => {
  const { engine } = createChamferParametricEngine(createEmptyParametricDocument(STEEL_DENSITY_KG_M3));
  assert.equal(
    engine.runSafeCommand("solid.extrude", {
      id: "bloco_base",
      widthMm: 100,
      depthMm: 60,
      heightMm: 24,
    }).ok,
    true,
  );
  assert.equal(
    engine.runSafeCommand("solid.pressPull", {
      id: "pp_top",
      targetFaceKey: "bloco_base:top",
      deltaMm: 8,
    }).ok,
    true,
  );
  approx(engine.getState().totalMassProps.volumeMm3, 192000, 1e-4, "Press-Pull +8mm igual a O8");

  // Thin Extrude sobre L aberto 50 + 50 mm, espessura t=3mm, altura 40mm
  const { engine: thinEng } = createChamferParametricEngine(createEmptyParametricDocument(STEEL_DENSITY_KG_M3));
  const thinRes = thinEng.runSafeCommand("solid.thinExtrude", {
    id: "parede_L",
    polyline: [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
    ],
    thicknessMm: 3,
    heightMm: 40,
    side: "center",
  });
  assert.equal(thinRes.ok, true);
  const thinVol = thinRes.state.totalMassProps.volumeMm3;
  // L centro 50 + 50 mm, largura 3 mm -> área ~ 100 * 3 = 300 mm² -> volume ~ 12 000 mm³
  approx(thinVol, 12000, 50, "Parede sólida contínua Thin Extrude");

  // Plane Along Path s ∈ [0, 1]
  const pl = computePlaneAlongPath(
    [
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 0, z: 0 },
    ],
    0.5,
  );
  approx(pl.origin.x, 50, 1e-6, "Plane Along Path s=0.5");
  approx(pl.normal.x, 1, 1e-6, "Normal tangente ao caminho");
});

test("O10 — Replay Determinístico: replayProject(commandLog) reproduz Volume, Área e Bounding Box (±1e-6)", () => {
  const { engine: engA } = createChamferParametricEngine(createEmptyParametricDocument(STEEL_DENSITY_KG_M3));
  engA.runSafeCommand("solid.extrude", { id: "e1", widthMm: 120, depthMm: 80, heightMm: 10 });
  engA.runSafeCommand("solid.hole", { id: "h1", diameterMm: 22, through: true, targetFaceKey: "e1:top" });
  engA.runSafeCommand("solid.pressPull", { id: "pp1", targetFaceKey: "e1:top", deltaMm: 5 });
  engA.runSafeCommand("solid.fillet", { id: "f1", radiusMm: 3, edgeLengthTotalMm: 400, targetBodyId: "e1" });

  const log = engA.getCommandLog();
  const stateA = engA.getState();

  const { engine: engB } = createChamferParametricEngine(createEmptyParametricDocument(STEEL_DENSITY_KG_M3));
  const replay = engB.replayProject(log, createEmptyParametricDocument(STEEL_DENSITY_KG_M3));
  assert.equal(replay.ok, true);
  assert.equal(replay.replayedCount, log.length);

  const mpA = stateA.totalMassProps;
  const mpB = replay.state.totalMassProps;
  approx(mpB.volumeMm3, mpA.volumeMm3, 1e-6, "Replay Volume");
  approx(mpB.surfaceAreaMm2, mpA.surfaceAreaMm2, 1e-6, "Replay Area");
  approx(mpB.bounds.max.x, mpA.bounds.max.x, 1e-6, "Replay BBox max.x");
  approx(mpB.bounds.max.y, mpA.bounds.max.y, 1e-6, "Replay BBox max.y");
  approx(mpB.bounds.max.z, mpA.bounds.max.z, 1e-6, "Replay BBox max.z");
});

test("O11 — Entradas Hostis (Nunca Travar): NaN, Infinity, 1e308, raio -10 e DXF corrompido", () => {
  assert.equal(sanitizeNumericInput(Number.NaN).ok, false);
  assert.equal(sanitizeNumericInput(Number.POSITIVE_INFINITY).ok, false);
  assert.equal(sanitizeNumericInput(1e308).ok, false);
  assert.equal(sanitizeNumericInput(-10, { positiveOnly: true }).ok, false);
  assert.equal(sanitizeDxfContent("LIXO_CORROMPIDO_SEM_EOF\x00\x01").ok, false);

  const { engine } = createChamferParametricEngine(createEmptyParametricDocument(STEEL_DENSITY_KG_M3));
  assert.equal(
    engine.runSafeCommand("solid.extrude", { id: "safe_1", widthMm: 100, depthMm: 50, heightMm: 10 }).ok,
    true,
  );
  const beforeVol = engine.getState().totalMassProps.volumeMm3;

  // Tentar comandos hostis — nenhum deve lançar exceção e o estado anterior deve permanecer íntegro
  const hostileCalls = [
    engine.runSafeCommand("solid.fillet", { radiusMm: -10, targetBodyId: "safe_1" }),
    engine.runSafeCommand("solid.extrude", { widthMm: Number.NaN, depthMm: 10, heightMm: 10 }),
    engine.runSafeCommand("solid.extrude", { widthMm: Number.POSITIVE_INFINITY, depthMm: 10, heightMm: 10 }),
    engine.runSafeCommand("solid.extrude", { widthMm: 1e308, depthMm: 10, heightMm: 10 }),
  ];
  for (const res of hostileCalls) {
    assert.equal(res.ok, false);
    assert.equal(res.rolledBack, true);
  }
  approx(engine.getState().totalMassProps.volumeMm3, beforeVol, 1e-9, "Estado preservado integralmente");
});

test("Extra Pilar 3 & 7 — Auto-Profile Regions (DCEL retângulo dividido ao meio + furo), Spline, Fillet/Chamfer 2D, Texto Cut/Etch, Interferência e Vista->DXF", async () => {
  // Retângulo 100x50 dividido ao meio em x=50 por uma linha vertical + linha de construção ignorada + furo interno
  const regions = extractAutoProfileRegions([
    { id: "b1", kind: "line", x1: 0, y1: 0, x2: 100, y2: 0 },
    { id: "b2", kind: "line", x1: 100, y1: 0, x2: 100, y2: 50 },
    { id: "b3", kind: "line", x1: 100, y1: 50, x2: 0, y2: 50 },
    { id: "b4", kind: "line", x1: 0, y1: 50, x2: 0, y2: 0 },
    { id: "div", kind: "line", x1: 50, y1: -5, x2: 50, y2: 55 },
    { id: "constr", kind: "line", x1: 0, y1: 25, x2: 100, y2: 25, isConstruction: true },
    { id: "hole", kind: "circle", cx: 25, cy: 25, radius: 5 },
  ]);
  assert.equal(regions.length, 2, "Retângulo dividido ao meio deve gerar exatamente 2 regiões fechadas");
  const hitLeft = hitTestProfileRegion(regions, 10, 25);
  assert.ok(hitLeft, "1 toque na região esquerda deve selecionar a região");
  assert.equal(hitLeft.holes.length, 1, "Região esquerda deve detectar o furo interno");
  assert.equal(hitTestProfileRegion(regions, 25, 25), null, "Toque dentro do furo não seleciona a face");

  // Spline, Fillet/Chamfer 2D e Texto Cut vs Etch
  const splinePts = evaluateCubicControlSpline([{ x: 0, y: 0 }, { x: 20, y: 30 }, { x: 50, y: 0 }], 8);
  assert.ok(splinePts.length > 10);
  const ch2d = applyBatchFilletChamfer2D(
    [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }],
    { kind: "chamfer", chamferMode: "distanceAngle", d1: 4, angleDeg: 45 },
  );
  assert.equal(ch2d.length, 8);
  const txtCut = generateTechnicalTextPaths("A1", 10, "cut");
  const txtEtch = generateTechnicalTextPaths("A1", 10, "etch");
  assert.ok(txtCut.polylines.length > 0 && txtEtch.polylines.length > 0);

  // Interferência assíncrona & Vista -> DXF
  const { engine } = createChamferParametricEngine();
  engine.runSafeCommand("solid.extrude", { id: "a", widthMm: 50, depthMm: 50, heightMm: 50 });
  engine.runSafeCommand("solid.extrude", { id: "b", widthMm: 50, depthMm: 50, heightMm: 50, originX: 25 });
  const report = await runInterferenceAnalysisAsync(engine.getState().bodies);
  assert.equal(report.conflicts.length, 1);
  approx(report.conflicts[0]!.overlapVolumeMm3, 25 * 50 * 50, 1e-2);

  const viewDxf = projectCurrentViewToDxf(
    [{ a: { x: 0, y: 0, z: 0 }, b: { x: 100, y: 0, z: 0 } }],
    { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, viewDir: { x: 0, y: 0, z: 1 } },
  );
  assert.ok(viewDxf.includes("VISIBLE") && viewDxf.includes("LINE"));
});
