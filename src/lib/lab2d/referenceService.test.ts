import test from "node:test";
import assert from "node:assert/strict";
import {
  ReferenceServiceManager,
  anchorLocalToWorld,
  anchorWorldToLocal,
  evaluateSmartPick,
  listEntityCycleCandidates,
} from "./referenceService";
import type { Entity } from "./core";

test("Teste 1 — Modo Âncora Local (X',Y') Isolada: posiciona e reposiciona apenas 1 origem local sem criar fila B, C, D, E", () => {
  const svc = new ReferenceServiceManager();
  assert.equal(svc.getReferenceMode(), "anchor");

  // 1º clique em um canto do retângulo (100, 100)
  const tap1 = svc.handleCanvasTap(
    {
      point: { x: 100, y: 100 },
      symbolKind: "vertex",
      label: "Vértice",
    },
    [],
  );
  assert.equal(tap1.kind, "anchor_placed");
  const anchor1 = svc.getLocalAnchor();
  assert.ok(anchor1);
  assert.equal(anchor1.isLocalAnchor, true);
  assert.deepEqual(anchor1.origin, { x: 100, y: 100 });
  assert.equal(svc.getLandmarks().length, 0, "Nenhum marco A–E deve ser criado no Modo Âncora");

  // 2º clique em outro canto (400, 300) apenas reposiciona a única Âncora Local
  const tap2 = svc.handleCanvasTap(
    {
      point: { x: 400, y: 300 },
      symbolKind: "vertex",
      label: "Vértice",
    },
    [],
  );
  assert.equal(tap2.kind, "anchor_placed");
  const anchor2 = svc.getLocalAnchor();
  assert.ok(anchor2);
  assert.equal(anchor2.isLocalAnchor, true);
  assert.deepEqual(anchor2.origin, { x: 400, y: 300 });
  assert.equal(svc.getLandmarks().length, 0, "JAMAIS cria fila B, C, D, E no Modo Âncora");
});

test("Teste 2 — Modo Marcos A–E, Ordem Alfabética Fixa e Pausa Automática em B (sem marcos fantasmas)", () => {
  const svc = new ReferenceServiceManager();
  svc.setReferenceMode("landmarks");

  // Clique 1 -> cria A em (100, 100)
  const tapA = svc.handleCanvasTap(
    { point: { x: 100, y: 100 }, symbolKind: "vertex", label: "Vértice A" },
    [],
  );
  assert.equal(tapA.kind, "landmark_placed");
  assert.equal(tapA.anchor?.id, "A");

  // Clique 2 -> cria B em (400, 100)
  const tapB = svc.handleCanvasTap(
    { point: { x: 400, y: 100 }, symbolKind: "vertex", label: "Vértice B" },
    [],
  );
  assert.equal(tapB.kind, "landmark_placed");
  assert.equal(tapB.anchor?.id, "B");
  assert.deepEqual(
    svc.getLandmarks().map((l) => l.id),
    ["A", "B"],
  );

  // Clique 3 (sem ter clicado em [+ C]) -> PAUSA em B, não cria C nem move A/B acidentalmente
  const tapPaused = svc.handleCanvasTap(
    { point: { x: 400, y: 300 }, symbolKind: "vertex", label: "Vértice Extra" },
    [],
  );
  assert.equal(tapPaused.kind, "landmarks_paused_at_b");
  assert.deepEqual(
    svc.getLandmarks().map((l) => l.id),
    ["A", "B"],
  );

  // Clicar explicitamente em [+ C] destrava o slot C
  const nextSlot = svc.requestNextLandmarkSlot();
  assert.equal(nextSlot, "C");
  const tapC = svc.handleCanvasTap(
    { point: { x: 400, y: 300 }, symbolKind: "vertex", label: "Vértice C" },
    [],
  );
  assert.equal(tapC.kind, "landmark_placed");
  assert.equal(tapC.anchor?.id, "C");
  assert.deepEqual(
    svc.getLandmarks().map((l) => l.id),
    ["A", "B", "C"],
  );
});

test("Teste 3 — Divisor ÷N em Tempo Real (÷2 a ÷100 com Passo mm instantâneo e Divisão Direta de Aresta)", () => {
  const svc = new ReferenceServiceManager();
  svc.setReferenceMode("landmarks");
  svc.placeOrMoveLandmark({ point: { x: 100, y: 100 }, symbolKind: "vertex", label: "A" }, "A");
  svc.placeOrMoveLandmark({ point: { x: 400, y: 100 }, symbolKind: "vertex", label: "B" }, "B");

  // Vão A–B de 300 mm dividido em ÷2 -> 1 nó em (250, 100), passo 150 mm
  const div2 = svc.divideSpanBetweenAnchors(2);
  assert.ok(div2);
  assert.equal(div2.points.length, 1);
  assert.equal(div2.stepMm, 150);
  assert.deepEqual(div2.points[0], { x: 250, y: 100 });

  // Atualizar em tempo real para ÷3 -> 2 nós em (200, 100) e (300, 100), passo 100 mm
  const div3 = svc.divideSpanBetweenAnchors(3);
  assert.ok(div3);
  assert.equal(div3.points.length, 2);
  assert.equal(div3.stepMm, 100);
  assert.deepEqual(div3.points, [
    { x: 200, y: 100 },
    { x: 300, y: 100 },
  ]);

  // Atualizar em tempo real para ÷4 -> 3 nós, passo 75 mm
  const div4 = svc.divideSpanBetweenAnchors(4);
  assert.ok(div4);
  assert.equal(div4.points.length, 3);
  assert.equal(div4.stepMm, 75);

  // Atualizar em tempo real para ÷6 -> 5 nós, passo 50 mm
  const div6 = svc.divideSpanBetweenAnchors(6);
  assert.ok(div6);
  assert.equal(div6.points.length, 5);
  assert.equal(div6.stepMm, 50);

  // Atualizar em tempo real para ÷10 -> 9 nós, passo 30 mm
  const div10 = svc.divideSpanBetweenAnchors(10);
  assert.ok(div10);
  assert.equal(div10.points.length, 9);
  assert.equal(div10.stepMm, 30);

  // Divisão direta de uma aresta sem precisar criar A e B manualmente
  const segDiv = svc.divideSegmentDirectly({ x: 0, y: 0 }, { x: 0, y: 200 }, 4);
  assert.ok(segDiv);
  assert.equal(segDiv.stepMm, 50);
  assert.equal(segDiv.points.length, 3);
});

test("Teste 4 — Alinhar ∠ e Guias em Tempo Real (transformação world = O + R(θ)·(x',y') e paralela ao vivo)", () => {
  const svc = new ReferenceServiceManager();
  svc.setOrMoveLocalAnchor({
    point: { x: 200, y: 100 },
    symbolKind: "center",
    label: "Centro",
  });

  // Rotacionar para 30° em tempo real
  svc.setActiveAnchorAngle(30, true);
  assert.equal(svc.getLocalAnchor()?.thetaDeg, 30);

  const w1 = anchorLocalToWorld({ x: 100, y: 0 }, { x: 200, y: 100 }, 30);
  assert.ok(Math.abs(w1.x - 286.6) <= 0.01);
  assert.ok(Math.abs(w1.y - 150.0) <= 0.01);

  const l1 = anchorWorldToLocal(w1, { x: 200, y: 100 }, 30);
  assert.ok(Math.abs(l1.x - 100) <= 0.01);
  assert.ok(Math.abs(l1.y - 0) <= 0.01);

  // Toggle de Guias (Eixo X', Eixo Y', Bissetriz) e Paralela d ao vivo
  svc.toggleGuideKind("axis_x");
  svc.toggleGuideKind("axis_y");
  assert.equal(svc.getGuides().length, 2);

  const parallelLive = svc.setParallelGuideOffsetLive(25);
  assert.ok(parallelLive);
  assert.equal(parallelLive.offsetMm, 25);
  assert.ok(parallelLive.label.includes("25mm"));
});

test("Teste 5 — Remoção Individual (×) e Limpeza Total (🗑️ Limpar)", () => {
  const svc = new ReferenceServiceManager();
  svc.setOrMoveLocalAnchor({ point: { x: 50, y: 50 }, symbolKind: "vertex", label: "Origem" });
  svc.setReferenceMode("landmarks");
  svc.placeOrMoveLandmark({ point: { x: 100, y: 100 }, symbolKind: "vertex", label: "A" }, "A");
  svc.placeOrMoveLandmark({ point: { x: 300, y: 100 }, symbolKind: "vertex", label: "B" }, "B");
  svc.requestNextLandmarkSlot();
  svc.placeOrMoveLandmark({ point: { x: 300, y: 250 }, symbolKind: "vertex", label: "C" }, "C");

  // Remover individualmente o marco B clicando no × do chip B
  svc.removeLandmark("B");
  assert.deepEqual(
    svc.getLandmarks().map((l) => l.id),
    ["A", "C"],
  );

  // Remover individualmente a Âncora Local clicando no × do chip ⚓
  svc.removeLocalAnchor();
  assert.equal(svc.getLocalAnchor(), null);

  // Limpeza Total (🗑️ Limpar) remove tudo de uma só vez
  svc.clearAll();
  assert.equal(svc.getLocalAnchor(), null);
  assert.equal(svc.getLandmarks().length, 0);
  assert.equal(svc.getSpanDivision(), null);
  assert.equal(svc.getGuides().length, 0);
});

test("Teste 6 — Snap Magnético preservado após Concluir e Promoção de Ponto Médio A–B para Âncora Local", () => {
  const svc = new ReferenceServiceManager();
  const entities: Entity[] = [
    {
      id: "line_inclined",
      layer: "contorno",
      type: "line",
      x1: 100,
      y1: 100,
      x2: 300,
      y2: 200,
    },
  ];

  // Ciclar candidatos na entidade
  const cands = listEntityCycleCandidates(entities[0]!);
  assert.equal(cands.length, 3);
  svc.setOrMoveLocalAnchor(cands[0]!);
  const cycled = svc.cycleActiveAnchor(entities);
  assert.ok(cycled);
  assert.deepEqual(cycled.origin, { x: 100, y: 100 });

  // Definir A e B, dividir em ÷4 e promover Ponto Médio A–B para Âncora Local
  svc.setReferenceMode("landmarks");
  svc.placeOrMoveLandmark({ point: { x: 100, y: 100 }, symbolKind: "vertex", label: "A" }, "A");
  svc.placeOrMoveLandmark({ point: { x: 500, y: 100 }, symbolKind: "vertex", label: "B" }, "B");
  svc.divideSpanBetweenAnchors(4);

  const promoted = svc.promoteMidpointABToLocalAnchor("A", "B");
  assert.ok(promoted);
  assert.equal(promoted.isLocalAnchor, true);
  assert.deepEqual(promoted.origin, { x: 300, y: 100 });

  // Candidatos de Snap incluem a Âncora Local, Marcos A e B, Ponto Médio e Nós ÷4 (sem textos longos "Extremo A")
  const snaps = svc.snapCandidates(entities);
  assert.ok(snaps.some((s) => s.point.x === 300 && s.point.y === 100));
  assert.ok(snaps.some((s) => s.kind === "span_division" && s.point.x === 200 && s.point.y === 100));
  assert.ok(snaps.every((s) => !s.label.includes("Extremo")));
});
