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

test("Seção 4.3 — Transformação Matemática Oficial world = O + R(θ)·(x', y') com gabarito exato", () => {
  const origin = { x: 200, y: 100 };
  const thetaDeg = 30;

  // Ponto local (100, 0) -> (286.60, 150.00)
  const w1 = anchorLocalToWorld({ x: 100, y: 0 }, origin, thetaDeg);
  assert.ok(Math.abs(w1.x - 286.6) <= 0.01, `Esperado X ≈ 286.60, obteve ${w1.x}`);
  assert.ok(Math.abs(w1.y - 150.0) <= 0.01, `Esperado Y ≈ 150.00, obteve ${w1.y}`);

  // Ponto local (0, 50) -> (175.00, 143.30)
  const w2 = anchorLocalToWorld({ x: 0, y: 50 }, origin, thetaDeg);
  assert.ok(Math.abs(w2.x - 175.0) <= 0.01, `Esperado X ≈ 175.00, obteve ${w2.x}`);
  assert.ok(Math.abs(w2.y - 143.3) <= 0.01, `Esperado Y ≈ 143.30, obteve ${w2.y}`);

  // Transformação inversa toLocal(toWorld) recupera (x', y')
  const l1 = anchorWorldToLocal(w1, origin, thetaDeg);
  assert.ok(Math.abs(l1.x - 100) <= 0.01);
  assert.ok(Math.abs(l1.y - 0) <= 0.01);

  const l2 = anchorWorldToLocal(w2, origin, thetaDeg);
  assert.ok(Math.abs(l2.x - 0) <= 0.01);
  assert.ok(Math.abs(l2.y - 50) <= 0.01);
});

test("Seção 4.2 — Smart Pick (<= 24 px) e Ciclar em Círculo, Linha (com alinhamento de X') e Retângulo", () => {
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
    {
      id: "circle_hole",
      layer: "furos",
      type: "circle",
      cx: 500,
      cy: 300,
      r: 40,
    },
  ];

  // Toque no vazio longe de entidades (sem allowGridFreePoint) -> zero marcos órfãos
  const emptyPick = evaluateSmartPick({ x: 900, y: 900 }, entities, 1, {
    maxPixelRadius: 24,
    allowGridFreePoint: false,
  });
  assert.equal(emptyPick.best, null);

  // Toque próximo ao centro do círculo (<= 24 px) -> captura Centro
  const circlePick = evaluateSmartPick({ x: 505, y: 296 }, entities, 1, {
    maxPixelRadius: 24,
  });
  assert.ok(circlePick.best);
  assert.equal(circlePick.best.symbolKind, "center");
  assert.deepEqual(circlePick.best.point, { x: 500, y: 300 });

  // Inserir Âncora A na linha inclinada e testar Ciclar (Meio -> Extremo 1 -> Extremo 2)
  const lineCands = listEntityCycleCandidates(entities[0]!);
  assert.equal(lineCands.length, 3);
  const anchorA = svc.upsertAnchor(lineCands[0]!);
  assert.equal(anchorA.id, "A");
  assert.deepEqual(anchorA.origin, { x: 200, y: 150 });
  // Alinhou X' automaticamente ao ângulo da linha atan2(100, 200) ≈ 26.57°
  assert.ok(Math.abs(anchorA.thetaDeg - 26.57) <= 0.05);

  const cycled1 = svc.cycleActiveAnchor(entities);
  assert.ok(cycled1);
  assert.deepEqual(cycled1.origin, { x: 100, y: 100 });

  const cycled2 = svc.cycleActiveAnchor(entities);
  assert.ok(cycled2);
  assert.deepEqual(cycled2.origin, { x: 300, y: 200 });
});

test("Seção 4.4 — Pilha FIFO A–E (até 5 marcos), Ponto Médio A–B (250,300), Alinhar X' (53.13°) e Dividir Vão ÷N", () => {
  const svc = new ReferenceServiceManager();

  const a = svc.upsertAnchor({
    point: { x: 100, y: 100 },
    symbolKind: "vertex",
    label: "Vértice A",
  });
  const b = svc.upsertAnchor({
    point: { x: 400, y: 500 },
    symbolKind: "vertex",
    label: "Vértice B",
  });

  assert.equal(a.id, "A");
  assert.equal(b.id, "B");

  const metrics = svc.computeAnchorPairMetrics("A", "B");
  assert.ok(metrics);
  assert.equal(metrics.dx, 300);
  assert.equal(metrics.dy, 400);
  assert.equal(metrics.distance, 500);
  assert.deepEqual(metrics.midpoint, { x: 250, y: 300 });
  assert.ok(Math.abs(metrics.angleDeg - 53.13) <= 0.02);

  // Alinhar eixo X' por A–B
  const alignedTheta = svc.alignAxisByAnchors("A", "B");
  assert.ok(alignedTheta !== null && Math.abs(alignedTheta - 53.13) <= 0.02);

  // Dividir vão A–B em ÷4 -> 3 pontos equidistantes
  const span = svc.divideSpanBetweenAnchors(4, "A", "B");
  assert.ok(span);
  assert.equal(span.points.length, 3);
  assert.deepEqual(span.points[0], { x: 175, y: 200 });
  assert.deepEqual(span.points[1], { x: 250, y: 300 });
  assert.deepEqual(span.points[2], { x: 325, y: 400 });

  // Ponto Médio A–B cria Âncora C em (250, 300)
  const midAnchor = svc.createMidpointBetweenAnchors("A", "B");
  assert.ok(midAnchor);
  assert.equal(midAnchor.id, "C");
  assert.deepEqual(midAnchor.origin, { x: 250, y: 300 });

  // Testar limite FIFO de 5 âncoras (A, B, C, D, E)
  svc.upsertAnchor({ point: { x: 10, y: 10 }, symbolKind: "vertex", label: "D" });
  svc.upsertAnchor({ point: { x: 20, y: 20 }, symbolKind: "vertex", label: "E" });
  assert.equal(svc.getAnchors().length, 5);
  const sixth = svc.upsertAnchor({ point: { x: 30, y: 30 }, symbolKind: "vertex", label: "Novo" });
  assert.equal(svc.getAnchors().length, 5);
  assert.equal(sixth.id, "A"); // Reutilizou o slot mais antigo na fila FIFO
});

test("Seção 4.5 — Guias Infinitas, Encontros Automáticos, Radar, Eco, Tabela CSV, CHAMFER INTENT e Limpeza em 2 Estágios", () => {
  const svc = new ReferenceServiceManager();
  svc.upsertAnchor({
    point: { x: 200, y: 100 },
    symbolKind: "center",
    label: "Centro",
    suggestedThetaDeg: 30,
  });

  const entities: Entity[] = [
    {
      id: "vert_cut",
      layer: "contorno",
      type: "line",
      x1: 300,
      y1: 0,
      x2: 300,
      y2: 400,
    },
    {
      id: "hole_1",
      layer: "furos",
      type: "circle",
      cx: 286.6025,
      cy: 150,
      r: 10,
    },
  ];

  // 1. Guias e Encontros Automáticos
  svc.addConstructionGuide("axis_x", { entities });
  svc.addConstructionGuide("axis_y", { entities });
  const meetings = svc.getMeetings();
  assert.ok(meetings.length >= 2); // Encontro Guia×Guia na origem + Guia×Entidade na linha x=300
  const snaps = svc.snapCandidates(entities);
  assert.ok(snaps.some((s) => s.kind === "meeting"));

  // 2. Radar de Bordas
  const radar = svc.computeEdgeRadar(entities, { x: 0, y: 0, w: 1500, h: 1000 });
  assert.ok(radar);
  assert.equal(radar.workspaceChips.length, 4);
  assert.equal(radar.workspaceChips[0]!.distanceMm, 200); // Borda esquerda

  // 3. Eco (Espelho e Radial)
  svc.setEchoConfig({ mode: "radial", radialCount: 6 });
  const echoPreview = svc.computeEchoEntities([entities[1]!]);
  assert.equal(echoPreview.length, 5); // 5 cópias adicionais para completar N=6 em 360°

  // 4. Tabela de Coordenadas (X', Y', Ø) e CSV
  const table = svc.generateAnchorCoordinateTable(entities);
  assert.equal(table.rows.length, 1);
  assert.ok(Math.abs(table.rows[0]!.localX - 100) <= 0.05);
  assert.ok(Math.abs(table.rows[0]!.localY - 0) <= 0.05);
  assert.equal(table.rows[0]!.diameter, 20);
  assert.ok(table.csv.includes("F1,100.00,0.00,20.00"));

  // 5. CHAMFER INTENT ({anchor: 'A', dx, dy} e {anchor: 'A', r, angle})
  const intentCart = svc.resolveIntentAnchorReference({ anchor: "A", dx: 100, dy: 0 });
  assert.ok(intentCart);
  assert.ok(Math.abs(intentCart.x - 286.6) <= 0.01);
  assert.ok(Math.abs(intentCart.y - 150.0) <= 0.01);

  // 6. Limpeza progressiva em 2 estágios (1º limpa Guias/Eco; 2º limpa Âncoras)
  const stage1 = svc.handleProgressiveClear();
  assert.equal(stage1, "cleared_aux");
  assert.equal(svc.getGuides().length, 0);
  assert.equal(svc.getEchoConfig().mode, "off");
  assert.equal(svc.getAnchors().length, 1);

  const stage2 = svc.handleProgressiveClear();
  assert.equal(stage2, "cleared_anchors");
  assert.equal(svc.getAnchors().length, 0);
});
