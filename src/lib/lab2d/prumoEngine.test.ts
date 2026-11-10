import test from "node:test";
import assert from "node:assert/strict";
import {
  UI_NAME,
  normalizeUiShellMode,
  computeConcentricArcLayout,
  computePrumoCoreCenter,
  resolvePolarFanHit,
  resolvePrumoSelectionContextActions,
  computePrumoContextCapsulePosition,
} from "./prumoEngine";
import type { Entity } from "./core";

test("UI_NAME e migração silenciosa da Clássica para Compacta", () => {
  assert.equal(UI_NAME, "PRUMO");
  assert.equal(normalizeUiShellMode(null), "compact");
  assert.equal(normalizeUiShellMode(undefined), "compact");
  assert.equal(normalizeUiShellMode("classic"), "compact");
  assert.equal(normalizeUiShellMode("Clássica"), "compact");
  assert.equal(normalizeUiShellMode("compact"), "compact");
  assert.equal(normalizeUiShellMode("prumo"), "prumo");
  assert.equal(normalizeUiShellMode("PRUMO"), "prumo");
});

test("Geometria trigonométrica do Leque Concêntrico (R1 = 112px, R2 = 182px, zero colisão)", () => {
  const core = computePrumoCoreCenter({
    viewportWidth: 800,
    viewportHeight: 400,
    handSide: "left",
  });
  assert.equal(core.x, 48); // margin 20 + 56/2
  assert.equal(core.y, 352); // 400 - 20 - 28

  const innerArc = computeConcentricArcLayout({
    centerX: core.x,
    centerY: core.y,
    handSide: "left",
    viewportWidth: 800,
    viewportHeight: 400,
    arcKind: "inner",
    itemCount: 10, // ★ + 9 grupos
    scrollAngleRad: 0,
  });

  assert.equal(innerArc.radiusPx, 112);
  assert.equal(innerArc.diameterPx, 42);
  assert.equal(innerArc.gapPx, 4);
  assert.equal(innerArc.hasZeroCollision, true);
  assert.ok(innerArc.visibleCapacity >= 4 && innerArc.visibleCapacity <= 5);
  assert.equal(innerArc.canScrollPrev, false);
  assert.equal(innerArc.canScrollNext, true);

  const outerArc = computeConcentricArcLayout({
    centerX: core.x,
    centerY: core.y,
    handSide: "left",
    viewportWidth: 800,
    viewportHeight: 400,
    arcKind: "outer",
    itemCount: 12,
    scrollAngleRad: 0,
  });

  assert.equal(outerArc.radiusPx, 182);
  assert.equal(outerArc.diameterPx, 46);
  assert.equal(outerArc.gapPx, 4);
  assert.equal(outerArc.hasZeroCollision, true);
  assert.equal(outerArc.visibleCapacity, 6);
  assert.equal(outerArc.canScrollNext, true);

  // Verifica rolagem orbital (φ > 0) no arco externo
  const scrolledOuter = computeConcentricArcLayout({
    centerX: core.x,
    centerY: core.y,
    handSide: "left",
    viewportWidth: 800,
    viewportHeight: 400,
    arcKind: "outer",
    itemCount: 12,
    scrollAngleRad: outerArc.maxScrollAngleRad,
  });
  assert.equal(scrolledOuter.canScrollPrev, true);
  assert.equal(scrolledOuter.canScrollNext, false);
  assert.equal(scrolledOuter.items[11]?.visible, true);
});

test("Hit-test polar (r, θ) do Gesto de Especialista no Núcleo, Arco Interno e Arco Externo", () => {
  const core = { x: 48, y: 352 };
  const innerArc = computeConcentricArcLayout({
    centerX: core.x,
    centerY: core.y,
    handSide: "left",
    viewportWidth: 800,
    viewportHeight: 400,
    arcKind: "inner",
    itemCount: 10,
    scrollAngleRad: 0,
  });
  const outerArc = computeConcentricArcLayout({
    centerX: core.x,
    centerY: core.y,
    handSide: "left",
    viewportWidth: 800,
    viewportHeight: 400,
    arcKind: "outer",
    itemCount: 8,
    scrollAngleRad: 0,
  });

  // 1. Ponto dentro do Núcleo
  const hitCore = resolvePolarFanHit({
    centerX: core.x,
    centerY: core.y,
    pointerX: core.x + 10,
    pointerY: core.y - 10,
    handSide: "left",
    innerArc,
    outerArc,
  });
  assert.equal(hitCore.zone, "core");

  // 2. Ponto exatamente sobre o item 1 do Arco Interno
  const targetInner = innerArc.items[1]!;
  const hitInner = resolvePolarFanHit({
    centerX: core.x,
    centerY: core.y,
    pointerX: targetInner.x,
    pointerY: targetInner.y,
    handSide: "left",
    innerArc,
    outerArc,
  });
  assert.equal(hitInner.zone, "inner_arc");
  assert.equal(hitInner.matchedIndex, 1);

  // 3. Ponto exatamente sobre o item 2 do Arco Externo
  const targetOuter = outerArc.items[2]!;
  const hitOuter = resolvePolarFanHit({
    centerX: core.x,
    centerY: core.y,
    pointerX: targetOuter.x,
    pointerY: targetOuter.y,
    handSide: "left",
    innerArc,
    outerArc,
  });
  assert.equal(hitOuter.zone, "outer_arc");
  assert.equal(hitOuter.matchedIndex, 2);
});

test("Menu de Contexto Inteligente por tipo de geometria e guarda de borda >= 16px", () => {
  const circleEntity: Entity = {
    id: "c1",
    type: "circle",
    layer: "corte",
    cx: 100,
    cy: 100,
    r: 25,
  };
  const lineEntity: Entity = {
    id: "l1",
    type: "line",
    layer: "corte",
    x1: 0,
    y1: 0,
    x2: 120,
    y2: 0,
  };
  const rectEntity: Entity = {
    id: "r1",
    type: "polyline",
    layer: "corte",
    closed: true,
    pts: [
      { x: 20, y: 20 },
      { x: 100, y: 20 },
      { x: 100, y: 70 },
      { x: 20, y: 70 },
    ],
  };

  const circleCtx = resolvePrumoSelectionContextActions([circleEntity]);
  assert.equal(circleCtx.geometryKind, "circle_arc");
  assert.equal(circleCtx.actions[0]?.label, "Ø / R ✎");

  const lineCtx = resolvePrumoSelectionContextActions([lineEntity]);
  assert.equal(lineCtx.geometryKind, "line_segment");
  assert.equal(lineCtx.actions[0]?.label, "L / ∠ ✎");
  assert.ok(lineCtx.actions.some((a) => a.id === "trim"));
  assert.ok(lineCtx.actions.some((a) => a.id === "offset"));

  const rectCtx = resolvePrumoSelectionContextActions([rectEntity]);
  assert.equal(rectCtx.geometryKind, "rect_poly");
  assert.equal(rectCtx.actions[0]?.label, "L × A ✎");
  assert.ok(rectCtx.actions.some((a) => a.id === "rotate"));
  assert.ok(rectCtx.actions.some((a) => a.id === "mirror"));

  const pos = computePrumoContextCapsulePosition({
    selectedEntities: [rectEntity],
    view: { k: 1, tx: 10, ty: 10 },
    viewportWidth: 360,
    viewportHeight: 640,
  });
  assert.ok(pos.left >= 16);
  assert.ok(pos.top >= 54);
});
