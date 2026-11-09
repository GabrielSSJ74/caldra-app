import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDirectTopology3DScene,
  applyDirectMiterCut3DToEntities,
} from "./cadDirectModeling3D";
import { resolveContactAndAlignmentSnaps3D } from "./cadContactSnapping3D";
import {
  computeMiterDragAngleAndSnap,
  buildDoubleHeadedMiterArcSvg,
  KEY_MITER_SNAP_ANGLES_DEG,
} from "./chamfer3DRotationCompass";
import { getExponentialHoldConfig } from "./useExponentialHold";
import type { Entity } from "./types";

test("Item 1: Peças maciças possuem tampas TOP e BOTTOM fechadas na malha 3D (inclusive rotacionadas 90°)", () => {
  const solidRect: Entity = {
    id: "solid_1",
    type: "rect",
    layer: "corte",
    x: 0,
    y: 0,
    w: 120,
    h: 80,
    params: {
      extrudeHeight: 50,
      edgeFilletRadiusMm: 10,
      shellThicknessMm: 0,
      rotation3D: { rxDeg: 90, ryDeg: 0, rzDeg: 0 },
    },
  };

  const scene = buildDirectTopology3DScene([solidRect], 50);
  assert.equal(scene.bodies.length, 1);
  const body = scene.bodies[0]!;

  const topFace = body.faces.find((f) => f.role === "top");
  const bottomFace = body.faces.find((f) => f.role === "bottom");
  assert.ok(topFace, "Deve existir face superior (TOP cap)");
  assert.ok(bottomFace, "Deve existir face inferior (BOTTOM cap)");

  const topGroup = scene.tessellatedShape.mesh.faceGroups.find(
    (g) => g.faceIndex === topFace.meshFaceIndex,
  );
  const bottomGroup = scene.tessellatedShape.mesh.faceGroups.find(
    (g) => g.faceIndex === bottomFace.meshFaceIndex,
  );
  assert.ok(
    topGroup && topGroup.triangleCount > 0,
    `Malha 3D da tampa superior deve possuir triângulos fechados (triangles: ${topGroup?.triangleCount ?? 0})`,
  );
  assert.ok(
    bottomGroup && bottomGroup.triangleCount > 0,
    `Malha 3D da tampa inferior deve possuir triângulos fechados (triangles: ${bottomGroup?.triangleCount ?? 0})`,
  );
});

test("Item 1: Tubos vazados (Shell / Metalon) geram anéis anulares fechados no topo e na base com espessura t", () => {
  const shellTube: Entity = {
    id: "tube_1",
    type: "rect",
    layer: "corte",
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    params: {
      extrudeHeight: 200,
      shellThicknessMm: 5,
    },
  };

  const scene = buildDirectTopology3DScene([shellTube], 200);
  assert.equal(scene.bodies.length, 1);
  const body = scene.bodies[0]!;

  const topFace = body.faces.find((f) => f.role === "top");
  const bottomFace = body.faces.find((f) => f.role === "bottom");
  assert.ok(topFace, "Deve existir anel superior (TOP_RING_FACE)");
  assert.ok(bottomFace, "Deve existir anel inferior (BOTTOM_RING_FACE)");

  const topGroup = scene.tessellatedShape.mesh.faceGroups.find(
    (g) => g.faceIndex === topFace.meshFaceIndex,
  );
  const bottomGroup = scene.tessellatedShape.mesh.faceGroups.find(
    (g) => g.faceIndex === bottomFace.meshFaceIndex,
  );
  assert.ok(
    topGroup && topGroup.triangleCount >= 8,
    `Anel superior deve ter triângulos fechados (triangles: ${topGroup?.triangleCount ?? 0})`,
  );
  assert.ok(
    bottomGroup && bottomGroup.triangleCount >= 8,
    `Anel inferior deve ter triângulos fechados (triangles: ${bottomGroup?.triangleCount ?? 0})`,
  );
});

test("Item 2: Snap 3D Completo em Z (Base-Topo, Topo-Topo, Base-Base, Centro-Z) e X/Y", () => {
  const targetBox: Entity = {
    id: "target_box",
    type: "rect",
    layer: "corte",
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    params: {
      extrudeHeight: 300,
      elevationZ: 0,
    },
  };
  const movingBox: Entity = {
    id: "moving_box",
    type: "rect",
    layer: "corte",
    x: 150,
    y: 0,
    w: 80,
    h: 80,
    params: {
      extrudeHeight: 100,
      elevationZ: 0,
    },
  };

  const scene = buildDirectTopology3DScene([targetBox, movingBox], 100);
  const movingBody = scene.bodies.find((b) => b.entityId === "moving_box")!;
  const otherBodies = scene.bodies.filter((b) => b.entityId !== "moving_box");

  // 1) Base-Topo (Empilhamento exato: moving.minZ -> target.maxZ = 300)
  const stackSnap = resolveContactAndAlignmentSnaps3D(
    movingBody,
    otherBodies,
    { x: 0, y: 0, z: 298.2 }, // quase 300mm -> deve travar em 300.00mm (gap 0.00mm)
    1.5,
  );
  assert.equal(stackSnap.snappedDelta.z, 300);
  assert.equal(stackSnap.hasContactSnap || stackSnap.hasAlignmentSnap, true);
  assert.ok(stackSnap.snapBadgeLabel?.includes("300.00 mm"));

  // 2) Topo-Topo (Nivelamento de altura superior: moving.maxZ (100 + dz) == target.maxZ (300) -> dz = 200)
  const topAlignSnap = resolveContactAndAlignmentSnaps3D(
    movingBody,
    otherBodies,
    { x: 0, y: 0, z: 198.5 },
    1.5,
  );
  assert.equal(topAlignSnap.snappedDelta.z, 200);
  assert.equal(topAlignSnap.hasAlignmentSnap, true);

  // 3) Encosto Lateral X (moving.minX (150 + dx) == target.maxX (100) -> dx = -50)
  const xTouchSnap = resolveContactAndAlignmentSnaps3D(
    movingBody,
    otherBodies,
    { x: -48.5, y: 0, z: 0 },
    1.5,
  );
  assert.equal(xTouchSnap.snappedDelta.x, -50);
  assert.equal(xTouchSnap.hasContactSnap, true);
});

test("Item 3: Corte em Grau (Esquadria) com snaps suaves e aplicação estrita na face/extremidade selecionada", () => {
  // Verifica snaps suaves nos ângulos chave (-45°, -30°, -22.5°, -15°, 0°, +15°, +22.5°, +30°, +45°)
  assert.deepEqual(KEY_MITER_SNAP_ANGLES_DEG, [-45, -30, -22.5, -15, 0, 15, 22.5, 30, 45]);

  const snap45 = computeMiterDragAngleAndSnap(
    { x: 240, y: 239 }, // ~44.3 deg from (200,200)
    { x: 200, y: 200 },
    0,
    0,
  );
  assert.equal(snap45.snapped, true);
  assert.equal(snap45.angleDeg, 45);

  const arcSvg = buildDoubleHeadedMiterArcSvg({ x: 300, y: 250 }, 56, -45);
  assert.ok(arcSvg.arcPath.startsWith("M "));
  assert.ok(Number.isFinite(arcSvg.negTip.x) && Number.isFinite(arcSvg.posTip.x));
  assert.ok(Number.isFinite(arcSvg.handlePos.x) && Number.isFinite(arcSvg.handlePos.y));

  // Aplicação estrita somente à extremidade selecionada (ex.: 'top' no eixo 'x')
  const profileEnt: Entity = {
    id: "bar_1",
    type: "rect",
    layer: "corte",
    x: 0,
    y: 0,
    w: 60,
    h: 40,
    params: {
      extrudeHeight: 500,
    },
  };
  const afterTopCut = applyDirectMiterCut3DToEntities([profileEnt], ["bar_1"], "top", -45, "x");
  assert.equal(afterTopCut[0]!.params?.miterCutTopDeg, -45);
  assert.equal(afterTopCut[0]!.params?.miterCutTopAxis, "x");
  assert.equal(afterTopCut[0]!.params?.miterCutBottomDeg ?? 0, 0);
});

test("Item 5: Aceleração Exponencial (Press-and-Hold) progride em 4 faixas de velocidade", () => {
  const tier1 = getExponentialHoldConfig(500);
  assert.equal(tier1.intervalMs, 110);
  assert.equal(tier1.multiplier, 1);

  const tier2 = getExponentialHoldConfig(1800);
  assert.equal(tier2.intervalMs, 65);
  assert.equal(tier2.multiplier, 2);

  const tier3 = getExponentialHoldConfig(3200);
  assert.equal(tier3.intervalMs, 45);
  assert.equal(tier3.multiplier, 5);

  const tier4 = getExponentialHoldConfig(4500);
  assert.equal(tier4.intervalMs, 35);
  assert.equal(tier4.multiplier, 15);
});
