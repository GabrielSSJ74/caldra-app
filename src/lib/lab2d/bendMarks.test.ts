import { describe, expect, it } from "vitest";
import { bendEdgeMarks } from "./technical";

describe("marca de dobra na borda", () => {
  it("ponto preenchido no centro do segmento", () => {
    const m = bendEdgeMarks({ x1: 0, y1: 0, x2: 100, y2: 0 });
    expect(m.dot).toEqual({ x: 50, y: 0 });
  });

  it("traço curto perpendicular à linha, do comprimento pedido", () => {
    const m = bendEdgeMarks({ x1: 0, y1: 0, x2: 100, y2: 0 }, 8);
    expect(m.tick.x1).toBeCloseTo(50, 9);
    expect(m.tick.x2).toBeCloseTo(50, 9);
    expect(Math.hypot(m.tick.x2 - m.tick.x1, m.tick.y2 - m.tick.y1)).toBeCloseTo(8, 9);
  });

  it("acompanha a inclinação do segmento", () => {
    const m = bendEdgeMarks({ x1: 0, y1: 0, x2: 0, y2: 50 }, 6);
    expect(m.dot).toEqual({ x: 0, y: 25 });
    expect(Math.abs(m.tick.x2 - m.tick.x1)).toBeCloseTo(6, 9);
  });

  it("não quebra em segmento degenerado", () => {
    const m = bendEdgeMarks({ x1: 10, y1: 10, x2: 10, y2: 10 });
    expect(Number.isFinite(m.dot.x)).toBe(true);
    expect(Number.isFinite(m.tick.x1)).toBe(true);
  });
});
