import { describe, expect, it } from "vitest";
import {
  ORBIT_PRESETS,
  ORBIT_MIN_ELEVATION_DEG,
  ORBIT_MAX_ELEVATION_DEG,
  ISO_CANONICAL_ELEVATION_DEG,
  getOrbitPresetDefinition,
  normalizeAzimuthDeg,
  clampFreeElevationDeg,
  applyOrbitDragDelta,
  isFlatTop2DView,
  detectMatchingPreset,
  computeSmartOrbitPivot,
  computeWorkplaneOrbitProjection2D,
  projectWorkplanePointToOrbit2D,
  unprojectOrbit2DToWorkplanePoint,
  computeGizmoAxesProjection,
  interpolateOrbitAngles,
} from "./orbit3dController";
import type { Entity } from "./core";

describe("CHAMFER CAD — Ferramenta ÓRBITA 3D (Orbit 3D Controller & Perspective Tests A–I)", () => {
  it("Teste A & B — Presets do painel flutuante PERSPECTIVA contêm ângulos canônicos exatos", () => {
    expect(ORBIT_PRESETS.length).toBeGreaterThanOrEqual(11);

    const top = getOrbitPresetDefinition("top");
    expect(top.azimuthDeg).toBe(0);
    expect(top.elevationDeg).toBe(90);
    expect(isFlatTop2DView(top.azimuthDeg, top.elevationDeg)).toBe(true);

    const isoSe = getOrbitPresetDefinition("iso_se");
    expect(isoSe.azimuthDeg).toBe(45);
    expect(isoSe.elevationDeg).toBeCloseTo(ISO_CANONICAL_ELEVATION_DEG, 4);
    expect(detectMatchingPreset(45, ISO_CANONICAL_ELEVATION_DEG)).toBe("iso_se");

    const isoSw = getOrbitPresetDefinition("iso_sw");
    expect(isoSw.azimuthDeg).toBe(135);
    expect(detectMatchingPreset(135, ISO_CANONICAL_ELEVATION_DEG)).toBe("iso_sw");

    const isoNw = getOrbitPresetDefinition("iso_nw");
    expect(isoNw.azimuthDeg).toBe(225);
    expect(detectMatchingPreset(225, ISO_CANONICAL_ELEVATION_DEG)).toBe("iso_nw");

    const isoNe = getOrbitPresetDefinition("iso_ne");
    expect(isoNe.azimuthDeg).toBe(315);
    expect(detectMatchingPreset(315, ISO_CANONICAL_ELEVATION_DEG)).toBe("iso_ne");

    expect(getOrbitPresetDefinition("front")).toMatchObject({ azimuthDeg: 0, elevationDeg: 0 });
    expect(getOrbitPresetDefinition("back")).toMatchObject({ azimuthDeg: 180, elevationDeg: 0 });
    expect(getOrbitPresetDefinition("left")).toMatchObject({ azimuthDeg: 270, elevationDeg: 0 });
    expect(getOrbitPresetDefinition("right")).toMatchObject({ azimuthDeg: 90, elevationDeg: 0 });
    expect(getOrbitPresetDefinition("bottom")).toMatchObject({ azimuthDeg: 0, elevationDeg: -90 });
  });

  it("Teste C & H — Órbita 3D no modo 2D SKETCH inclina a projeção preservando 100% das coordenadas reais (X, Y) da peça", () => {
    const pivot = { x: 150, y: 100 };
    const canonicalPoints = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 200 },
      { x: 0, y: 200 },
      { x: 150, y: 100 }, // centro de furo
      { x: 75.5, y: 142.25 },
    ];

    // Na vista Superior Plana (0°, 90°), a matriz é identidade
    const flatProj = computeWorkplaneOrbitProjection2D(0, 90, pivot, 6);
    expect(flatProj.isTilted).toBe(false);
    expect(flatProj.a).toBe(1);
    expect(flatProj.d).toBe(1);
    expect(flatProj.localExtrusion).toEqual({ x: 0, y: 0 });

    // Ao inclinar para Isométrica SE (45°, 35.26°) ou ângulos livres no 2D SKETCH:
    const testAngles = [
      { az: 45, el: ISO_CANONICAL_ELEVATION_DEG },
      { az: 135, el: ISO_CANONICAL_ELEVATION_DEG },
      { az: 310, el: 22 },
      { az: 0, el: 0 }, // Frontal (com proteção anti-colapso sy >= 0.14)
      { az: 90, el: -45 },
    ];

    for (const { az, el } of testAngles) {
      const proj = computeWorkplaneOrbitProjection2D(az, el, pivot, 8);
      expect(proj.isTilted).toBe(true);
      // Determinante da matriz afim nunca pode colapsar a zero
      const det = proj.a * proj.d - proj.b * proj.c;
      expect(Math.abs(det)).toBeGreaterThan(0.1);

      // Bijeção exata: projetar e desprojetar retorna as coordenadas milimétricas exatas sem deformação
      for (const pt of canonicalPoints) {
        const projected = projectWorkplanePointToOrbit2D(pt, az, el, pivot);
        const unprojected = unprojectOrbit2DToWorkplanePoint(projected, az, el, pivot);
        expect(unprojected.x).toBeCloseTo(pt.x, 6);
        expect(unprojected.y).toBeCloseTo(pt.y, 6);
      }
    }
  });

  it("Teste D & E — Arraste livre (Free Orbit) atualiza Azimute/Elevação e aplica proteção anti-Gimbal Lock [-89°, +89°]", () => {
    // Arraste horizontal altera azimute θ em [0°, 360°)
    const dragHoriz = applyOrbitDragDelta(45, 35.26, -100, 0, 0.5);
    expect(dragHoriz.azimuthDeg).toBeCloseTo(95, 4);
    expect(dragHoriz.elevationDeg).toBeCloseTo(35.26, 4);
    expect(dragHoriz.preset).toBe("free");

    // Arraste vertical extremo para cima trava em +89° (sem Gimbal Lock)
    const dragExtremeUp = applyOrbitDragDelta(45, 80, 0, 500, 0.5);
    expect(dragExtremeUp.elevationDeg).toBe(ORBIT_MAX_ELEVATION_DEG);
    expect(dragExtremeUp.elevationDeg).toBe(89);

    // Arraste vertical extremo para baixo trava em -89° (sem Gimbal Lock)
    const dragExtremeDown = applyOrbitDragDelta(45, -70, 0, -500, 0.5);
    expect(dragExtremeDown.elevationDeg).toBe(ORBIT_MIN_ELEVATION_DEG);
    expect(dragExtremeDown.elevationDeg).toBe(-89);

    expect(clampFreeElevationDeg(120)).toBe(89);
    expect(clampFreeElevationDeg(-120)).toBe(-89);
    expect(normalizeAzimuthDeg(-45)).toBe(315);
    expect(normalizeAzimuthDeg(405)).toBe(45);
  });

  it("Teste F — Indicador de Eixos X Y Z (Axes Gizmo) sincroniza projeção 3D e mapeia cliques nas pontas dos eixos", () => {
    // Em vista Superior (0°, 90°): +X aponta para a direita (+1, 0), +Y aponta para cima (0, -1), +Z aponta para o observador (dz = +1)
    const topAxes = computeGizmoAxesProjection(0, 90);
    const xTop = topAxes.find((a) => a.axis === "X")!;
    const yTop = topAxes.find((a) => a.axis === "Y")!;
    const zTop = topAxes.find((a) => a.axis === "Z")!;

    expect(xTop.color).toBe("#ef4444");
    expect(yTop.color).toBe("#22c55e");
    expect(zTop.color).toBe("#3b82f6");

    expect(xTop.dx).toBeCloseTo(1, 5);
    expect(xTop.dy).toBeCloseTo(0, 5);
    expect(yTop.dx).toBeCloseTo(0, 5);
    expect(yTop.dy).toBeCloseTo(-1, 5);
    expect(zTop.dz).toBeCloseTo(1, 5);

    // Mapeamento de clique rápido nas pontas dos eixos
    expect(zTop.positivePreset).toBe("top");
    expect(zTop.negativePreset).toBe("bottom");
    expect(xTop.positivePreset).toBe("right");
    expect(xTop.negativePreset).toBe("left");
    expect(yTop.positivePreset).toBe("front");
    expect(yTop.negativePreset).toBe("back");
  });

  it("Teste G — Centro Inteligente da Órbita (Pivô): prioriza seleção -> bounding box da peça -> origem REF 0,0", () => {
    const rect1: Entity = {
      id: "r1",
      type: "polyline",
      layer: "corte",
      closed: true,
      pts: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
    };
    const rect2: Entity = {
      id: "r2",
      type: "polyline",
      layer: "corte",
      closed: true,
      pts: [
        { x: 200, y: 100 },
        { x: 300, y: 100 },
        { x: 300, y: 300 },
        { x: 200, y: 300 },
      ],
    };

    // 1. Com seleção ativa (rect2 selecionado): pivô no centro de rect2 (250, 200)
    const selPivot = computeSmartOrbitPivot([rect1, rect2], ["r2"], null, 10);
    expect(selPivot.source).toBe("selection");
    expect(selPivot.x).toBe(250);
    expect(selPivot.y).toBe(200);
    expect(selPivot.z).toBe(5);

    // 2. Sem seleção ativa: pivô no centro geral da peça ([0..300], [0..300] -> 150, 150)
    const piecePivot = computeSmartOrbitPivot([rect1, rect2], [], null, 10);
    expect(piecePivot.source).toBe("piece");
    expect(piecePivot.x).toBe(150);
    expect(piecePivot.y).toBe(150);
    expect(piecePivot.z).toBe(5);

    // 3. Canvas vazio com REF 0,0 temporária ativa
    const refPivot = computeSmartOrbitPivot([], [], { x: 40, y: 60 }, 0);
    expect(refPivot.source).toBe("origin");
    expect(refPivot.x).toBe(40);
    expect(refPivot.y).toBe(60);

    // 4. Canvas vazio padrão -> (0, 0, 0)
    const zeroPivot = computeSmartOrbitPivot([], [], null, 0);
    expect(zeroPivot).toEqual({ x: 0, y: 0, z: 0, source: "origin" });
  });

  it("Teste I — Interpolação suave cubic-bezier(0.22, 1, 0.36, 1) pelo menor arco azimutal", () => {
    const start = interpolateOrbitAngles(350, 90, 10, 35.26, 0);
    expect(start.azimuthDeg).toBeCloseTo(350, 4);
    expect(start.elevationDeg).toBeCloseTo(90, 4);

    const mid = interpolateOrbitAngles(350, 90, 10, 35.26, 0.5);
    // Menor arco entre 350° e 10° passa por 0°/360°, nunca por 180°
    expect(mid.azimuthDeg < 20 || mid.azimuthDeg > 340).toBe(true);

    const end = interpolateOrbitAngles(350, 90, 10, 35.26, 1);
    expect(end.azimuthDeg).toBeCloseTo(10, 4);
    expect(end.elevationDeg).toBeCloseTo(35.26, 4);
    expect(end.easedProgress).toBeCloseTo(1, 5);
  });
});
