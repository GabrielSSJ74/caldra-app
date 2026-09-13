import { describe, expect, it } from "vitest";
import { buildWire } from "@/lib/viz3d/wire";
import {
  SQUARE_TO_ROUND_DEFAULTS,
  buildModel,
  calculateSquareToRound,
  type SquareToRoundInput,
} from "./squareToRound";

const cases: SquareToRoundInput[] = [
  SQUARE_TO_ROUND_DEFAULTS,
  { ...SQUARE_TO_ROUND_DEFAULTS, baseA: 600, baseB: 350 },
  { ...SQUARE_TO_ROUND_DEFAULTS, height: 280, topDiameter: 220 },
  { ...SQUARE_TO_ROUND_DEFAULTS, height: 760, topDiameter: 500, divisions: 12 },
];

describe("transição quadrado para redondo canônica", () => {
  it.each(cases)("mantém base, boca, divisões e geratrizes: %#", (input) => {
    const canonical = buildModel(input);
    const result = calculateSquareToRound(input);
    const wire = buildWire("quadrado-redondo", {
      d1: Math.max(input.baseA, input.baseB),
      d2: input.topDiameter,
      h: input.height,
      e: input.offsetX,
      t: input.thickness,
      seg: input.divisions * 4,
      baseA: input.baseA,
      baseB: input.baseB,
      offsetY: input.offsetY,
      divisions: input.divisions,
    });

    expect(canonical.corners).toHaveLength(4);
    expect(canonical.circle).toHaveLength(input.divisions * 4);
    expect(result.trueLengths).toHaveLength(input.divisions * 4 + 1);
    expect(result.development.foldLines).toHaveLength(input.divisions * 4 + 5);
    const expectedWidth = Math.max(
      input.baseA,
      input.offsetX + input.topDiameter / 2,
      input.topDiameter / 2 - input.offsetX,
    );
    const expectedDepth = Math.max(
      input.baseB,
      input.offsetY + input.topDiameter / 2,
      input.topDiameter / 2 - input.offsetY,
    );
    expect(wire.bounds.max.x - wire.bounds.min.x).toBeCloseTo(expectedWidth, 6);
    expect(wire.bounds.max.z - wire.bounds.min.z).toBeCloseTo(expectedDepth, 6);
    expect(wire.bounds.max.y - wire.bounds.min.y).toBeCloseTo(input.height, 6);
    expect(wire.edges.length).toBe(input.divisions * 4 + 4 + input.divisions * 4 + 4);
  });

  it("preserva as excentricidades da boca circular", () => {
    const input = { ...SQUARE_TO_ROUND_DEFAULTS, offsetX: 55, offsetY: -35 };
    const model = buildModel(input);
    const center = model.circle.reduce(
      (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
      { x: 0, y: 0 },
    );
    expect(center.x / model.circle.length).toBeCloseTo(input.offsetX, 8);
    expect(center.y / model.circle.length).toBeCloseTo(input.offsetY, 8);
  });
});