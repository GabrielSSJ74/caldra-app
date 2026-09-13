/**
 * REGRESSÃO SEMÂNTICA DA EXPORTAÇÃO CNC.
 *
 * Golden sample: quadrado-→-redondo-p01.dxf (arquivo real do usuário).
 * A comparação é GEOMÉTRICA e SEMÂNTICA — nunca byte a byte.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { exportDxf, importDxf } from "@/lib/dxf/dxfService";
import {
  DEFAULT_CNC_OPTIONS,
  buildCncDxf,
  cncCounts,
  layerMapping,
  validateCncExport,
  verifyCncDxf,
} from "@/lib/dxf/cncExport";
import { uid, type Entity } from "@/lib/lab2d/core";
import { roleOf, structureMap } from "@/lib/lab2d/roles";

const golden = importDxf(
  readFileSync(join(process.cwd(), "src/lib/dxf/__fixtures__/quadrado-redondo-p01.dxf"), "utf8"),
);

/** Peça equivalente ao golden sample, no modelo do CHAMFER. */
function samplePart(): Entity[] {
  const outline = [
    { x: 0, y: 0 },
    { x: 600, y: 0 },
    { x: 600, y: 820 },
    { x: 0, y: 820 },
  ];
  return [
    { id: uid(), layer: "corte", type: "polyline", closed: true, pts: outline },
    { id: uid(), layer: "corte", type: "circle", cx: 300, cy: 410, r: 40 },
    { id: uid(), layer: "dobra", type: "line", x1: 0, y1: 200, x2: 600, y2: 200 },
    { id: uid(), layer: "dobra", type: "line", x1: 0, y1: 600, x2: 600, y2: 600 },
    { id: uid(), layer: "marcacao", type: "line", x1: 50, y1: 50, x2: 550, y2: 50 },
    { id: uid(), layer: "construcao", type: "line", x1: 0, y1: 410, x2: 600, y2: 410 },
    { id: uid(), layer: "cota", type: "text", x: 10, y: 10, text: "600", size: 12 },
  ];
}

describe("golden sample do usuário", () => {
  it("tem um contorno principal fechado e geometria auxiliar separada", () => {
    const closed = golden.entities.filter((e) => e.type === "LWPOLYLINE" && e.closed);
    expect(closed).toHaveLength(1);
    const contourLayer = closed[0]!.layer;
    const aux = golden.entities.filter((e) => e.layer !== contourLayer);
    expect(aux.length).toBeGreaterThan(0);
    expect(new Set(golden.entities.map((e) => e.layer)).size).toBe(2);
  });

  it("mantém escala 1:1 em milímetros", () => {
    const poly = golden.entities.find((e) => e.type === "LWPOLYLINE" && e.closed);
    expect(poly && poly.type === "LWPOLYLINE").toBe(true);
    if (poly?.type !== "LWPOLYLINE") return;
    const xs = poly.points.map((p) => p.x);
    const ys = poly.points.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(611.288, 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(820.734, 1);
    expect(poly.points.length).toBe(30);
  });
});

describe("papéis de fabricação", () => {
  it("classifica pela camada semântica, nunca pela cor", () => {
    const [outline, hole, bend, , mark, ref, dim] = samplePart();
    expect(roleOf(outline!)).toBe("CUT");
    expect(roleOf(hole!)).toBe("CUT");
    expect(roleOf(bend!)).toBe("BEND");
    expect(roleOf(mark!)).toBe("MARK");
    expect(roleOf(ref!)).toBe("REFERENCE");
    expect(roleOf(dim!)).toBe("DIMENSION");
  });

  it("separa contorno externo, furos e cortes internos", () => {
    const part = samplePart();
    const structure = structureMap(part);
    expect(structure.get(part[0]!.id)).toBe("outer");
    expect(structure.get(part[1]!.id)).toBe("hole");
    const c = cncCounts(part);
    expect(c).toMatchObject({ CUT: 2, MARK: 1, BEND: 2, REFERENCE: 1, DIMENSION: 1, outer: 1, holes: 1 });
    expect(c.unclassified).toBe(0);
  });

  it("acusa erro de fabricação em geometria sem classificação", () => {
    const part: Entity[] = [
      ...samplePart(),
      { id: uid(), layer: "qualquer", type: "line", x1: 0, y1: 0, x2: 10, y2: 0 },
    ];
    expect(cncCounts(part).unclassified).toBe(1);
    const issues = validateCncExport(part, DEFAULT_CNC_OPTIONS);
    expect(issues.some((i) => i.level === "error" && i.scope === "Classificação")).toBe(true);
    // nada sem papel entra no arquivo
    const doc = buildCncDxf(part, DEFAULT_CNC_OPTIONS);
    expect(doc.entities.every((e) => e.layer !== "UNCLASSIFIED")).toBe(true);
  });
});

describe("perfil CYP CUT", () => {
  const part = samplePart();
  const doc = buildCncDxf(part, DEFAULT_CNC_OPTIONS);

  it("exporta somente corte, marcação e dobra", () => {
    expect(new Set(doc.layers.map((l) => l.name))).toEqual(new Set(["CUT", "MARK", "BEND"]));
    expect(doc.entities.filter((e) => e.layer === "CUT")).toHaveLength(2);
    expect(doc.entities.filter((e) => e.layer === "BEND")).toHaveLength(2);
    expect(doc.entities.filter((e) => e.layer === "MARK")).toHaveLength(1);
  });

  it("nunca leva dobra, referência ou cota para CUT", () => {
    const cut = doc.entities.filter((e) => e.layer === "CUT");
    expect(cut.every((e) => e.type === "LWPOLYLINE" || e.type === "CIRCLE")).toBe(true);
    expect(doc.entities.some((e) => e.layer === "REFERENCE")).toBe(false);
    expect(doc.entities.some((e) => e.layer === "DIMENSION")).toBe(false);
  });

  it("mantém o contorno externo fechado e em escala 1:1 em mm", () => {
    const text = exportDxf(doc);
    expect(text).toContain("$INSUNITS");
    const back = importDxf(text);
    const outer = back.entities.find((e) => e.layer === "CUT" && e.type === "LWPOLYLINE");
    expect(outer?.type === "LWPOLYLINE" && outer.closed).toBe(true);
    if (outer?.type !== "LWPOLYLINE") return;
    const xs = outer.points.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(600, 6);
    const check = verifyCncDxf(part, DEFAULT_CNC_OPTIONS, text);
    expect(check.ok).toBe(true);
  });

  it("permite mapear dobra como marcação sem alterar a geometria", () => {
    const asMark = buildCncDxf(part, { ...DEFAULT_CNC_OPTIONS, bendAs: "MARK" });
    expect(asMark.entities.filter((e) => e.layer === "MARK")).toHaveLength(3);
    expect(asMark.entities.some((e) => e.layer === "BEND")).toBe(false);
    expect(asMark.entities.length).toBe(doc.entities.length);
  });
});

describe("perfis técnico e produção", () => {
  const part = samplePart();

  it("o técnico inclui referência e cotas em layers próprias", () => {
    const opts = {
      ...DEFAULT_CNC_OPTIONS,
      profileId: "tecnico",
      roles: { CUT: true, MARK: true, BEND: true, REFERENCE: true, DIMENSION: true },
    };
    const doc = buildCncDxf(part, opts);
    expect(doc.layers.map((l) => l.name)).toContain("REFERENCE");
    expect(doc.entities.some((e) => e.layer === "REFERENCE")).toBe(true);
  });

  it("a produção descarta referência e cota mesmo se habilitadas", () => {
    const opts = {
      ...DEFAULT_CNC_OPTIONS,
      profileId: "producao",
      roles: { CUT: true, MARK: true, BEND: true, REFERENCE: true, DIMENSION: true },
    };
    const doc = buildCncDxf(part, opts);
    expect(doc.entities.some((e) => e.layer === "REFERENCE")).toBe(false);
    expect(layerMapping(opts).find((m) => m.role === "REFERENCE")?.layer).toBeNull();
  });
});
