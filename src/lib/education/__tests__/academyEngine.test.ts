import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calcNeutralLineVirola,
  calcTruncatedCone,
  calcBendAllowance,
  calcSquaringDiagonal,
  calcSheetWeight,
  calcArcRadiusFromChord,
} from "../academyEngine.ts";

describe("CALDRA Academia 3.0 — Validação dos Valores Dourados", () => {
  it("1. Linha Neutra e Desenvolvimento de Virola (Dext=500, t=3 -> Dn=497,00 e P=1561,37 mm)", () => {
    const res = calcNeutralLineVirola(500, 3);
    assert.equal(res.dn, 497.0);
    assert.equal(res.perimeter, 1561.37);
  });

  it("2. Tronco de Cone (D1=400, D2=200, H=300 -> G=316,23 mm e α=113,84°)", () => {
    const res = calcTruncatedCone(400, 200, 300);
    assert.equal(res.generatrix, 316.23);
    assert.equal(res.sectorAngleDeg, 113.84);
  });

  it("3. Desenvolvimento de Dobra Fator K (θ=90°, R=2, K=0.33, t=2 -> BA=4,18 mm)", () => {
    const res = calcBendAllowance(90, 2, 0.33, 2);
    assert.equal(res.ba, 4.18);
  });

  it("4. Esquadro por Diagonal Pitágoras (3000 x 4000 -> D=5000,00 mm)", () => {
    const res = calcSquaringDiagonal(3000, 4000);
    assert.equal(res.diagonal, 5000.0);
  });

  it("5. Peso de Chapa NBR 11888 MSG 14 (1,90 mm, 1000 x 2000 mm, ρ=7,85 -> 2,00 m² e 29,83 kg)", () => {
    const res = calcSheetWeight(1000, 2000, 1.9, 7.85);
    assert.equal(res.areaM2, 2.0);
    assert.equal(res.weightKg, 29.83);
  });

  it("6. Levantamento de Raio por Corda e Flecha (c=600, f=75 -> R=637,50 mm)", () => {
    const res = calcArcRadiusFromChord(600, 75);
    assert.equal(res.radius, 637.5);
  });
});
