import { describe, it, expect } from "vitest";
import {
  extractIntersections,
  extractEntitySmartReferences,
  findSmartSnap,
} from "../cadReferenceSnaps";
import { shouldUseTouchOffset } from "@/components/lab2d/ChamferVirtualCursor";
import type { Entity } from "../types";

describe("CALDRA CHAMFER — Upgrade PRE: Interseção Universal, Divisão Virtual de Snap e Mira 55px no SEL", () => {
  it("calcula analiticamente os 2 pontos de interseção entre dois círculos (Círculo × Círculo)", () => {
    const c1: Entity = {
      id: "c1",
      layer: "corte",
      type: "circle",
      cx: 0,
      cy: 0,
      r: 50,
    };
    const c2: Entity = {
      id: "c2",
      layer: "corte",
      type: "circle",
      cx: 60,
      cy: 0,
      r: 50,
    };

    const hits = extractIntersections([c1, c2]);
    expect(hits.length).toBe(2);

    // Pela fórmula: d = 60, a = 30, h = sqrt(50^2 - 30^2) = 40
    // Pontos esperados: (30, 40) e (30, -40)
    const ys = hits.map((h) => h.p.y).sort((a, b) => a - b);
    expect(hits[0].p.x).toBeCloseTo(30, 4);
    expect(hits[1].p.x).toBeCloseTo(30, 4);
    expect(ys[0]).toBeCloseTo(-40, 4);
    expect(ys[1]).toBeCloseTo(40, 4);
    expect(hits[0].kind).toBe("intersection");
  });

  it("calcula analiticamente as interseções entre Linha e Círculo (Linha × Círculo)", () => {
    const line: Entity = {
      id: "l1",
      layer: "corte",
      type: "line",
      x1: -100,
      y1: 30,
      x2: 100,
      y2: 30,
    };
    const circle: Entity = {
      id: "c1",
      layer: "corte",
      type: "circle",
      cx: 0,
      cy: 0,
      r: 50,
    };

    const hits = extractIntersections([line, circle]);
    expect(hits.length).toBe(2);
    const xs = hits.map((h) => h.p.x).sort((a, b) => a - b);
    // x^2 + 30^2 = 50^2 => x = ±40
    expect(xs[0]).toBeCloseTo(-40, 4);
    expect(xs[1]).toBeCloseTo(40, 4);
    expect(hits[0].p.y).toBeCloseTo(30, 4);
  });

  it("gera pontos virtuais de Divisão do Snap (não-destrutivo) em linhas, círculos e arcos", () => {
    const line: Entity = {
      id: "l1",
      layer: "corte",
      type: "line",
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
    };

    // Divisão em 4 partes iguais -> 3 pontos internos (25, 50, 75)
    const lineRefs = extractEntitySmartReferences(line, null, 0, 4);
    const divRefs = lineRefs.filter((r) => r.kind === "division");
    expect(divRefs.length).toBe(3);
    expect(divRefs.map((r) => r.p.x)).toEqual([25, 50, 75]);
    expect(divRefs[0].label).toBe("DIVISÃO 1/4");

    // Círculo dividido em 8 partes angulares (45° cada): 4 quadrantes + 4 divisões diagonais = 8 pontos equidistantes
    const circle: Entity = {
      id: "c1",
      layer: "corte",
      type: "circle",
      cx: 0,
      cy: 0,
      r: 100,
    };
    const circleRefs = extractEntitySmartReferences(circle, null, 0, 8);
    const circleDivs = circleRefs.filter((r) => r.kind === "division" || r.kind === "quadrant");
    expect(circleDivs.length).toBe(8);

    // Verifica que findSmartSnap captura ponto de divisão a 45° no círculo
    const diagPt = { x: 100 * Math.cos(Math.PI / 4), y: 100 * Math.sin(Math.PI / 4) };
    const snap = findSmartSnap({ x: diagPt.x + 1, y: diagPt.y - 1 }, [circle], 5, null, "line", [], 8);
    expect(snap).not.toBeNull();
    expect(snap?.kind).toBe("division");
    expect(snap?.p.x).toBeCloseTo(diagPt.x, 3);
    expect(snap?.p.y).toBeCloseTo(diagPt.y, 3);
  });

  it("ativa a Mira Deslocada de 55px no botão SEL (Selecionar) em modo touch", () => {
    expect(shouldUseTouchOffset("touch", "select", false, false, "offset", false)).toBe(true);
    expect(shouldUseTouchOffset("touch", "select", false, false, "offset", true)).toBe(true);
    expect(shouldUseTouchOffset("touch", "select", false, false, "direct", false)).toBe(false);
    expect(shouldUseTouchOffset("mouse", "select", false, false, "offset", false)).toBe(false);
  });
});
