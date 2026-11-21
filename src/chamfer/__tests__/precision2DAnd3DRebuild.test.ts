import test from "node:test";
import assert from "node:assert/strict";
import type { Entity } from "../../lib/lab2d/core";
import {
  createPolarPointerArbiterState,
  polarArbiterPointerDown,
  polarArbiterPointerMove,
  polarArbiterPointerUp,
  POLAR_MICRO_CONFIRM_MS,
  POLAR_POST_PINCH_COOLDOWN_MS,
} from "../tools/polarReferenceEngine";
import { computeUniversalFillet2D } from "../tools/universalFillet2D";
import {
  hitTestTraceSubPiece,
  collectTraceSubPiecesCrossedByFence,
  buildTracePartPreview,
  commitTracePartToRealEntities,
  countReferenceGuideEntities,
  removeAllReferenceGuides,
} from "../tools/tracePartEngine2D";
import {
  hitTestTrimSubPiece,
  commitTrimBatch,
} from "../tools/trimEngine2D";
import {
  canonicalArcSweep,
  sampleCanonicalArcPoints,
  buildPlanarSolidsFromEntities2D,
  buildThreeExtrudedSolids,
  pointInPolygonRayCast,
  computeGuaranteedInteriorPoint,
} from "../geometry/planarTo3DBuilder";
import { solidShapes } from "../../lib/lab2d/solid3d";
import { buildDirectTopology3DScene } from "../../lib/lab2d/cadDirectModeling3D";

// ============================================================================
// TESTE 1 — REF. POLAR: TRAVA ABSOLUTA CONTRA PINÇA/ZOOM COM 2 DEDOS
// ============================================================================
test("Teste 1 — Ref. Polar: 5 ciclos consecutivos de pinça/zoom com 2 dedos geram 0 origens acidentais", () => {
  const arbiter = createPolarPointerArbiterState();
  let t = 1000;
  let accidentalCommits = 0;

  for (let cycle = 0; cycle < 5; cycle++) {
    // 1º dedo toca a tela
    const a1 = polarArbiterPointerDown(arbiter, {
      pointerId: 10 + cycle * 2,
      screen: { x: 200, y: 200 },
      world: { x: 50, y: 50 },
      nowMs: t,
      hasExistingOrigin: false,
    });
    assert.equal(a1.kind, "none", "1º pointerdown nunca deve cravar origem imediatamente");

    // 2º dedo chega 25ms depois (início de pinça/zoom)
    t += 25;
    const a2 = polarArbiterPointerDown(arbiter, {
      pointerId: 11 + cycle * 2,
      screen: { x: 280, y: 210 },
      world: { x: 90, y: 55 },
      nowMs: t,
      hasExistingOrigin: false,
    });
    assert.equal(a2.kind, "abort_and_restore_pre_gesture", "2º dedo deve disparar trava absoluta de pinça");

    // Movimentos de pinça/pan com os 2 dedos
    for (let step = 1; step <= 4; step++) {
      t += 16;
      const m1 = polarArbiterPointerMove(arbiter, {
        pointerId: 10 + cycle * 2,
        screen: { x: 200 - step * 8, y: 200 - step * 4 },
        world: { x: 50 - step * 4, y: 50 - step * 2 },
        nowMs: t,
      });
      const m2 = polarArbiterPointerMove(arbiter, {
        pointerId: 11 + cycle * 2,
        screen: { x: 280 + step * 8, y: 210 + step * 4 },
        world: { x: 90 + step * 4, y: 55 + step * 2 },
        nowMs: t,
      });
      assert.equal(m1.kind, "none");
      assert.equal(m2.kind, "none");
    }

    // 1º dedo sai, 2º dedo ainda fica 35ms (caso clássico que quebrava o fluxo antigo!)
    t += 20;
    const u1 = polarArbiterPointerUp(arbiter, {
      pointerId: 10 + cycle * 2,
      world: { x: 34, y: 42 },
      nowMs: t,
    });
    assert.equal(u1.kind, "none", "Soltar 1º dedo durante pinça não pode disparar clique");

    t += 35;
    const mResidual = polarArbiterPointerMove(arbiter, {
      pointerId: 11 + cycle * 2,
      screen: { x: 315, y: 230 },
      world: { x: 108, y: 65 },
      nowMs: t,
    });
    assert.equal(mResidual.kind, "none", "Movimento residual do 2º dedo permanece travado");

    t += 15;
    const u2 = polarArbiterPointerUp(arbiter, {
      pointerId: 11 + cycle * 2,
      world: { x: 108, y: 65 },
      nowMs: t,
    });
    if (u2.kind === "commit_single_tap") accidentalCommits++;
    assert.equal(u2.kind, "none", "Soltar 2º dedo destrava apenas após cooldown sem criar Ref. Polar");

    // Toque acidental dentro do cooldown de 160ms também é ignorado
    t += 40;
    const reboteDown = polarArbiterPointerDown(arbiter, {
      pointerId: 99,
      screen: { x: 250, y: 250 },
      world: { x: 75, y: 75 },
      nowMs: t,
      hasExistingOrigin: false,
    });
    const reboteUp = polarArbiterPointerUp(arbiter, {
      pointerId: 99,
      world: { x: 75, y: 75 },
      nowMs: t + 20,
    });
    assert.equal(reboteDown.kind, "none");
    assert.equal(reboteUp.kind, "none");

    t += POLAR_POST_PINCH_COOLDOWN_MS + 40;
  }

  assert.equal(accidentalCommits, 0, "Zero origens ou referências acidentais em 5 ciclos de pinça");

  // Agora um toque limpo com 1 único dedo após o cooldown DEVE funcionar normalmente
  const cleanDown = polarArbiterPointerDown(arbiter, {
    pointerId: 201,
    screen: { x: 300, y: 300 },
    world: { x: 100, y: 120 },
    nowMs: t,
    hasExistingOrigin: false,
  });
  assert.equal(cleanDown.kind, "none");

  const cleanUp = polarArbiterPointerUp(arbiter, {
    pointerId: 201,
    world: { x: 100, y: 120 },
    nowMs: t + 45,
  });
  assert.equal(cleanUp.kind, "commit_single_tap");
  assert.deepEqual(cleanUp.worldPoint, { x: 100, y: 120 });
  assert.equal(cleanUp.hadOriginBeforeDown, false);

  // E um arraste limpo com 1 dedo (>80ms e >8px) promove para arraste ao vivo
  t += 200;
  polarArbiterPointerDown(arbiter, {
    pointerId: 202,
    screen: { x: 300, y: 300 },
    world: { x: 100, y: 120 },
    nowMs: t,
    hasExistingOrigin: true,
  });
  const promoted = polarArbiterPointerMove(arbiter, {
    pointerId: 202,
    screen: { x: 330, y: 300 },
    world: { x: 130, y: 120 },
    nowMs: t + POLAR_MICRO_CONFIRM_MS + 10,
  });
  assert.equal(promoted.kind, "promote_origin_or_drag");
});

// ============================================================================
// TESTE 2 — FILLET 2D: ANTI-INVERSÃO DO CORTE PÓS-TANGÊNCIA E PRÉVIA HONESTA
// ============================================================================
test("Teste 2A — Fillet 2D Linha × Linha clicada colada no vértice remove APENAS o bico curto", () => {
  const lineH: Entity = {
    id: "L_H",
    layer: "corte",
    type: "line",
    x1: 0,
    y1: 0,
    x2: 100,
    y2: 0,
  };
  const lineV: Entity = {
    id: "L_V",
    layer: "corte",
    type: "line",
    x1: 100,
    y1: 0,
    x2: 100,
    y2: 80,
  };

  // Clique propositalmente muito próximo da quina (dentro dos 10mm do raio R=10!)
  const res = computeUniversalFillet2D(
    lineH,
    { x: 98, y: 0.2 },
    lineV,
    { x: 99.8, y: 2 },
    10,
    [lineH, lineV],
  );

  assert.equal(res.ok, true, res.error ?? "Fillet Linha × Linha deve ter sucesso");
  assert.ok(res.activeSolution);
  const sol = res.activeSolution!;
  assert.equal(sol.filletArc.type, "arc");
  assert.ok(Math.abs(sol.filletArc.r - 10) < 1e-4);

  // Corpo principal das linhas DEVE ser preservado: L_H = (0,0)->(90,0) e L_V = (100,10)->(100,80)
  const trimmedH = sol.updatedEntities.find((e) => e.id === "L_H" && e.type === "line");
  const trimmedV = sol.updatedEntities.find((e) => e.id === "L_V" && e.type === "line");
  assert.ok(trimmedH && trimmedH.type === "line");
  assert.ok(trimmedV && trimmedV.type === "line");

  const lenH = Math.hypot(trimmedH.x2 - trimmedH.x1, trimmedH.y2 - trimmedH.y1);
  const lenV = Math.hypot(trimmedV.x2 - trimmedV.x1, trimmedV.y2 - trimmedV.y1);
  assert.ok(Math.abs(lenH - 90) < 0.05, `Esperava corpo horizontal de 90mm, obteve ${lenH.toFixed(2)}mm`);
  assert.ok(Math.abs(lenV - 70) < 0.05, `Esperava corpo vertical de 70mm, obteve ${lenV.toFixed(2)}mm`);

  // Prévia honesta: deve expor bicos removidos (vermelho tracejado) e corpos mantidos (verde)
  assert.ok(sol.removedBeaks.length >= 2, "Deve reportar ambos os bicos de 10mm removidos");
  assert.ok(sol.keptBodies.length >= 2, "Deve reportar ambos os corpos principais preservados");
});

test("Teste 2B — Fillet 2D Linha × Arco Côncavo (padrão DE21) preserva o corpo da linha e do arco", () => {
  // Linha vertical descendo de (17, 45) até (17, 0) e arco côncavo R=15 centrado em (30, 50)
  // Interseção exata em x=17: y = 50 - sqrt(15^2 - 13^2) = 50 - sqrt(56) ≈ 42.5167
  const yCorner = 50 - Math.sqrt(15 * 15 - 13 * 13);
  const angCorner = Math.atan2(yCorner - 50, 17 - 30); // ~ -2.618 rad (terceiro quadrante)
  const angEnd = 0; // extremo direito do arco em (45, 50), arco passa pela base (30, 35)

  const verticalLine: Entity = {
    id: "DE21_VERT",
    layer: "corte",
    type: "line",
    x1: 17,
    y1: 0,
    x2: 17,
    y2: yCorner,
  };
  const concaveArc: Entity = {
    id: "DE21_ARC",
    layer: "corte",
    type: "arc",
    cx: 30,
    cy: 50,
    r: 15,
    a0: angCorner,
    a1: angEnd,
  };

  // Clique bem próximo ao canto de encontro
  const res = computeUniversalFillet2D(
    verticalLine,
    { x: 17, y: yCorner - 1.5 },
    concaveArc,
    { x: 20, y: 38 },
    5,
    [verticalLine, concaveArc],
  );

  assert.equal(res.ok, true, res.error ?? "Fillet Linha × Arco deve ter sucesso");
  assert.ok(res.activeSolution);
  const sol = res.activeSolution!;
  assert.equal(sol.filletArc.type, "arc");
  assert.ok(Math.abs(sol.filletArc.r - 5) < 1e-4);

  // A linha vertical (17, 0) -> T1 deve preservar a extremidade (17, 0) e ter comprimento > 25mm!
  const keptVert = sol.updatedEntities.find((e) => e.id === "DE21_VERT" && e.type === "line");
  assert.ok(keptVert && keptVert.type === "line", "Corpo principal da linha vertical deve existir");
  const vertLen = Math.hypot(keptVert.x2 - keptVert.x1, keptVert.y2 - keptVert.y1);
  assert.ok(vertLen > 25, `Corpo da linha vertical foi invertido/amputado! len=${vertLen.toFixed(2)}mm`);
  const touchesOriginEnd =
    Math.hypot(keptVert.x1 - 17, keptVert.y1 - 0) < 0.1 ||
    Math.hypot(keptVert.x2 - 17, keptVert.y2 - 0) < 0.1;
  assert.equal(touchesOriginEnd, true, "Extremidade (17, 0) da linha vertical deve permanecer intacta");

  // O arco principal DEVE continuar grande (sweep > 1.2 rad), nunca reduzido ao bico!
  const keptArc = sol.updatedEntities.find((e) => e.id === "DE21_ARC" && e.type === "arc");
  assert.ok(keptArc && keptArc.type === "arc", "Corpo principal do arco deve existir");
  const keptSweep = canonicalArcSweep(keptArc.a0, keptArc.a1);
  assert.ok(keptSweep > 1.2, `Arco principal foi invertido/amputado! sweep=${keptSweep.toFixed(3)} rad`);
  assert.ok(sol.removedBeaks.length >= 1, "Deve expor os bicos removidos para prévia vermelha tracejada");
  assert.ok(sol.keptBodies.length >= 2, "Deve expor os corpos mantidos para prévia verde");
});

// ============================================================================
// TESTE 3 — MODO GABARITO (REF.) + TRAÇAR PEÇA (PASSAR A LIMPO) + TRIM INTACTO
// ============================================================================
test("Teste 3 — Modo Gabarito é ignorado no 3D, Traçar Peça passa a limpo em vetores reais e TRIM permanece intacto", () => {
  // 4 linhas de gabarito formando um retângulo 60×40 com sobras de 20mm nas 4 pontas
  const guideEntities: Entity[] = [
    { id: "G_BOT", layer: "corte", type: "line", x1: -20, y1: 0, x2: 80, y2: 0, isReferenceGuide: true },
    { id: "G_TOP", layer: "corte", type: "line", x1: -20, y1: 40, x2: 80, y2: 40, isReferenceGuide: true },
    { id: "G_LEFT", layer: "corte", type: "line", x1: 0, y1: -20, x2: 0, y2: 60, isReferenceGuide: true },
    { id: "G_RIGHT", layer: "corte", type: "line", x1: 60, y1: -20, x2: 60, y2: 60, isReferenceGuide: true },
  ];

  // 1. Gabarito puro NUNCA gera sólidos 3D
  assert.equal(countReferenceGuideEntities(guideEntities), 4);
  const solidsBeforeTrace = buildPlanarSolidsFromEntities2D(guideEntities);
  assert.equal(solidsBeforeTrace.solids.length, 0, "Entidades de gabarito devem ser 100% ignoradas no 3D");
  assert.equal(solidsBeforeTrace.ignoredEntitiesCount, 4);

  // 2. Traçar Peça seleciona os 4 trechos internos entre as interseções (2 por toque + 2 por arraste/faca)
  const hitBot = hitTestTraceSubPiece({ x: 30, y: 0.2 }, guideEntities, 3);
  const hitTop = hitTestTraceSubPiece({ x: 30, y: 39.8 }, guideEntities, 3);
  assert.ok(hitBot && hitTop, "Hit-test de Traçar Peça deve localizar trechos exatos entre interseções");

  // Arraste em faca cruzando os dois lados verticais (x=0 e x=60 em y=20)
  const crossedSides = collectTraceSubPiecesCrossedByFence(
    [
      { x: -5, y: 20 },
      { x: 65, y: 20 },
    ],
    guideEntities,
    2,
  );
  assert.equal(crossedSides.length, 2, "Arraste tipo pincel/faca deve capturar ambos os lados verticais internos");

  const markedKeys = [hitBot.key, hitTop.key, ...crossedSides.map((c) => c.key)];
  const preview = buildTracePartPreview(guideEntities, markedKeys);
  assert.equal(preview.selectedPieces.length, 4);

  // 3. Criar Peça promove para vetores reais (isReferenceGuide: false) mantendo o gabarito intacto
  const committed = commitTracePartToRealEntities(guideEntities, markedKeys, "corte");
  assert.equal(committed.promotedCount, 4);
  assert.equal(committed.createdRealEntities.length, 4);
  for (const ent of committed.createdRealEntities) {
    assert.equal(ent.isReferenceGuide, false, "Entidade gerada por Traçar Peça deve ser vetor real");
  }

  // O 3D agora deve gerar 1 sólido limpo de 60×40 (área = 2400 mm²) ignorando automaticamente as 4 linhas do gabarito!
  const solidsWithGuidesStillPresent = buildPlanarSolidsFromEntities2D(committed.updatedEntities);
  assert.equal(solidsWithGuidesStillPresent.solids.length, 1);
  assert.ok(
    Math.abs(solidsWithGuidesStillPresent.solids[0]!.outer.absArea - 2400) < 1,
    `Esperava área 2400mm², obteve ${solidsWithGuidesStillPresent.solids[0]!.outer.absArea.toFixed(2)}`,
  );
  assert.equal(solidsWithGuidesStillPresent.ignoredEntitiesCount, 4);

  // 4. Apagar Gabarito limpa apenas as 4 auxiliares e mantém os 4 vetores reais
  const cleaned = removeAllReferenceGuides(committed.updatedEntities);
  assert.equal(cleaned.removedCount, 4);
  assert.equal(cleaned.updatedEntities.length, 4);

  // 5. Regressão zero no TRIM / APARAR: apara a ponta excedente de uma linha cruzando um círculo
  const trimTestEntities: Entity[] = [
    { id: "C1", layer: "corte", type: "circle", cx: 0, cy: 0, r: 20 },
    { id: "L1", layer: "corte", type: "line", x1: -40, y1: 0, x2: 40, y2: 0 },
  ];
  const tailHit = hitTestTrimSubPiece({ x: 30, y: 0.1 }, trimTestEntities, 3, "real");
  assert.ok(tailHit, "TRIM deve continuar detectando sub-trecho fora do círculo");
  const trimRes = commitTrimBatch(trimTestEntities, [tailHit.subPiece.key], "real");
  assert.equal(trimRes.removedSubPiecesCount, 1);
  const remainingLine = trimRes.updatedEntities.find((e) => e.type === "line");
  assert.ok(remainingLine && remainingLine.type === "line");
  assert.ok(Math.max(remainingLine.x1, remainingLine.x2) <= 20.05, "TRIM deve aparar a ponta em x=20");
});

// ============================================================================
// TESTE 4 — CONVERSÃO 2D → 3D DEFINITIVA (PEÇA COMPLEXA TIPO DE21)
// ============================================================================
test("Teste 4 — Conversor 2D → 3D: peça complexa tipo DE21 (arcos côncavos/convexos + banana slot + furos + gabarito)", () => {
  // Constrói a peça tipo DE21 com entidades discretas de linha e arco (incluindo arcos que cruzam 0/2π e ângulos negativos):
  // Contorno externo fechado contínuo:
  // - Domo superior R41 centrado em (0, 60) de 0 rad (41, 60) até π rad (-41, 60) [arco convexo]
  // - Descida esquerda com recorte côncavo:
  //   (-41, 60) -> (-41, 40) linha
  //   Recorte côncavo lateral esquerdo: arco centrado em (-41, 28) R=12 de +π/2 (-41, 40) até -π/2 (-41, 16)
  //     OBS: no sentido anti-horário canônico 2D, de -π/2 até +π/2 vai pela direita (côncavo para dentro da peça: x = -29)!
  //     Aqui a entidade arco tem a0 = -Math.PI/2, a1 = +Math.PI/2 (p0=(-41,16), p1=(-41,40)),
  //     portanto o costurador precisa percorrê-lo EM SENTIDO REVERSO (-41,40 -> -29,28 -> -41,16) SEM inverter o arco!
  //   (-41, 16) -> (-41, 0) linha
  // - Base inferior com chanfro/arco: (-41, 0) -> (41, 0) linha
  // - Subida direita com recorte côncavo espelhado:
  //   (41, 0) -> (41, 16) linha
  //   Arco côncavo direito centrado em (41, 28) R=12: de +π/2 (41, 40) até +3π/2 (41, 16) passa por x=+29 (dentro da peça!).
  //   (41, 40) -> (41, 60) linha
  const outerEntities: Entity[] = [
    // Domo superior R41 (sentido positivo 0 -> π passa por (0, 101))
    { id: "O_TOP_DOME", layer: "corte", type: "arc", cx: 0, cy: 60, r: 41, a0: 0, a1: Math.PI },
    // Lado esquerdo superior
    { id: "O_L_UP", layer: "corte", type: "line", x1: -41, y1: 60, x2: -41, y2: 40 },
    // Recorte côncavo esquerdo (a0 = -π/2, a1 = +π/2 -> passa por (-29, 28); testando travessia REVERSA + ângulo negativo!)
    { id: "O_L_CONCAVE", layer: "corte", type: "arc", cx: -41, cy: 28, r: 12, a0: -Math.PI / 2, a1: Math.PI / 2 },
    // Lado esquerdo inferior
    { id: "O_L_DN", layer: "corte", type: "line", x1: -41, y1: 16, x2: -41, y2: 0 },
    // Base inferior
    { id: "O_BOT", layer: "corte", type: "line", x1: -41, y1: 0, x2: 41, y2: 0 },
    // Lado direito inferior
    { id: "O_R_DN", layer: "corte", type: "line", x1: 41, y1: 0, x2: 41, y2: 16 },
    // Recorte côncavo direito (a0 = π/2, a1 = 3π/2 -> passa por (29, 28); travessia reversa de (41,16) até (41,40)!)
    { id: "O_R_CONCAVE", layer: "corte", type: "arc", cx: 41, cy: 28, r: 12, a0: Math.PI / 2, a1: (3 * Math.PI) / 2 },
    // Lado direito superior
    { id: "O_R_UP", layer: "corte", type: "line", x1: 41, y1: 40, x2: 41, y2: 60 },
  ];

  // Furo interno 1: Banana Slot curvo superior (centrado em (0, 60), R_mid=27, largura=12 => R_in=21, R_out=33, ângulos 40°..140°)
  const aStart = (40 * Math.PI) / 180;
  const aEnd = (140 * Math.PI) / 180;
  const rMid = 27;
  const rCap = 6;
  const cap1Cx = rMid * Math.cos(aStart);
  const cap1Cy = 60 + rMid * Math.sin(aStart);
  const cap2Cx = rMid * Math.cos(aEnd);
  const cap2Cy = 60 + rMid * Math.sin(aEnd);

  const bananaSlotEntities: Entity[] = [
    // Arco externo R=33 de 40° a 140°
    { id: "B_OUT", layer: "corte", type: "arc", cx: 0, cy: 60, r: rMid + rCap, a0: aStart, a1: aEnd },
    // Cabeça esquerda R=6 em aEnd=140°: vai de aEnd até aEnd+π (passando para fora do slot)
    { id: "B_CAP2", layer: "corte", type: "arc", cx: cap2Cx, cy: cap2Cy, r: rCap, a0: aEnd, a1: aEnd + Math.PI },
    // Arco interno R=21 (armazenado de aStart a aEnd -> percorrido em reverso!)
    { id: "B_IN", layer: "corte", type: "arc", cx: 0, cy: 60, r: rMid - rCap, a0: aStart, a1: aEnd },
    // Cabeça direita R=6 em aStart=40°: vai de aStart-π até aStart
    { id: "B_CAP1", layer: "corte", type: "arc", cx: cap1Cx, cy: cap1Cy, r: rCap, a0: aStart - Math.PI, a1: aStart },
  ];

  // Furo interno 2: Círculo central R=12 em (0, 52)
  const centerHole: Entity = {
    id: "H_CENTER",
    layer: "furo",
    type: "circle",
    cx: 0,
    cy: 52,
    r: 12,
  };

  // Furo interno 3: Rasgo oblongo inferior (largura 16, entre y=14 e y=24, R=5 -> x em [-8..8], y em [14..24])
  const bottomSlotEntities: Entity[] = [
    { id: "S_BOT", layer: "corte", type: "line", x1: -8, y1: 14, x2: 8, y2: 14 },
    { id: "S_R_CAP", layer: "corte", type: "arc", cx: 8, cy: 19, r: 5, a0: -Math.PI / 2, a1: Math.PI / 2 },
    { id: "S_TOP", layer: "corte", type: "line", x1: 8, y1: 24, x2: -8, y2: 24 },
    { id: "S_L_CAP", layer: "corte", type: "arc", cx: -8, cy: 19, r: 5, a0: Math.PI / 2, a1: (3 * Math.PI) / 2 },
  ];

  // Entidades auxiliares de Gabarito (DEVEM ser 100% ignoradas no 3D!)
  const helperGuides: Entity[] = [
    { id: "GUIDE_AXIS_V", layer: "corte", type: "line", x1: 0, y1: -20, x2: 0, y2: 120, isReferenceGuide: true },
    { id: "GUIDE_AXIS_H", layer: "corte", type: "line", x1: -60, y1: 60, x2: 60, y2: 60, isReferenceGuide: true },
    { id: "GUIDE_CIRC", layer: "corte", type: "circle", cx: 0, cy: 60, r: 27, isReferenceGuide: true },
  ];

  const allEntities: Entity[] = [
    ...outerEntities,
    ...bananaSlotEntities,
    centerHole,
    ...bottomSlotEntities,
    ...helperGuides,
  ];

  // 1. Verifica amostragem canônica de arco com ângulo negativo (nunca pode inverter para arco complementar!)
  const sampleLeftConcave = sampleCanonicalArcPoints(-41, 28, 12, -Math.PI / 2, Math.PI / 2);
  const maxConcaveX = Math.max(...sampleLeftConcave.map((p) => p.x));
  const minConcaveX = Math.min(...sampleLeftConcave.map((p) => p.x));
  assert.ok(
    Math.abs(maxConcaveX - -29) < 0.1 && minConcaveX >= -41.05,
    `Arco côncavo esquerdo deve varrer para dentro em x=-29 (nunca inverter para x=-53), obteve [${minConcaveX.toFixed(2)}, ${maxConcaveX.toFixed(2)}]`,
  );

  // 2. Pipeline completo planarTo3DBuilder
  const build = buildPlanarSolidsFromEntities2D(allEntities);
  assert.equal(build.ignoredEntitiesCount, 3, "Todas as 3 entidades de Gabarito devem ser ignoradas");
  assert.equal(build.solids.length, 1, `DE21 deve formar EXATAMENTE 1 sólido contínuo (obteve ${build.solids.length})`);
  assert.equal(
    build.solids[0]!.holes.length,
    3,
    `DE21 deve ter EXATAMENTE 3 furos passantes (banana slot + furo central + rasgo inferior), obteve ${build.solids[0]!.holes.length}`,
  );

  // 3. Verifica bounding box exato do contorno externo (prova 0 arcos invertidos/explodidos!)
  const bbox = build.solids[0]!.outer.bbox;
  assert.ok(Math.abs(bbox.minX - -41) < 0.3, `minX esperado -41, obteve ${bbox.minX}`);
  assert.ok(Math.abs(bbox.maxX - 41) < 0.3, `maxX esperado 41, obteve ${bbox.maxX}`);
  assert.ok(Math.abs(bbox.minY - 0) < 0.3, `minY esperado 0, obteve ${bbox.minY}`);
  assert.ok(Math.abs(bbox.maxY - 101) < 0.3, `maxY esperado 101, obteve ${bbox.maxY}`);

  // 4. Verifica que o ponto interior garantido da banana curva (côncava!) cai REALMENTE dentro da banana
  const bananaLoop = build.solids[0]!.holes.find((h) => h.bbox.maxY > 80);
  assert.ok(bananaLoop, "Loop do banana slot superior deve existir entre os 3 furos");
  const bananaInterior = computeGuaranteedInteriorPoint(bananaLoop.points);
  assert.equal(
    pointInPolygonRayCast(bananaInterior, bananaLoop.points),
    true,
    "Ponto interior garantido da banana côncava deve estar estritamente dentro dela",
  );
  assert.equal(
    pointInPolygonRayCast(bananaInterior, build.solids[0]!.outer.points),
    true,
    "Ponto interior da banana deve estar dentro do contorno externo",
  );

  // 5. Verifica área analítica aproximada do contorno externo:
  //    Retângulo 82×60 (= 4920) + semicírculo R41 (= π*41²/2 ≈ 2640.5) - 2 semicírculos R12 (= π*12² ≈ 452.4) ≈ 7108 mm²
  const expectedOuterArea = 82 * 60 + (Math.PI * 41 * 41) / 2 - Math.PI * 12 * 12;
  assert.ok(
    Math.abs(build.solids[0]!.outer.absArea - expectedOuterArea) < 25,
    `Área externa esperada ~${expectedOuterArea.toFixed(1)}mm², obteve ${build.solids[0]!.outer.absArea.toFixed(1)}mm² (indício de arco invertido se diferir!)`,
  );

  // 6. Verifica geração Three.js ExtrudeGeometry + solidShapes + DirectModeling3DScene
  const threeSolids = buildThreeExtrudedSolids(build.solids, 6);
  assert.equal(threeSolids.length, 1);
  assert.ok(threeSolids[0]!.vertexCount > 100);
  assert.ok(threeSolids[0]!.triangleCount > 100);
  threeSolids.forEach((s) => s.geometry.dispose());

  const shapes = solidShapes(allEntities);
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0]!.holes.length, 3);

  const directScene = buildDirectTopology3DScene(allEntities, 6);
  assert.equal(directScene.bodies.length, 1, "Cena 3D direta deve ter exatamente 1 corpo sólido");
  const body = directScene.bodies[0]!;
  assert.ok(body.faces.some((f) => f.role === "top"), "Sólido 3D deve ter face superior selecionável");
  assert.ok(body.faces.some((f) => f.role === "bottom"), "Sólido 3D deve ter face inferior selecionável");
  assert.ok(
    body.faces.filter((f) => String(f.role).includes("hole") || f.label.toLowerCase().includes("furo")).length >= 3,
    "Sólido 3D deve conter túneis de faces internas para os 3 furos passantes",
  );
  assert.ok(Math.abs(body.deltaX - 82) < 0.6, `deltaX 3D esperado ~82mm, obteve ${body.deltaX}`);
  assert.ok(Math.abs(body.deltaY - 101) < 0.6, `deltaY 3D esperado ~101mm, obteve ${body.deltaY}`);
  assert.ok(Math.abs(body.deltaZ - 6) < 0.1, `deltaZ 3D esperado 6mm, obteve ${body.deltaZ}`);
});
