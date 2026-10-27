import { describe, it, expect } from "vitest";
import {
  detectHostPart,
  computeInstances,
  validateArray,
  getGroupCenter,
  type ArraySpec,
} from "../cadArrayEngine";
import type { Entity } from "../core";

describe("cadArrayEngine — Motor Analítico de Arrays", () => {
  // Geometria de teste de um flange padrão industrial:
  // Centro em (500, 500)
  // Círculo externo: Ø 300 mm (R = 150 mm)
  // Furo central: Ø 100 mm (R = 50 mm)
  // Furo de fixação: Ø 20 mm (R = 10 mm) localizado em (500, 600), ou seja, Raio PCD = 100 mm (PCD = 200 mm)
  const outerCircle: Entity = {
    id: "flange-outer",
    type: "circle",
    cx: 500,
    cy: 500,
    r: 150,
    layer: "corte",
  };

  const innerBoreCircle: Entity = {
    id: "flange-inner",
    type: "circle",
    cx: 500,
    cy: 500,
    r: 50,
    layer: "corte",
  };

  const holeSample: Entity = {
    id: "hole-1",
    type: "circle",
    cx: 500,
    cy: 600,
    r: 10,
    layer: "corte",
  };

  const flangeEntities = [outerCircle, innerBoreCircle, holeSample];

  describe("1. Detecção Inteligente da Peça Hospedeira (detectHostPart)", () => {
    it("deve detectar flange concêntrico com ALTA confiança e calcular PCD exato", () => {
      const host = detectHostPart(flangeEntities, [holeSample]);

      expect(host.type).toBe("flange");
      expect(host.confidence).toBe("high");
      expect(host.suggestedType).toBe("polar");
      expect(host.center).toEqual({ x: 500, y: 500 });
      expect(host.rInner).toBe(50);
      expect(host.rOuter).toBe(150);
      expect(host.pcd).toBeCloseTo(200, 4); // 2 * 100mm
      expect(host.candidateCenters.length).toBeGreaterThan(0);
      expect(host.candidateCenters[0]!.source).toBe("concentric_flange");
    });

    it("deve detectar disco circular simples com confiança média quando há apenas 1 contorno externo", () => {
      const diskEntities = [outerCircle, holeSample];
      const host = detectHostPart(diskEntities, [holeSample]);

      expect(host.type).toBe("circular_plate");
      expect(host.confidence).toBe("medium");
      expect(host.suggestedType).toBe("polar");
      expect(host.center).toEqual({ x: 500, y: 500 });
      expect(host.pcd).toBeCloseTo(200, 4);
    });

    it("deve detectar chapa retangular quando as outras geometrias delimitam um retângulo", () => {
      const plateBoundary: Entity = {
        id: "plate-rect",
        type: "polyline",
        pts: [
          { x: 0, y: 0 },
          { x: 400, y: 0 },
          { x: 400, y: 300 },
          { x: 0, y: 300 },
        ],
        closed: true,
        layer: "corte",
      };
      const holeOnPlate: Entity = {
        id: "hole-p",
        type: "circle",
        cx: 50,
        cy: 50,
        r: 8,
        layer: "corte",
      };

      const host = detectHostPart([plateBoundary, holeOnPlate], [holeOnPlate]);
      expect(host.type).toBe("sheet");
      expect(host.suggestedType).toBe("linear");
      expect(host.sheetBounds).toBeDefined();
      expect(host.sheetBounds?.width).toBe(400);
      expect(host.sheetBounds?.height).toBe(300);
    });
  });

  describe("2. Cálculo de Instâncias Polares (computeInstances)", () => {
    it("deve gerar exatamente (count - 1) instâncias quando includeOriginal=true em 360°", () => {
      const spec: ArraySpec = {
        id: "array-polar-test",
        type: "polar",
        sourceEntityIds: [holeSample.id],
        polar: {
          center: { x: 500, y: 500 },
          count: 6,
          totalAngleDeg: 360,
          startAngleDeg: 90,
          clockwise: false,
          rotateItems: true,
          includeOriginal: true,
        },
      };

      const result = computeInstances(spec, [holeSample]);
      // 6 no total, sendo 1 original e 5 novas instâncias
      expect(result.instances.length).toBe(5);

      // Todas as novas instâncias devem estar no mesmo raio de 100mm do centro (500, 500)
      result.instances.forEach((inst, idx) => {
        expect(inst.type).toBe("circle");
        if (inst.type === "circle") {
          const d = Math.hypot(inst.cx - 500, inst.cy - 500);
          expect(d).toBeCloseTo(100, 3);
          expect(inst.r).toBe(10);
        }
      });

      // Guias visuais geradas
      expect(result.guides.pcdCircle).toBeDefined();
      expect(result.guides.pcdCircle?.cx).toBe(500);
      expect(result.guides.pcdCircle?.cy).toBe(500);
      expect(result.guides.pcdCircle?.r).toBeCloseTo(100, 3);
      expect(result.guides.radialLines?.length).toBe(6);
    });

    it("deve distribuir furos uniformemente a cada 60° para 6 furos em 360°", () => {
      const spec: ArraySpec = {
        id: "array-polar-angles",
        type: "polar",
        sourceEntityIds: [holeSample.id],
        polar: {
          center: { x: 500, y: 500 },
          count: 4,
          totalAngleDeg: 360,
          startAngleDeg: 0,
          clockwise: false,
          includeOriginal: true,
        },
      };

      // Furo base em (600, 500) -> 0°
      const holeAt0Deg: Entity = {
        id: "h0",
        type: "circle",
        cx: 600,
        cy: 500,
        r: 10,
        layer: "corte",
      };

      const { instances } = computeInstances(spec, [holeAt0Deg]);
      expect(instances.length).toBe(3);

      // 4 furos a cada 90°: 90° -> (500, 600), 180° -> (400, 500), 270° -> (500, 400)
      const circles = instances as (Entity & { type: "circle" })[];
      expect(circles[0]!.cx).toBeCloseTo(500, 3);
      expect(circles[0]!.cy).toBeCloseTo(600, 3);

      expect(circles[1]!.cx).toBeCloseTo(400, 3);
      expect(circles[1]!.cy).toBeCloseTo(500, 3);

      expect(circles[2]!.cx).toBeCloseTo(500, 3);
      expect(circles[2]!.cy).toBeCloseTo(400, 3);
    });
  });

  describe("3. Cálculo de Instâncias Lineares (computeInstances)", () => {
    it("deve gerar grade retangular uniforme com deslocamentos corretos", () => {
      const spec: ArraySpec = {
        id: "array-linear-test",
        type: "linear",
        sourceEntityIds: [holeSample.id],
        linear: {
          rows: 2,
          cols: 3,
          dx: 50,
          dy: 40,
          angleDeg: 0,
          includeOriginal: true,
        },
      };

      const { instances } = computeInstances(spec, [holeSample]);
      // 2 * 3 = 6 posições, menos a original = 5 novas
      expect(instances.length).toBe(5);

      // Instância (r=0, c=1) -> dx=50, dy=0 a partir de (500, 600)
      const c1 = instances.find(
        (i) => i.params?.arrayRow === 0 && i.params?.arrayCol === 1,
      ) as Entity & { type: "circle" };
      expect(c1).toBeDefined();
      expect(c1.cx).toBe(550);
      expect(c1.cy).toBe(600);

      // Instância (r=1, c=2) -> dx=100, dy=40 a partir de (500, 600)
      const c2 = instances.find(
        (i) => i.params?.arrayRow === 1 && i.params?.arrayCol === 2,
      ) as Entity & { type: "circle" };
      expect(c2).toBeDefined();
      expect(c2.cx).toBe(600);
      expect(c2.cy).toBe(640);
    });
  });

  describe("4. Validação Física do Array (validateArray)", () => {
    it("deve aprovar padrão válido dentro da coroa do flange", () => {
      const spec: ArraySpec = {
        id: "spec-valid",
        type: "polar",
        sourceEntityIds: [holeSample.id],
        polar: {
          center: { x: 500, y: 500 },
          count: 6,
          totalAngleDeg: 360,
          startAngleDeg: 90,
          includeOriginal: true,
        },
      };
      const host = detectHostPart(flangeEntities, [holeSample]);
      const validation = validateArray(spec, [holeSample], host);

      expect(validation.isValid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });

    it("deve reprovar com erro quando os furos invadirem o furo central do flange", () => {
      // Furo posicionado muito próximo ao centro (raio = 55 mm, raio do furo = 10 mm)
      // d - r = 45 mm < 50 mm (furo interno) -> colisão!
      const invalidHole: Entity = {
        id: "hole-invade",
        type: "circle",
        cx: 500,
        cy: 555,
        r: 10,
        layer: "corte",
      };

      const spec: ArraySpec = {
        id: "spec-invalid",
        type: "polar",
        sourceEntityIds: [invalidHole.id],
        polar: {
          center: { x: 500, y: 500 },
          count: 6,
          totalAngleDeg: 360,
          startAngleDeg: 90,
          includeOriginal: true,
        },
      };

      const host = detectHostPart([outerCircle, innerBoreCircle, invalidHole], [invalidHole]);
      const validation = validateArray(spec, [invalidHole], host);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes("furo central"))).toBe(true);
    });

    it("deve reprovar quando a quantidade de furos causa sobreposição mútua", () => {
      // 50 furos de Ø 20 mm num PCD de apenas 100 mm (perímetro = 314 mm; passo = 6.28 mm < 20 mm)
      const spec: ArraySpec = {
        id: "spec-crowded",
        type: "polar",
        sourceEntityIds: [holeSample.id],
        polar: {
          center: { x: 500, y: 500 },
          count: 50,
          totalAngleDeg: 360,
          startAngleDeg: 90,
          radius: 50,
        },
      };

      const host = detectHostPart(flangeEntities, [holeSample]);
      const validation = validateArray(spec, [holeSample], host);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes("sobrepõem"))).toBe(true);
    });
  });
});
