import { describe, it, expect } from "vitest";
import { evaluateAmount } from "../../src/lib/food/amount-expression";

describe("evaluateAmount", () => {
  it("returns plain numbers unchanged", () => {
    expect(evaluateAmount("100")).toBe(100);
    expect(evaluateAmount("0")).toBe(0);
    expect(evaluateAmount("2.5")).toBe(2.5);
    expect(evaluateAmount(".5")).toBe(0.5);
  });

  it("evaluates the four operators with correct precedence", () => {
    expect(evaluateAmount("65 / 2")).toBe(32.5);
    expect(evaluateAmount("2 + 3 * 4")).toBe(14);
    expect(evaluateAmount("10 - 4 - 2")).toBe(4); // left-associative
    expect(evaluateAmount("100 * 1.5")).toBe(150);
  });

  it("honours parentheses and unary signs", () => {
    expect(evaluateAmount("(2 + 3) * 4")).toBe(20);
    expect(evaluateAmount("-5 + 10")).toBe(5);
    expect(evaluateAmount("10 * -2")).toBe(-20);
    expect(evaluateAmount("--3")).toBe(3);
  });

  it("ignores surrounding and internal whitespace", () => {
    expect(evaluateAmount("  65/2  ")).toBe(32.5);
    expect(evaluateAmount("1 + 2")).toBe(3);
  });

  it("returns null for empty or whitespace-only input", () => {
    expect(evaluateAmount("")).toBeNull();
    expect(evaluateAmount("   ")).toBeNull();
  });

  it("returns null for mid-typing / incomplete expressions", () => {
    expect(evaluateAmount("65 /")).toBeNull();
    expect(evaluateAmount("65 +")).toBeNull();
    expect(evaluateAmount("(2 + 3")).toBeNull();
    expect(evaluateAmount("2 3")).toBeNull();
  });

  it("returns null for divide-by-zero and non-finite results", () => {
    expect(evaluateAmount("5 / 0")).toBeNull();
    expect(evaluateAmount("1 / (2 - 2)")).toBeNull();
  });

  it("returns null for malformed numbers and stray characters", () => {
    expect(evaluateAmount(".")).toBeNull();
    expect(evaluateAmount("1.2.3")).toBeNull();
    expect(evaluateAmount("5 g")).toBeNull();
    expect(evaluateAmount("abc")).toBeNull();
  });
});
