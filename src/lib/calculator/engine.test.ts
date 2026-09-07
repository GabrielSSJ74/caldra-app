import { describe, expect, it } from "vitest";
import { CalculatorError, evaluateExpression, formatResult, toFraction } from "./engine";

describe("calculator engine", () => {
  it("respects precedence and parentheses", () => {
    expect(evaluateExpression("2 + 3 × 4", "RAD")).toBe(14);
    expect(evaluateExpression("(2 + 3) × 4", "RAD")).toBe(20);
  });
  it("calculates roots and powers", () => {
    expect(evaluateExpression("√144", "RAD")).toBe(12);
    expect(evaluateExpression("2^10", "RAD")).toBe(1024);
  });
  it("supports all angle modes", () => {
    expect(evaluateExpression("sin(30)", "DEG")).toBeCloseTo(0.5);
    expect(evaluateExpression("sin(pi/2)", "RAD")).toBeCloseTo(1);
    expect(evaluateExpression("cos(100)", "GRAD")).toBeCloseTo(0);
  });
  it("formats Brazilian decimals and fractions", () => {
    expect(formatResult(1.23456, 4)).toBe("1,2346");
    expect(toFraction(0.75)).toBe("3/4");
  });
  it("returns friendly errors", () => {
    expect(() => evaluateExpression("√-1", "RAD")).toThrow(CalculatorError);
    expect(() => evaluateExpression("2+", "RAD")).toThrow(CalculatorError);
  });
});
