/**
 * CALDRA CHAMFER — SUÍTE DE TESTES ORÁCULO DE CHAPA METÁLICA (BEND TREE & DETECTOR DIEDRO)
 *
 * Executa os 4 Testes Oráculo obrigatórios via `node:test`:
 * - Teste 1: Dobrar com grau explícito + compensação ABNT/ISO exata (BA, OSSB, BD, L_flat ±0.001mm)
 * - Teste 2: Ciclo completo Dobrar (45° UP e 135° DOWN) -> Desdobrar Todas -> Furar (incl. sobre dobra) -> Redobrar Todas
 * - Teste 3: Detector Automático de Ângulo Diedro em Sólido 3D Genérico (L 90° e L 60° sem BendTree prévia)
 * - Teste 4: Edição Paramétrica na Timeline (90° -> 60°, expressão fx, Rollback), Entradas Hostis e DXF Inside-Out não destrutivo
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SHEET_METAL_RULES,
  addHoleOrCutoutToBody,
  computeBodyFlatPattern,
  createContourFlangeBody,
  createSheetMetalBodyFromBase,
  deserializeSheetMetalBody,
  exportLaserInsideOutDxf,
  foldSheetMetalBody,
  refoldSheetMetalBody,
  serializeSheetMetalBody,
  unfoldSheetMetalBody,
  type SheetMetalRule,
} from "../sheetMetal/bendTree";
import {
  computeBendDevelopment,
  evaluateBendTree,
  validateBendInputs,
} from "../sheetMetal/bendMath";
import {
  buildExtrudedProfileMeshFromPolyline2D,
  detectDihedralBendsFromMesh,
} from "../sheetMetal/dihedralDetector";
import {
  createChamferParametricEngine,
  createEmptyParametricDocument,
} from "../core/timelineEvaluator";

function assertClose(actual: number, expected: number, tol = 0.001, label = "") {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: esperado ${expected.toFixed(4)} ±${tol}, obtido ${actual.toFixed(4)}`,
  );
}

/* ============================================================================
 * TESTE ORÁCULO 1: DOBRAR COM GRAU EXPLÍCITO E COMPENSAÇÃO EXATA (BA/OSSB/BD)
 * ============================================================================ */
test("Oráculo 1: Dobrar (Fold) com compensação exata ABNT/ISO (L 40+30 T=3 R=3 K=0.33 e L 50+50 T=2 R=2 K=0.40)", () => {
  // Caso A: L 40+30, 90°, T=3, R=3, K=0.33
  const ruleA: SheetMetalRule = {
    ...DEFAULT_SHEET_METAL_RULES[4]!,
    thicknessMm: 3,
    innerRadiusMm: 3,
    kFactor: 0.33,
  };
  const mathA = computeBendDevelopment(90, 3, 3, 0.33);
  assertClose(mathA.bendAllowanceMm, 6.2675, 0.001, "Caso A BA");
  assertClose(mathA.outsideSetbackMm, 6.0, 0.001, "Caso A OSSB");
  assertClose(mathA.bendDeductionMm, 5.7325, 0.001, "Caso A BD");

  const baseA = createSheetMetalBodyFromBase({
    name: "Chapa L 40x30",
    lengthXMm: 70,
    widthYMm: 80,
    rule: ruleA,
  });
  const foldedA = foldSheetMetalBody(baseA, {
    distanceFromEdgeMm: 40,
    childExternalLegMm: 30,
    targetAngleDeg: 90,
    direction: "UP",
  });
  assert.equal(foldedA.ok, true);
  const flatA = computeBodyFlatPattern(foldedA.body);
  assertClose(flatA.developedLengthMm, 64.2675, 0.001, "Caso A L_flat");

  // Caso B: L 50+50, 90°, T=2, R=2, K=0.40
  const ruleB: SheetMetalRule = {
    ...DEFAULT_SHEET_METAL_RULES[2]!,
    thicknessMm: 2,
    innerRadiusMm: 2,
    kFactor: 0.4,
  };
  const bodyB = createContourFlangeBody({
    name: "Chapa L 50x50",
    extrudeWidthMm: 100,
    externalLegsMm: [50, 50],
    bendAnglesDeg: [90],
    rule: ruleB,
  });
  const flatB = computeBodyFlatPattern(bodyB);
  const bendB = Object.values(bodyB.bends)[0]!;
  assertClose(bendB.bendAllowanceMm, 4.3982, 0.001, "Caso B BA");
  assertClose(bendB.outsideSetbackMm, 4.0, 0.001, "Caso B OSSB");
  assertClose(bendB.bendDeductionMm, 3.6018, 0.001, "Caso B BD");
  assertClose(flatB.developedLengthMm, 96.3982, 0.001, "Caso B L_flat");

  // Validação da malha 3D gerada (sem NaN, zona cilíndrica suave presente)
  const eval3D = evaluateBendTree(foldedA.body);
  assert.ok(eval3D.tessellatedShape.mesh.vertexCount > 24, "Malha 3D deve conter segmentos da zona de dobra");
  for (let i = 0; i < eval3D.tessellatedShape.mesh.positions.length; i++) {
    assert.ok(Number.isFinite(eval3D.tessellatedShape.mesh.positions[i]), "Posição 3D deve ser finita");
  }
  const zSpan = eval3D.tessellatedShape.bounds.max.z - eval3D.tessellatedShape.bounds.min.z;
  assert.ok(zSpan > 15, `Chapa dobrada 90° deve ter projeção em Z > 15mm (obtido ${zSpan.toFixed(2)}mm)`);

  // Serialização / Desserialização com schemaVersion preservado
  const roundTrip = deserializeSheetMetalBody(serializeSheetMetalBody(foldedA.body));
  assert.ok(roundTrip, "Desserialização da SheetMetalBody deve ter sucesso");
  assert.equal(roundTrip!.schemaVersion, foldedA.body.schemaVersion);
  assert.equal(Object.values(roundTrip!.bends)[0]!.targetAngleDeg, 90);
});

/* ============================================================================
 * TESTE ORÁCULO 2: CICLO COMPLETO DOBRAR -> DESDOBRAR -> FURAR -> REDOBRAR
 * ============================================================================ */
test("Oráculo 2: Ciclo Dobrar (45° UP e 135° DOWN) -> Desdobrar Todas -> Furar sobre Dobra -> Redobrar Todas", () => {
  const rule: SheetMetalRule = {
    ...DEFAULT_SHEET_METAL_RULES[2]!,
    thicknessMm: 2,
    innerRadiusMm: 2,
    kFactor: 0.4,
  };
  let body = createSheetMetalBodyFromBase({
    name: "Chapa Multi-Dobra",
    lengthXMm: 120,
    widthYMm: 60,
    rule,
  });

  // 1. Dobra 1: 45° UP
  const f1 = foldSheetMetalBody(body, {
    bendId: "b_45_up",
    distanceFromEdgeMm: 40,
    childExternalLegMm: 40,
    targetAngleDeg: 45,
    direction: "UP",
  });
  assert.equal(f1.ok, true);
  body = f1.body;
  const child1Id = body.bends["b_45_up"]!.childFlangeId;

  // 2. Dobra 2 na aba recém-criada: 135° DOWN
  const f2 = foldSheetMetalBody(body, {
    bendId: "b_135_down",
    targetFlangeId: child1Id,
    distanceFromEdgeMm: 35,
    childExternalLegMm: 35,
    targetAngleDeg: 135,
    direction: "DOWN",
  });
  assert.equal(f2.ok, true);
  body = f2.body;
  const child2Id = body.bends["b_135_down"]!.childFlangeId;

  assert.equal(body.bends["b_45_up"]!.targetAngleDeg, 45);
  assert.equal(body.bends["b_45_up"]!.direction, "UP");
  assert.equal(body.bends["b_135_down"]!.targetAngleDeg, 135);
  assert.equal(body.bends["b_135_down"]!.direction, "DOWN");

  // 3. Desdobrar Todas
  body = unfoldSheetMetalBody(body);
  assert.equal(body.bends["b_45_up"]!.state, "UNFOLDED");
  assert.equal(body.bends["b_135_down"]!.state, "UNFOLDED");
  // targetAngleDeg e direction devem permanecer intactos!
  assert.equal(body.bends["b_45_up"]!.targetAngleDeg, 45);
  assert.equal(body.bends["b_135_down"]!.targetAngleDeg, 135);

  const evalFlat = evaluateBendTree(body);
  assert.equal(evalFlat.unfoldedBendLinesWorld.length, 2, "Deve exibir 2 linhas de dobra na chapa desdobrada");
  // Verifica que a altura máxima em Z da malha desdobrada é exatamente T = 2mm (100% coplanar)
  const flatZSpan = evalFlat.tessellatedShape.bounds.max.z - evalFlat.tessellatedShape.bounds.min.z;
  assertClose(flatZSpan, 2.0, 0.05, "Espessura Z da chapa 100% desdobrada");
  for (const fl of evalFlat.flanges) {
    assertClose(fl.worldNormal[2], 1.0, 0.001, `Normal Z da flange ${fl.flangeId} desdobrada`);
  }

  // 4. Furar na chapa desdobrada (1 furo na aba raiz + 1 furo cruzando a zona da dobra de 45°)
  const h1 = addHoleOrCutoutToBody(body, {
    cutoutId: "hole_flange",
    flangeId: body.rootFlangeId,
    cx: 15,
    cy: 30,
    diameterMm: 8,
  });
  assert.equal(h1.ok, true);
  body = h1.body;

  const bend1OriginX = body.bends["b_45_up"]!.axisOriginLocal[0];
  const bend1MidX = bend1OriginX + body.bends["b_45_up"]!.bendAllowanceMm * 0.5;
  const h2 = addHoleOrCutoutToBody(body, {
    cutoutId: "hole_cross_bend",
    cx: bend1MidX,
    cy: 30,
    diameterMm: 6,
    acrossBend: true,
  });
  assert.equal(h2.ok, true);
  body = h2.body;
  assert.ok(body.crossBendCutouts.some((c) => c.cutoutId === "hole_cross_bend"));

  // 5. Redobrar Todas
  body = refoldSheetMetalBody(body);
  assert.equal(body.bends["b_45_up"]!.state, "FOLDED");
  assert.equal(body.bends["b_135_down"]!.state, "FOLDED");
  assert.equal(body.bends["b_45_up"]!.targetAngleDeg, 45);
  assert.equal(body.bends["b_135_down"]!.targetAngleDeg, 135);

  const evalRefolded = evaluateBendTree(body);
  const refoldedZSpan = evalRefolded.tessellatedShape.bounds.max.z - evalRefolded.tessellatedShape.bounds.min.z;
  assert.ok(refoldedZSpan > 15, "Peça redobrada deve recuperar geometria 3D");

  // Confirma que o recorte sobre a dobra foi mapeado em 3D sobre o cilindro dobrado
  const evalBend1 = evalRefolded.bends.find((b) => b.bendId === "b_45_up")!;
  assert.ok(evalBend1.mappedCrossCutouts.length >= 1, "Furo sobre dobra deve estar mapeado em 3D no cilindro");
  const mappedPts = evalBend1.mappedCrossCutouts[0]!.points3D;
  assert.ok(mappedPts.length >= 8);
  assert.ok(mappedPts.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2])));

  // Confirma orientação exata da aba 1 após 45° UP
  const fl1 = evalRefolded.flanges.find((f) => f.flangeId === child1Id)!;
  const angleFl1 = (Math.acos(Math.max(-1, Math.min(1, fl1.worldNormal[2]))) * 180) / Math.PI;
  assertClose(angleFl1, 45, 0.1, "Ângulo real da aba 1 após Refold (45° UP)");

  // Aba 2: +45° UP seguido de -135° DOWN => ângulo resultante acumulado = 90° em relação ao plano Z
  const fl2 = evalRefolded.flanges.find((f) => f.flangeId === child2Id)!;
  const angleFl2 = (Math.acos(Math.max(-1, Math.min(1, fl2.worldNormal[2]))) * 180) / Math.PI;
  assertClose(angleFl2, 90, 0.1, "Ângulo composto real da aba 2 após Refold (+45° - 135° = -90°)");
});

/* ============================================================================
 * TESTE ORÁCULO 3: DETECTOR AUTOMÁTICO DE ÂNGULO DIEDRO EM SÓLIDO 3D GENÉRICO
 * ============================================================================ */
test("Oráculo 3: Detector Automático de Ângulo Diedro em Sólido 3D Genérico (L 90° e L 60° sem BendTree)", () => {
  const rule: SheetMetalRule = {
    ...DEFAULT_SHEET_METAL_RULES[4]!,
    thicknessMm: 3,
    innerRadiusMm: 3,
    kFactor: 0.33,
  };

  // 1. Sólido genérico em L 90° (extrudado sem Edge Flange / sem histórico)
  const mesh90 = buildExtrudedProfileMeshFromPolyline2D(
    [
      [0, 0],
      [50, 0],
      [50, 40],
    ],
    3,
    80,
  );
  const det90 = detectDihedralBendsFromMesh(mesh90, { fallbackRule: rule });
  assert.equal(det90.ok, true, `Detecção 90° falhou: ${det90.error}`);
  assert.equal(det90.detectedBends.length, 1, "Deve detectar exatamente 1 dobra no perfil L 90°");
  assertClose(det90.detectedBends[0]!.bendAngleDeg, 90, 0.2, "Ângulo diedro 90°");
  assertClose(det90.inferredThicknessMm, 3, 0.1, "Espessura inferida T=3mm");
  assert.ok(det90.confirmationChipText.includes("90.0°"), "Chip de confirmação deve exibir 90.0°");
  assert.ok(det90.body, "Deve gerar SheetMetalBody válida");

  // Desdobrar o sólido recém-detectado
  const unfolded90 = unfoldSheetMetalBody(det90.body!);
  const evalUnfolded90 = evaluateBendTree(unfolded90);
  const zSpan90 = evalUnfolded90.tessellatedShape.bounds.max.z - evalUnfolded90.tessellatedShape.bounds.min.z;
  assertClose(zSpan90, 3.0, 0.1, "Peça detectada 90° deve desdobrar para 100% plana (Z=T=3mm)");

  // 2. Sólido genérico em L 60° (deflexão de 60° a partir do eixo X)
  const rad60 = (60 * Math.PI) / 180;
  const mesh60 = buildExtrudedProfileMeshFromPolyline2D(
    [
      [0, 0],
      [50, 0],
      [50 + Math.cos(rad60) * 40, Math.sin(rad60) * 40],
    ],
    2.5,
    70,
  );
  const det60 = detectDihedralBendsFromMesh(mesh60, { fallbackRule: { ...rule, thicknessMm: 2.5 } });
  assert.equal(det60.ok, true, `Detecção 60° falhou: ${det60.error}`);
  assert.equal(det60.detectedBends.length, 1, "Deve detectar exatamente 1 dobra no perfil L 60°");
  assertClose(det60.detectedBends[0]!.bendAngleDeg, 60, 0.25, "Ângulo diedro 60°");
  assertClose(det60.inferredThicknessMm, 2.5, 0.1, "Espessura inferida T=2.5mm");
  assert.ok(det60.confirmationChipText.includes("60.0°"), "Chip de confirmação deve exibir 60.0°");
});

/* ============================================================================
 * TESTE ORÁCULO 4: EDIÇÃO PARAMÉTRICA NA TIMELINE, ENTRADAS HOSTIS & DXF INSIDE-OUT
 * ============================================================================ */
test("Oráculo 4: Edição Paramétrica na Timeline (90° -> 60° + fx + Rollback), Entradas Hostis e DXF Inside-Out sem mutar o 3D", () => {
  const { engine } = createChamferParametricEngine(createEmptyParametricDocument());

  // 1. Criar chapa base + dobrar 90° via motor de comandos
  const baseRes = engine.runSafeCommand("sheet.base", {
    id: "base_1",
    lengthMm: 70,
    widthMm: 80,
    thicknessMm: 3,
    innerRadiusMm: 3,
    kFactor: 0.33,
  });
  assert.equal(baseRes.ok, true, `sheet.base falhou: ${baseRes.error}`);

  const foldRes = engine.runSafeCommand("sheet.fold", {
    id: "fold_1",
    bendId: "fold_1",
    distanceFromEdgeMm: 40,
    childExternalLegMm: 30,
    targetAngleDeg: 90,
    direction: "UP",
  });
  assert.equal(foldRes.ok, true, `sheet.fold falhou: ${foldRes.error}`);
  const flatBefore = computeBodyFlatPattern(engine.getState().sheetMetalBody!);
  assertClose(flatBefore.developedLengthMm, 64.2675, 0.001, "L_flat inicial em 90°");

  // 2. Editar nó `fold_1` na Timeline de 90° -> 60° e confirmar rebuild imediato
  const editRes = engine.runSafeCommand("timeline.edit", {
    nodeId: "fold_1",
    targetAngleDeg: 60,
  });
  assert.equal(editRes.ok, true, `timeline.edit falhou: ${editRes.error}`);
  const editedBody = engine.getState().sheetMetalBody!;
  assert.equal(editedBody.bends["fold_1"]!.targetAngleDeg, 60);
  const flatAfter60 = computeBodyFlatPattern(editedBody);
  assert.ok(
    Math.abs(flatAfter60.developedLengthMm - flatBefore.developedLengthMm) > 1.0,
    "Flat Pattern deve recalcular imediatamente ao editar o ângulo de 90° para 60°",
  );

  // 3. Vincular expressão paramétrica `ang_dobra` via ParameterStore
  engine.runSafeCommand("parameters.set", { name: "ang_dobra", expression: "75", unit: "deg" });
  engine.runSafeCommand("timeline.edit", {
    nodeId: "fold_1",
    angleExpression: "ang_dobra",
  });
  assert.equal(engine.getState().sheetMetalBody!.bends["fold_1"]!.targetAngleDeg, 75);

  engine.runSafeCommand("parameters.set", { name: "ang_dobra", expression: "120", unit: "deg" });
  assert.equal(engine.getState().sheetMetalBody!.bends["fold_1"]!.targetAngleDeg, 120);

  // 4. Rollback antes da dobra remove a dobra e restaurar rollback traz de volta
  engine.runSafeCommand("timeline.rollback", { rollbackIndex: 1 });
  assert.equal(Object.keys(engine.getState().sheetMetalBody!.bends).length, 0);
  engine.runSafeCommand("timeline.rollback", { rollbackIndex: 2 });
  assert.equal(Object.keys(engine.getState().sheetMetalBody!.bends).length, 1);
  assert.equal(engine.getState().sheetMetalBody!.bends["fold_1"]!.targetAngleDeg, 120);

  // 5. Entradas hostis devem ser rejeitadas com segurança sem crash e sem corromper o estado
  const stateBeforeHostile = engine.getState().sheetMetalBody!;
  for (const badAngle of [0, -10, Number.NaN, 185]) {
    const v = validateBendInputs({
      angleDeg: badAngle,
      thicknessMm: 3,
      innerRadiusMm: 3,
      kFactor: 0.33,
    });
    assert.equal(v.ok, false, `Ângulo hostil ${badAngle} deve ser rejeitado`);
    const badCmd = engine.runSafeCommand("sheet.fold", {
      targetAngleDeg: badAngle,
      distanceFromEdgeMm: 20,
    });
    assert.equal(badCmd.ok, false, `Comando sheet.fold com ângulo ${badAngle} deve retornar ok=false`);
  }
  const badT = validateBendInputs({
    angleDeg: 90,
    thicknessMm: 0,
    innerRadiusMm: 3,
    kFactor: 0.33,
  });
  assert.equal(badT.ok, false, "Espessura T=0 deve ser rejeitada");
  assert.equal(
    engine.getState().sheetMetalBody!.bends["fold_1"]!.targetAngleDeg,
    stateBeforeHostile.bends["fold_1"]!.targetAngleDeg,
    "Estado da peça não deve ser corrompido por entradas hostis",
  );

  // 6. Flat Pattern + Exportação DXF Laser Inside-Out sem mutar o estado FOLDED da peça 3D
  engine.runSafeCommand("sheet.hole", { diameterMm: 10, x: 15, y: 40 });
  const foldedBodyBeforeFlat = engine.getState().sheetMetalBody!;
  assert.equal(foldedBodyBeforeFlat.bends["fold_1"]!.state, "FOLDED");

  const flat = computeBodyFlatPattern(foldedBodyBeforeFlat);
  const dxf = exportLaserInsideOutDxf(flat);
  const idxCut = dxf.indexOf("\nCUT\n");
  const idxOutline = dxf.indexOf("\nOUTLINE\n");
  assert.ok(idxCut > 0 && idxOutline > 0, "DXF deve conter camadas CUT e OUTLINE");
  assert.ok(idxCut < idxOutline, "DXF Laser Inside-Out deve emitir CUT estritamente antes de OUTLINE");
  assert.ok(dxf.includes("BEND_UP") || dxf.includes("BEND_DOWN"), "DXF deve conter camada de linha de dobra");

  // Confirma que computeBodyFlatPattern NÃO alterou o estado 3D FOLDED original
  assert.equal(
    foldedBodyBeforeFlat.bends["fold_1"]!.state,
    "FOLDED",
    "Gerar Flat Pattern e DXF jamais pode alterar o estado FOLDED da peça 3D",
  );
});
