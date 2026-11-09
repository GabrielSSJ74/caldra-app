import test from "node:test";
import assert from "node:assert/strict";
import {
  createPendingDraftShapeState,
  createSelectedEntityDraftState,
  rebuildPendingDraftShape,
  getPendingDraftShapeGrips,
  applyPendingDraftGripDrag,
} from "./ChamferDraftConfirmationBubble";
import type { Entity } from "@/lib/lab2d/core";

test("createPendingDraftShapeState suporta assinatura de 5 e 7 argumentos para Retângulo em tempo real (60 FPS)", () => {
  const rectEntity: Entity = {
    id: "draft-rect",
    layer: "0",
    type: "polyline",
    pts: [
      { x: 100, y: 100 },
      { x: 415.9, y: 100 },
      { x: 415.9, y: 289.9 },
      { x: 100, y: 289.9 },
    ],
    closed: true,
  };

  const state = createPendingDraftShapeState(
    "rect",
    rectEntity,
    { x: 100, y: 100 },
    { x: 415.9, y: 289.9 },
    "0",
    0,
    {
      rectMode: "corners",
      isLiveDraft: true,
    },
  );

  assert.ok(state);
  assert.equal(state.kind, "rect");
  assert.equal(state.tool, "rect");
  assert.equal(state.widthMm, 315.9);
  assert.equal(state.heightMm, 189.9);
  assert.equal(state.filletRadiusMm, 0);
  assert.equal(state.isLiveDraft, true);

  const rebuilt = rebuildPendingDraftShape({
    ...state,
    widthMm: 400,
    heightMm: 200,
    filletRadiusMm: 8,
  });
  assert.equal(rebuilt.widthMm, 400);
  assert.equal(rebuilt.heightMm, 200);
  assert.equal(rebuilt.cornerRadiusMm, 8);
});

test("createPendingDraftShapeState calcula L = e ângulo ∠ para Linha e Polilinha ao vivo", () => {
  const lineEntity: Entity = {
    id: "draft-line",
    layer: "0",
    type: "line",
    x1: 0,
    y1: 0,
    x2: 300,
    y2: 0,
  };

  const lineState = createPendingDraftShapeState(
    "line",
    lineEntity,
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    "0",
    0,
    { isLiveDraft: true },
  );
  assert.ok(lineState);
  assert.equal(lineState.lengthMm, 300);
  assert.equal(lineState.angleDeg, 0);

  const polyState = createPendingDraftShapeState(
    "polyline",
    lineEntity,
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    "0",
    0,
    { isLiveDraft: true },
  );
  assert.ok(polyState);
  assert.equal(polyState.kind, "polyline");
  assert.equal(polyState.lengthMm, 300);
});

test("createPendingDraftShapeState calcula Ø, R, Corda e Lados para Círculo, Arco, Polígono, Slot e Elipse", () => {
  const circleEnt: Entity = {
    id: "draft-circle",
    layer: "0",
    type: "circle",
    cx: 200,
    cy: 200,
    r: 75,
  };
  const cState = createPendingDraftShapeState(
    "circle",
    circleEnt,
    { x: 200, y: 200 },
    { x: 275, y: 200 },
    "0",
    0,
  );
  assert.ok(cState);
  assert.equal(cState.radiusMm, 75);
  assert.equal(cState.widthMm, 150);

  const arcEnt: Entity = {
    id: "draft-arc",
    layer: "0",
    type: "arc",
    cx: 0,
    cy: 0,
    r: 100,
    a0: 0,
    a1: Math.PI / 2,
  };
  const aState = createPendingDraftShapeState(
    "arc",
    arcEnt,
    { x: 100, y: 0 },
    { x: 0, y: 100 },
    "0",
    0,
  );
  assert.ok(aState);
  assert.equal(aState.radiusMm, 100);
  assert.equal(aState.sweepAngleDeg, 90);
  assert.ok(Math.abs(aState.chordMm - 141.42) < 0.1);

  const polyState = createPendingDraftShapeState(
    "polygon",
    circleEnt,
    { x: 100, y: 100 },
    { x: 160, y: 100 },
    "0",
    0,
    { polygonSides: 6, polygonMode: "inscribed" },
  );
  assert.ok(polyState);
  assert.equal(polyState.polygonSides, 6);
  assert.equal(polyState.radiusMm, 60);

  const slotState = createPendingDraftShapeState(
    "slot",
    circleEnt,
    { x: 0, y: 0 },
    { x: 120, y: 0 },
    "0",
    0,
    { slotWidthMm: 16, slotMode: "center_to_center" },
  );
  assert.ok(slotState);
  assert.equal(slotState.widthMm, 120);
  assert.equal(slotState.heightMm, 16);

  const ellipseEnt: Entity = {
    id: "draft-ellipse",
    layer: "0",
    type: "ellipse",
    cx: 100,
    cy: 100,
    rx: 80,
    ry: 40,
    rotation: 0,
  };
  const eState = createPendingDraftShapeState(
    "ellipse",
    ellipseEnt,
    { x: 100, y: 100 },
    { x: 180, y: 140 },
    "0",
    0,
  );
  assert.ok(eState);
  assert.equal(eState.widthMm, 160);
  assert.equal(eState.heightMm, 80);

  const grips = getPendingDraftShapeGrips(cState);
  assert.equal(grips.length, 2);
  const dragged = applyPendingDraftGripDrag(cState, 1, { x: 300, y: 200 });
  assert.equal(dragged.radiusMm, 100);
});

test("createSelectedEntityDraftState cria estado de seleção com isSelectedEntity=true e reconstrói preservando ID da peça", () => {
  const existingCircle: Entity = {
    id: "ent-circle-42",
    layer: "corte",
    type: "circle",
    cx: 500,
    cy: 400,
    r: 125.65,
  };
  const selCircle = createSelectedEntityDraftState(existingCircle);
  assert.ok(selCircle);
  assert.equal(selCircle.isSelectedEntity, true);
  assert.equal(selCircle.radiusMm, 125.65);
  assert.equal(selCircle.widthMm, 251.3);

  const editedCircle = rebuildPendingDraftShape({
    ...selCircle,
    radiusMm: 150,
    widthMm: 300,
    heightMm: 300,
  });
  assert.equal(editedCircle.entity.id, "ent-circle-42");
  assert.equal(editedCircle.entity.type, "circle");
  if (editedCircle.entity.type === "circle") {
    assert.equal(editedCircle.entity.r, 150);
  }

  const existingRectPoly: Entity = {
    id: "ent-rect-99",
    layer: "corte",
    type: "polyline",
    pts: [
      { x: 100, y: 200 },
      { x: 500, y: 200 },
      { x: 500, y: 450 },
      { x: 100, y: 450 },
    ],
    closed: true,
  };
  const selRect = createSelectedEntityDraftState(existingRectPoly);
  assert.ok(selRect);
  assert.equal(selRect.isSelectedEntity, true);
  assert.equal(selRect.kind, "rect");
  assert.equal(selRect.widthMm, 400);
  assert.equal(selRect.heightMm, 250);
});

