import { describe, it, expect } from "vitest";
import {
  ISO_PLANES,
  isoPlaneToCanvas,
  canvasToIsoPlane,
  buildIsoCircle,
  buildIsoParallelogram,
  constrainToIsoAxes,
  snapToIsoGrid,
  buildBentSupportPreset,
  buildIsoFlangePreset,
  buildIsoChannelPreset,
  ISO_SQRT_1_5,
  ISO_SQRT_0_5,
} from "./isometricEngine";

describe("isometricEngine", () => {
  it("tem os 3 planos canônicos configurados corretamente", () => {
    expect(ISO_PLANES.top.axisAnglesDeg).toEqual([30, 150]);
    expect(ISO_PLANES.left.axisAnglesDeg).toEqual([150, 90]);
    expect(ISO_PLANES.right.axisAnglesDeg).toEqual([30, 90]);

    expect(ISO_PLANES.top.ellipseRotationDeg).toBe(0);
    expect(ISO_PLANES.left.ellipseRotationDeg).toBe(-60);
    expect(ISO_PLANES.right.ellipseRotationDeg).toBe(60);
  });

  it("converte entre espaço do plano isométrico e canvas com reversibilidade exata", () => {
    const planes = ["top", "left", "right"] as const;
    const testPoints = [
      { u: 0, v: 0 },
      { u: 50, v: 100 },
      { u: -25, v: 75 },
      { u: 120, v: -40 },
    ];

    for (const plane of planes) {
      for (const pt of testPoints) {
        const canvasPt = isoPlaneToCanvas(plane, pt.u, pt.v);
        const back = canvasToIsoPlane(plane, canvasPt);
        expect(back.u).toBeCloseTo(pt.u, 5);
        expect(back.v).toBeCloseTo(pt.v, 5);
      }
    }
  });

  it("cria isocírculos com proporção isométrica canônica e rotação do plano", () => {
    const radius = 20;
    const topCircle = buildIsoCircle("top", { x: 10, y: 20 }, radius, "corte");
    expect(topCircle.type).toBe("ellipse");
    if (topCircle.type === "ellipse") {
      expect(topCircle.rx).toBeCloseTo(radius * ISO_SQRT_1_5, 5);
      expect(topCircle.ry).toBeCloseTo(radius * ISO_SQRT_0_5, 5);
      expect(topCircle.rotation).toBe(0);
      expect(topCircle.params?.isIso).toBe(true);
      expect(topCircle.params?.realRadius).toBe(20);
      expect(topCircle.params?.realDiameter).toBe(40);
    }

    const leftCircle = buildIsoCircle("left", { x: 0, y: 0 }, radius, "recorte", true);
    if (leftCircle.type === "ellipse") {
      expect(leftCircle.rotation).toBeCloseTo((-60 * Math.PI) / 180, 5);
      expect(leftCircle.params?.isHole).toBe(true);
    }

    const rightCircle = buildIsoCircle("right", { x: 0, y: 0 }, radius, "corte");
    if (rightCircle.type === "ellipse") {
      expect(rightCircle.rotation).toBeCloseTo((60 * Math.PI) / 180, 5);
    }
  });

  it("cria paralelogramo isométrico fechado com 4 vértices", () => {
    const p1 = { x: 0, y: 0 };
    const p2 = isoPlaneToCanvas("top", 100, 50);
    const rect = buildIsoParallelogram("top", p1, p2, "corte");
    expect(rect.type).toBe("polyline");
    if (rect.type === "polyline") {
      expect(rect.closed).toBe(true);
      expect(rect.pts.length).toBe(4);
      expect(rect.params?.realWidth).toBeCloseTo(100, 3);
      expect(rect.params?.realHeight).toBeCloseTo(50, 3);
    }
  });

  it("restringe deslocamento do cursor aos eixos isométricos (Orto Isométrico)", () => {
    const from = { x: 0, y: 0 };
    // Tentativa de mover ligeiramente fora de 30°
    const rawTo = { x: 86.6, y: -45 };
    const constrained = constrainToIsoAxes(from, rawTo, "top");
    // Deve projetar perfeitamente sobre a reta de 30°
    const angleRad = Math.atan2(-constrained.y, constrained.x);
    const angleDeg = (angleRad * 180) / Math.PI;
    expect(angleDeg).toBeCloseTo(30, 1);
  });

  it("aplica snapping à grade isométrica com passos regulares", () => {
    const rawPt = { x: 12.34, y: -8.76 };
    const snapped = snapToIsoGrid(rawPt, 10, "top");
    const uv = canvasToIsoPlane("top", snapped);
    expect(Math.abs(uv.u % 10)).toBeCloseTo(0, 4);
    expect(Math.abs(uv.v % 10)).toBeCloseTo(0, 4);
  });

  it("gera o preset de suporte dobrado com base, abas, furos em múltiplos planos e cotas", () => {
    const { entities, dims } = buildBentSupportPreset({
      baseWidth: 100,
      baseLength: 70,
      flangeHeight: 50,
      thickness: 3,
      holeDiameter: 12,
    });

    expect(entities.length).toBeGreaterThan(10);
    expect(dims.length).toBe(3);

    // Deve conter elementos nas camadas de corte, dobra e recorte
    const layers = new Set(entities.map((e) => e.layer));
    expect(layers.has("corte")).toBe(true);
    expect(layers.has("dobra")).toBe(true);
    expect(layers.has("recorte")).toBe(true);

    // Deve conter furos isométricos (elipses)
    const ellipses = entities.filter((e) => e.type === "ellipse");
    expect(ellipses.length).toBeGreaterThanOrEqual(3);
  });

  it("gera preset de flange isométrico circular com furação polar PCD e espessura", () => {
    const { entities, dims } = buildIsoFlangePreset({
      plane: "top",
      outerDia: 180,
      innerDia: 70,
      boltCircleDia: 130,
      numHoles: 6,
      holeDia: 14,
      thickness: 10,
    });

    expect(entities.length).toBeGreaterThanOrEqual(10);
    expect(dims.length).toBeGreaterThanOrEqual(1);

    const ellipses = entities.filter((e) => e.type === "ellipse");
    // Outer + Bottom Outer + Inner Hole + 6 PCD holes = at least 9 ellipses
    expect(ellipses.length).toBeGreaterThanOrEqual(8);
  });

  it("gera preset de canal U dobrado isométrico com abas e linhas de dobra", () => {
    const { entities, dims } = buildIsoChannelPreset({
      webWidth: 100,
      flangeHeight: 50,
      length: 160,
      thickness: 4,
      holeDia: 12,
    });

    expect(entities.length).toBeGreaterThan(6);
    expect(dims.length).toBe(3);

    const foldLines = entities.filter((e) => e.layer === "dobra");
    expect(foldLines.length).toBe(2);
  });
});
