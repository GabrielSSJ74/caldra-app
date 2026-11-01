import { describe, it, expect } from "vitest";
import { fitContourHQ, fitContourHQLegacy } from "./contourFitter";
import {
  detectCornersS6,
  fitContourPhaseD,
  fitLineTLS,
  mergeCollinearAndCocircularS8,
  runPrimitiveFittingPipelineS6ToS9,
  weldAndRefineTangencyS8,
} from "./primitiveFitterAndTopology";
import { runExtractionPipelineS2ToS5 } from "./imageExtractionPipeline";
import {
  createBlankImage,
  drawSyntheticCircleStroke,
  samplePrimitivePoints,
  type GroundTruthPrim,
} from "./visionMetricsAndHarness";
import type { Contour, PxPoint } from "./visionEngine";

/** Constrói um contorno fechado de pontos sintéticos a partir de uma primitiva ground-truth. */
function makeContourFromTruth(gt: GroundTruthPrim, stepPx = 1.0, hole = false): Contour {
  const pts = samplePrimitivePoints(gt, stepPx);
  // Remove último ponto caso coincida com o primeiro
  if (
    pts.length > 2 &&
    Math.hypot(pts[pts.length - 1]!.x - pts[0]!.x, pts[pts.length - 1]!.y - pts[0]!.y) < 0.5
  ) {
    pts.pop();
  }
  return {
    pts,
    closed: true,
    hole,
    area: 1000,
    bbox: { x: 0, y: 0, w: 400, h: 400 },
  };
}

describe("CHAMFER VISION 2.0 — FASE D: Segmentação (S6), Ajuste de Primitivas (S7), Tangência G1 (S8) e Topologia (S9)", () => {
  it("1. Elimina facetação de furos pequenos em imagens grandes (τ adaptativo por feição vs diagonal da imagem)", () => {
    // Em uma imagem 1200x900 (diagonal = 1500 px), tolerance='media' legada produzia maxDevPx = 9.0 px
    const diagonalPx = 1500;
    const legacyMaxDevPx = 0.006 * diagonalPx; // 9.0 px!

    // Furo circular pequeno R = 14 px extraído por traço
    const holeImg = createBlankImage(400, 400);
    drawSyntheticCircleStroke(holeImg, 200, 200, 14, 1.5);
    const s2s5 = runExtractionPipelineS2ToS5(holeImg, { imageKind: "auto" });
    expect(s2s5.contours.length).toBe(1);

    const holeContour = s2s5.contours[0]!;
    const prims = fitContourHQ(holeContour, {
      maxDevPx: legacyMaxDevPx,
      diagonalPx,
      preferCircles: true,
      regularize: true,
    });

    // Deve produzir exatamente 1 CIRCLE nativo e 0 retas/polilinhas
    expect(prims.length).toBe(1);
    expect(prims[0]!.kind).toBe("circle");
    if (prims[0]!.kind === "circle") {
      expect(Math.abs(prims[0]!.cx - 200)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(prims[0]!.cy - 200)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(prims[0]!.r - 14)).toBeLessThanOrEqual(0.65);
      expect(prims[0]!.confidence).toBe("ALTA");
    }
  });

  it("2. Retângulo com cantos arredondados (G6): 4 retas + 4 arcos com tangência G1 (erro <= 1°) e vértices soldados", () => {
    const k = Math.tan(Math.PI / 8); // bulge de arco de 90° CCW
    const gtRoundedRect: GroundTruthPrim = {
      kind: "lwpolyline",
      closed: true,
      vertices: [
        { x: 80, y: 50, bulge: 0 },
        { x: 220, y: 50, bulge: k },
        { x: 250, y: 80, bulge: 0 },
        { x: 250, y: 170, bulge: k },
        { x: 220, y: 200, bulge: 0 },
        { x: 80, y: 200, bulge: k },
        { x: 50, y: 170, bulge: 0 },
        { x: 50, y: 80, bulge: k },
      ],
    };

    const contour = makeContourFromTruth(gtRoundedRect, 1.0);
    const fitRes = fitContourPhaseD(contour, {
      preset: "equilibrado",
      typicalStrokeWidthPx: 1,
      emitUnifiedLwPolyline: false,
    });

    expect(fitRes.patternKind).toBe("rounded_rect");
    const lines = fitRes.prims.filter((p) => p.kind === "line");
    const arcs = fitRes.prims.filter((p) => p.kind === "arc");
    expect(lines.length).toBe(4);
    expect(arcs.length).toBe(4);

    // Todas as 8 junções devem ser tangentes G1 com erro angular residual <= 1.0°
    expect(fitRes.junctions.length).toBe(8);
    for (const j of fitRes.junctions) {
      expect(j.kind).toBe("tangent_G1");
      expect(j.residualTangencyDeg).toBeLessThanOrEqual(1.0);
    }

    // Modo LWPOLYLINE unificada deve emitir 1 polyline fechada com 8 vértices e 4 bulges != 0
    const fitUnified = fitContourPhaseD(contour, {
      preset: "equilibrado",
      typicalStrokeWidthPx: 1,
      emitUnifiedLwPolyline: true,
    });
    expect(fitUnified.prims.length).toBe(1);
    expect(fitUnified.prims[0]!.kind).toBe("polyline");
    if (fitUnified.prims[0]!.kind === "polyline") {
      expect(fitUnified.prims[0]!.closed).toBe(true);
      expect(fitUnified.prims[0]!.pts.length).toBe(8);
      const nonZeroBulges = (fitUnified.prims[0]!.bulges ?? []).filter((b) => Math.abs(b) > 0.1);
      expect(nonZeroBulges.length).toBe(4);
    }
  });

  it("3. Rasgo oblongo / slot (G7): 2 retas paralelas + 2 semicircunferências (bulge = ±1) sem facetação", () => {
    const gtSlot: GroundTruthPrim = {
      kind: "lwpolyline",
      closed: true,
      vertices: [
        { x: 90, y: 100, bulge: 0 },
        { x: 210, y: 100, bulge: 1.0 }, // Semicírculo 180° (tan(180°/4) = 1.0)
        { x: 210, y: 160, bulge: 0 },
        { x: 90, y: 160, bulge: 1.0 },
      ],
    };

    const contour = makeContourFromTruth(gtSlot, 1.0);
    const fitRes = fitContourPhaseD(contour, {
      preset: "equilibrado",
      typicalStrokeWidthPx: 1,
    });

    expect(fitRes.patternKind).toBe("oblong_slot");
    const lines = fitRes.prims.filter((p) => p.kind === "line");
    const arcs = fitRes.prims.filter((p) => p.kind === "arc");
    expect(lines.length).toBe(2);
    expect(arcs.length).toBe(2);

    // Verifica bulges da representação LWPOLYLINE unificada (~1.0 para cada semicírculo)
    const lw = fitRes.groundTruthForm[0]!;
    expect(lw.kind).toBe("lwpolyline");
    if (lw.kind === "lwpolyline") {
      expect(lw.vertices.length).toBe(4);
      const arcBulges = lw.vertices.filter((v) => Math.abs(v.bulge ?? 0) > 0.5);
      expect(arcBulges.length).toBe(2);
      for (const v of arcBulges) {
        expect(Math.abs(Math.abs(v.bulge!) - 1.0)).toBeLessThanOrEqual(0.06);
      }
    }
  });

  it("4. Perfil misto com transições tangentes e cantos vivos na mesma peça (G8)", () => {
    const k = Math.tan(Math.PI / 8);
    // Topo com dois cantos arredondados tangentes e base com dois cantos vivos de 90°
    const gtMixed: GroundTruthPrim = {
      kind: "lwpolyline",
      closed: true,
      vertices: [
        { x: 60, y: 60, bulge: 0 }, // canto vivo 90° na base esquerda
        { x: 240, y: 60, bulge: 0 }, // canto vivo 90° na base direita
        { x: 240, y: 150, bulge: k }, // transição tangente reta -> arco
        { x: 210, y: 180, bulge: 0 }, // transição tangente arco -> reta
        { x: 90, y: 180, bulge: k }, // transição tangente reta -> arco
        { x: 60, y: 150, bulge: 0 }, // transição tangente arco -> reta
      ],
    };

    const contour = makeContourFromTruth(gtMixed, 1.0);
    const fitRes = fitContourPhaseD(contour, {
      preset: "equilibrado",
      typicalStrokeWidthPx: 1,
    });

    const sharpCorners = fitRes.junctions.filter((j) => j.kind === "sharp_corner");
    const tangentJunctions = fitRes.junctions.filter((j) => j.kind === "tangent_G1");
    expect(sharpCorners.length).toBe(2);
    expect(tangentJunctions.length).toBe(4);
  });

  it("5. Elipse rotacionada (G9): preserva excentricidade b/a <= 0.95 e emite ELLIPSE (CAD) ou arcos tangentes (Laser)", () => {
    const gtEllipse: GroundTruthPrim = {
      kind: "ellipse",
      cx: 180,
      cy: 150,
      rx: 85,
      ry: 48,
      rotation: Math.PI / 6,
    };

    const contour = makeContourFromTruth(gtEllipse, 1.0);
    const fitLaser = fitContourPhaseD(contour, {
      preset: "equilibrado",
      outputMode: "laser_cypcut",
    });
    expect(fitLaser.patternKind).toBe("ellipse");
    expect(fitLaser.prims[0]!.ellipseParams).toBeDefined();
    expect(fitLaser.groundTruthForm[0]!.kind).toBe("lwpolyline");

    const fitCad = fitContourPhaseD(contour, {
      preset: "equilibrado",
      outputMode: "cad",
    });
    expect(fitCad.patternKind).toBe("ellipse");
    expect(fitCad.groundTruthForm[0]!.kind).toBe("ellipse");
    if (fitCad.groundTruthForm[0]!.kind === "ellipse") {
      expect(Math.abs(fitCad.groundTruthForm[0]!.rx - 85)).toBeLessThanOrEqual(1.2);
      expect(Math.abs(fitCad.groundTruthForm[0]!.ry - 48)).toBeLessThanOrEqual(1.2);
    }
  });

  it("6. Polígonos regulares (G10): hexágono (6 lados) e octógono (8 lados) permanecem retas com 0 círculos falsos", () => {
    const makeRegularPolygonContour = (sides: number, radius: number): Contour => {
      const vertices = [];
      for (let i = 0; i < sides; i++) {
        const theta = (2 * Math.PI * i) / sides;
        vertices.push({
          x: 200 + radius * Math.cos(theta),
          y: 200 + radius * Math.sin(theta),
          bulge: 0,
        });
      }
      return makeContourFromTruth({ kind: "lwpolyline", closed: true, vertices }, 1.0);
    };

    const hexRes = fitContourPhaseD(makeRegularPolygonContour(6, 70), { preset: "equilibrado" });
    expect(hexRes.patternKind).toBe("regular_polygon");
    expect(hexRes.prims.filter((p) => p.kind === "circle").length).toBe(0);
    expect(hexRes.prims.filter((p) => p.kind === "line").length).toBe(6);

    const octRes = fitContourPhaseD(makeRegularPolygonContour(8, 70), { preset: "equilibrado" });
    expect(octRes.patternKind).toBe("regular_polygon");
    expect(octRes.prims.filter((p) => p.kind === "circle").length).toBe(0);
    expect(octRes.prims.filter((p) => p.kind === "line").length).toBe(8);
  });

  it("7. Solda de vértices compartilhados (S8) garante gap 0.000000 px e avalia métricas S9 (cobertura >= 99%, excesso <= 1%)", () => {
    // Chapa retangular 240x160 com furo central R=35 extraída via S2–S5 e ajustada via S6–S9
    const w = 400;
    const h = 300;
    const data = new Uint8Array(w * h);
    for (let y = 60; y <= 240; y++) {
      for (let x = 80; x <= 320; x++) {
        const inHole = Math.hypot(x - 200, y - 150) <= 35;
        if (!inHole) data[y * w + x] = 1;
      }
    }

    const s2s5 = runExtractionPipelineS2ToS5({ data, width: w, height: h }, { imageKind: "SILHUETA" });
    expect(s2s5.contours.length).toBe(2);

    const s6s9 = runPrimitiveFittingPipelineS6ToS9(s2s5.contours, {
      preset: "equilibrado",
      typicalStrokeWidthPx: s2s5.typicalStrokeWidthPx,
      outputMode: "laser_cypcut",
    });

    expect(s6s9.countsByType.CIRCLE).toBe(1);
    expect(s6s9.countsByType.LINE).toBe(4);
    expect(s6s9.fidelity.coverage).toBeGreaterThanOrEqual(0.99);
    expect(s6s9.fidelity.excess).toBeLessThanOrEqual(0.01);

    // Verifica que as 4 retas da chapa têm extremidades consecutivas 100% soldadas (gap === 0)
    const lines = s6s9.prims.filter((p) => p.kind === "line");
    expect(lines.length).toBe(4);
    for (let i = 0; i < lines.length; i++) {
      const curr = lines[i]!;
      const next = lines[(i + 1) % lines.length]!;
      if (curr.kind === "line" && next.kind === "line") {
        const gap = Math.hypot(curr.x2 - next.x1, curr.y2 - next.y1);
        expect(gap).toBeLessThan(1e-9);
      }
    }
  });
});
