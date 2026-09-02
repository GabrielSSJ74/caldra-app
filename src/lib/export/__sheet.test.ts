import { describe, it, expect } from "vitest";
import { renderSheet, SHEET_W } from "@/lib/export/renderSheet";
import { DEFAULT_LAYERS, type Entity } from "@/lib/lab2d/core";

const ents: Entity[] = [
  { id: "1", layer: "corte", type: "circle", cx: 50, cy: 50, r: 40 },
  { id: "2", layer: "construcao", type: "line", x1: 0, y1: 0, x2: 100, y2: 100 },
  { id: "3", layer: "cota", type: "arc", cx: 50, cy: 50, r: 20, a0: 0, a1: 1.2 },
];

describe("renderSheet", () => {
  it("é determinístico e independente de viewport", () => {
    const a = renderSheet(ents, DEFAULT_LAYERS, { project: "Projeto 02", plan: "P01" });
    const b = renderSheet(ents, DEFAULT_LAYERS, { project: "Projeto 02", plan: "P01" });
    expect(JSON.stringify(a.shapes)).toBe(JSON.stringify(b.shapes));
    expect(a.widthMm).toBe(SHEET_W);
    expect(a.shapes.every((s) => s.widthMm > 0 && s.widthMm < 1)).toBe(true);
  });
  it("ignora camadas ocultas", () => {
    const layers = DEFAULT_LAYERS.map((l) => (l.id === "corte" ? { ...l, visible: false } : l));
    const p = renderSheet(ents, layers, { project: "P", plan: "F" });
    expect(p.count).toBe(2);
  });
});
