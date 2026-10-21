import { describe, expect, it } from "vitest";
import {
  decimalToDMS,
  dmsToDecimal,
  evaluateExpression,
  mmToCommercialInchFraction,
} from "./engine";

describe("porcentagem convencional", () => {
  it.each([
    ["10%", 0.1],
    ["10%*250", 25],
    ["200+10%", 220],
    ["200-10%", 180],
    ["200+10%+10%", 242],
    ["(200+10%)*2", 440],
    ["200/10%", 2000],
    ["50+20%", 60],
    ["50-20%", 40],
  ])("%s = %s", (expression, expected) => {
    expect(evaluateExpression(expression, "DEG")).toBeCloseTo(expected, 10);
  });
});

describe("funções de caldeiraria e trigonometria", () => {
  it("calcula hipotenusa / esquadro hypot(a; b)", () => {
    expect(evaluateExpression("hypot(300; 400)", "DEG")).toBeCloseTo(500, 6);
    expect(evaluateExpression("hypot(300, 400)", "DEG")).toBeCloseTo(500, 6);
    expect(evaluateExpression("hypot(60; 80)", "DEG")).toBeCloseTo(100, 6);
  });

  it("suporta Ans e potências rápidas", () => {
    expect(evaluateExpression("Ans*2", "DEG", 125)).toBeCloseTo(250, 6);
    expect(evaluateExpression("5²+2³", "DEG")).toBeCloseTo(33, 6);
  });

  it("converte mm para polegada fracionária comercial", () => {
    expect(mmToCommercialInchFraction(25.4).formatted).toBe('1"');
    expect(mmToCommercialInchFraction(12.7).formatted).toBe('1/2"');
    expect(mmToCommercialInchFraction(31.75).formatted).toBe('1 1/4"');
    expect(mmToCommercialInchFraction(9.525).formatted).toBe('3/8"');
  });

  it("converte graus decimais e DMS", () => {
    const dms = decimalToDMS(45.5);
    expect(dms.deg).toBe(45);
    expect(dms.min).toBe(30);
    expect(dms.sec).toBe(0);
    expect(dmsToDecimal(45, 30, 0)).toBeCloseTo(45.5, 6);
  });
});

