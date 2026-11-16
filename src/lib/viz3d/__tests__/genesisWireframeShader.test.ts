import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GENESIS_CONSTRUCTION_DURATION_MS,
  GENESIS_PALETTE,
  buildGenesisBaseReticleData3D,
  computeGenesisBoundsFromPositions,
  computeGenesisConstructionProgress,
  computeGenesisEdgeVertexRGBA,
  computeGenesisShimmerFactor,
  extractGenesisVertexPinpoints3D,
} from "../genesisWireframeShader";

describe("Motor Visual e Animação Gênese CALDRA — Modo ARAME 3D", () => {
  it("Camada 1: calcula hierarquia fiel de cor e opacidade nas linhas (0.88 topo #E2E8F0/#F1F5F9, 0.72 espessura vertical #93C5FD, 0.45 base e Raio-X #60A5FA/#4B83C3)", () => {
    const zMin = 0;
    const zMax = 20;

    // Aresta na Face Superior (z = Z_max)
    const topVert = computeGenesisEdgeVertexRGBA({
      z: 20,
      otherEndZ: 20,
      zMin,
      zMax,
      radialNorm: 0.2,
      isXRay: false,
    });
    assert.equal(topVert.role, "top_edge");
    assert.equal(topVert.a, GENESIS_PALETTE.topEdgeOpacity); // 0.88
    assert.ok(topVert.r > 0.85 && topVert.g > 0.88 && topVert.b > 0.92);

    // Aresta Vertical de Espessura (conectando Topo z=20 e Base z=0)
    const wallTop = computeGenesisEdgeVertexRGBA({
      z: 20,
      otherEndZ: 0,
      zMin,
      zMax,
      isXRay: false,
    });
    const wallBottom = computeGenesisEdgeVertexRGBA({
      z: 0,
      otherEndZ: 20,
      zMin,
      zMax,
      isXRay: false,
    });
    assert.equal(wallTop.role, "vertical_wall");
    assert.equal(wallBottom.role, "vertical_wall");
    assert.ok(Math.abs(wallTop.a - 0.72) < 1e-6);
    assert.ok(Math.abs(wallBottom.a - 0.72) < 1e-6);

    // Aresta na Base (z = Z_min) e Aresta Oculta / Traseira (Raio-X contínuo)
    const baseVert = computeGenesisEdgeVertexRGBA({
      z: 0,
      otherEndZ: 0,
      zMin,
      zMax,
      isXRay: false,
    });
    const xrayVert = computeGenesisEdgeVertexRGBA({
      z: 10,
      otherEndZ: 20,
      zMin,
      zMax,
      isXRay: true,
    });
    assert.equal(baseVert.role, "base_or_xray");
    assert.equal(baseVert.a, 0.45);
    assert.equal(xrayVert.role, "base_or_xray");
    assert.equal(xrayVert.a, 0.45);
  });

  it("Camada 2: extrai SOMENTE quinas geométricas reais (excluindo pontos intermediários colineares/curvos) com opacity <= 0.35", () => {
    // 3 quinas de 90° (em (0,0,15), (100,0,15) e (0,0,0)) + 1 ponto intermediário colinear em (50,0,15)
    const segs = new Float32Array([
      0, 0, 15, 50, 0, 15,
      50, 0, 15, 100, 0, 15,
      100, 0, 15, 100, 80, 15,
      0, 0, 0, 100, 0, 0,
      0, 0, 0, 0, 0, 15,
    ]);
    const bounds = computeGenesisBoundsFromPositions(segs);
    const pinpoints = extractGenesisVertexPinpoints3D(segs, bounds);

    // Deve capturar apenas as 3 quinas vivas de 90° e ignorar o ponto intermediário colinear (50,0,15)
    assert.equal(pinpoints.count, 3);
    for (let i = 0; i < pinpoints.count; i++) {
      const h = pinpoints.heightsNorm[i]!;
      const op = pinpoints.baseOpacities[i]!;
      assert.ok(op <= 0.35 + 1e-5, `Esperava opacity <= 0.35, obteve ${op}`);
      if (h >= 0.95) {
        assert.ok(Math.abs(op - 0.35) < 1e-5, `Esperava opacity 0.35 no topo, obteve ${op}`);
      } else if (h <= 0.05) {
        assert.ok(Math.abs(op - 0.22) < 1e-5, `Esperava opacity 0.22 na base, obteve ${op}`);
      }
    }
  });

  it("Camada 4: projeta 3 anéis de compasso concêntricos (opacity 0.12, 0.08, 0.05) e linhas de extensão (0.09) em z = Z_min - 0.1mm", () => {
    const segs = new Float32Array([
      -50, -40, 0, 50, -40, 0,
      50, -40, 12, 50, 40, 12,
    ]);
    const bounds = computeGenesisBoundsFromPositions(segs);
    const reticle = buildGenesisBaseReticleData3D(bounds);

    assert.ok(Math.abs(reticle.baseZ - (bounds.minZ - 0.1)) < 1e-6);
    assert.equal(reticle.rings.length, 3);
    assert.equal(reticle.rings[0].opacity, 0.12);
    assert.equal(reticle.rings[1].opacity, 0.08);
    assert.equal(reticle.rings[2].opacity, 0.05);
    assert.ok(reticle.rings[0].radius < reticle.rings[1].radius);
    assert.ok(reticle.rings[1].radius < reticle.rings[2].radius);
    assert.equal(reticle.extensionLinesOpacity, 0.09);
    assert.ok(reticle.extensionLinesPositions.length >= 36);
  });

  it("Camada 5: executa curva de construção de 650ms cubic-bezier(0.16, 1, 0.3, 1) e pulso vivo Genesis Living Shimmer [0.65, 1.0]", () => {
    const start = computeGenesisConstructionProgress(0, GENESIS_CONSTRUCTION_DURATION_MS);
    assert.equal(start.easedProgress, 0);
    assert.equal(start.isConstructing, true);

    const mid = computeGenesisConstructionProgress(325, GENESIS_CONSTRUCTION_DURATION_MS);
    // cubic-bezier(0.16, 1, 0.3, 1) tem aceleração rápida inicial (> 0.7 em t = 0.5)
    assert.ok(mid.easedProgress > 0.7 && mid.easedProgress < 1.0);
    assert.equal(mid.isConstructing, true);

    const end = computeGenesisConstructionProgress(650, GENESIS_CONSTRUCTION_DURATION_MS);
    assert.equal(end.easedProgress, 1);
    assert.equal(end.ringsProgress, 1);
    assert.equal(end.edgesProgress, 1);
    assert.equal(end.pinpointsProgress, 1);
    assert.equal(end.glassProgress, 1);
    assert.equal(end.isConstructing, false);

    for (let t = 0; t <= 10; t += 0.25) {
      const shimmer = computeGenesisShimmerFactor(t, 1.2);
      assert.ok(
        shimmer >= 0.65 - 1e-6 && shimmer <= 1.0 + 1e-6,
        `Shimmer fora da faixa [0.65, 1.0]: ${shimmer}`,
      );
    }
  });
});
