import { describe, expect, it } from "vitest";
import { bendEdgeMarks } from "./technical";

describe("marca de dobra na borda", () => {
  it("gera uma marca em cada extremidade, sem ponto central", () => {
    const [a, b] = bendEdgeMarks({ x1: 0, y1: 0, x2: 100, y2: 0 });
    expect({ x: a.x1, y: a.y1 }).toEqual({ x: 0, y: 0 });
    expect({ x: b.x1, y: b.y1 }).toEqual({ x: 100, y: 0 });
  });

  it("mantém os dois traços curtos no eixo da dobra", () => {
    const marks = bendEdgeMarks({ x1: 0, y1: 0, x2: 100, y2: 0 }, 8);
    expect(marks).toEqual([
      { x1: 0, y1: 0, x2: 8, y2: 0 },
      { x1: 100, y1: 0, x2: 92, y2: 0 },
    ]);
  });

  it("acompanha a inclinação do segmento", () => {
    const [a, b] = bendEdgeMarks({ x1: 0, y1: 0, x2: 0, y2: 50 }, 6);
    expect(a.y2).toBeCloseTo(6, 9);
    expect(b.y2).toBeCloseTo(44, 9);
  });

  it("não quebra em segmento degenerado", () => {
    const marks = bendEdgeMarks({ x1: 10, y1: 10, x2: 10, y2: 10 });
    expect(marks.every((m) => Number.isFinite(m.x2) && Number.isFinite(m.y2))).toBe(true);
  });
});
