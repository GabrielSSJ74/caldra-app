import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeSmartGrilleArray3D,
  detectInternalSpan3D,
  generateSmartGrilleArrayEntities3D,
} from "./chamfer3DSmartArray";
import { computeViewAlignedRotationHandlePlacement } from "./chamfer3DRotationCompass";
import { buildDirectTopology3DScene } from "./cadDirectModeling3D";
import { rectPolyline, type Entity } from "./core";

describe("CHAMFER CAD 3D — Smart Array / Grade & View-Aligned Rotation Handle", () => {
  it("1. detecta automaticamente o Vão Livre Interno (V_vão) entre duas colunas laterais no eixo X", () => {
    const colLeft: Entity = {
      id: "col-left",
      type: "rect",
      layer: "corte",
      x: 0,
      y: 0,
      w: 50,
      h: 50,
      extrudeHeightMm: 1200,
    };
    const colRight: Entity = {
      id: "col-right",
      type: "rect",
      layer: "corte",
      x: 1050,
      y: 0,
      w: 50,
      h: 50,
      extrudeHeightMm: 1200,
    };
    const scene = buildDirectTopology3DScene([colLeft, colRight], 3);
    const span = detectInternalSpan3D(scene.bodies[0]!, scene.bodies, "x");

    assert.equal(span.isAutoDetected, true);
    assert.equal(span.startInnerCoordMm, 50);
    assert.equal(span.endInnerCoordMm, 1050);
    assert.equal(span.spanMm, 1000);
    assert.equal(span.tubeWidthMm, 50);
  });

  it("2. Modo A (by_count): calcula exatamente o vão livre (luz entre tubos) e o passo centro a centro", () => {
    // V_vão = 1000 mm, N = 4 tubos de d_tubo = 25 mm
    // v_livre = (1000 - 4 * 25) / (4 + 1) = 900 / 5 = 180 mm
    // P = 25 + 180 = 205 mm
    const res = computeSmartGrilleArray3D({
      mode: "by_count",
      spanMm: 1000,
      tubeWidthMm: 25,
      count: 4,
      maxClearGapMm: 110,
      startInnerCoordMm: 50,
      axis: "x",
    });

    assert.equal(res.valid, true);
    assert.equal(res.count, 4);
    assert.equal(res.clearGapMm, 180);
    assert.equal(res.pitchCenterToCenterMm, 205);
    assert.equal(res.centerCoordsMm.length, 4);
    // 1º tubo: 50 + 180 + 12.5 = 242.5
    assert.equal(res.centerCoordsMm[0], 242.5);
    assert.equal(res.centerCoordsMm[1], 447.5);
    assert.equal(res.centerCoordsMm[2], 652.5);
    assert.equal(res.centerCoordsMm[3], 857.5);
  });

  it("3. Modo B (by_max_gap): calcula automaticamente a quantidade ideal de tubos N para não ultrapassar o vão máximo", () => {
    // V_vão = 1000 mm, d_tubo = 20 mm, maxClearGapMm = 110 mm
    // N = ceil((1000 - 110) / (20 + 110)) = ceil(890 / 130) = 7 tubos
    // v_livre = (1000 - 7 * 20) / 8 = 860 / 8 = 107.5 mm (<= 110 mm)
    const res = computeSmartGrilleArray3D({
      mode: "by_max_gap",
      spanMm: 1000,
      tubeWidthMm: 20,
      count: 1,
      maxClearGapMm: 110,
      startInnerCoordMm: 0,
      axis: "x",
    });

    assert.equal(res.valid, true);
    assert.equal(res.count, 7);
    assert.ok(res.clearGapMm <= 110, `Esperado clearGapMm <= 110, obtido ${res.clearGapMm}`);
    assert.equal(res.clearGapMm, 107.5);
    assert.equal(res.pitchCenterToCenterMm, 127.5);
  });

  it("4. gera os novos corpos 3D reais em uma única operação atômica", () => {
    const colLeft: Entity = {
      id: "col-left",
      type: "rect",
      layer: "corte",
      x: 0,
      y: 0,
      w: 30,
      h: 30,
      extrudeHeightMm: 1000,
    };
    const colRight: Entity = {
      id: "col-right",
      type: "rect",
      layer: "corte",
      x: 630,
      y: 0,
      w: 30,
      h: 30,
      extrudeHeightMm: 1000,
    };
    const scene = buildDirectTopology3DScene([colLeft, colRight], 3);
    const calc = computeSmartGrilleArray3D({
      mode: "by_count",
      spanMm: 600,
      tubeWidthMm: 30,
      count: 3,
      maxClearGapMm: 110,
      startInnerCoordMm: 30,
      axis: "x",
    });

    const gen = generateSmartGrilleArrayEntities3D(
      [colLeft, colRight],
      colLeft.id,
      scene.bodies[0]!,
      calc,
    );
    assert.equal(gen.createdIds.length, 3);
    assert.equal(gen.updatedEntities.length, 5);
  });

  it("5. posiciona a alça de giro View-Aligned no setor angular mais aberto sem colidir com +X, +Y, +Z", () => {
    const origin = { x: 400, y: 300 };
    // Eixo Z apontando para cima, X para baixo-esquerda, Y para baixo-direita (deixando quadrante superior-direito livre)
    const xEnd = { x: 340, y: 340 };
    const yEnd = { x: 460, y: 340 };
    const zEnd = { x: 400, y: 230 };

    const placement = computeViewAlignedRotationHandlePlacement(origin, xEnd, yEnd, zEnd, 58);
    const distFromOrigin = Math.hypot(
      placement.handlePos.x - origin.x,
      placement.handlePos.y - origin.y,
    );
    assert.ok(Math.abs(distFromOrigin - 58) < 0.5);
    // Verifica que a pega circular está longe das pontas X, Y, Z
    assert.ok(Math.hypot(placement.handlePos.x - xEnd.x, placement.handlePos.y - xEnd.y) > 25);
    assert.ok(Math.hypot(placement.handlePos.x - yEnd.x, placement.handlePos.y - yEnd.y) > 25);
    assert.ok(Math.hypot(placement.handlePos.x - zEnd.x, placement.handlePos.y - zEnd.y) > 25);
  });
});
