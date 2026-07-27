import { describe, it, expect } from "vitest";
import { round2 } from "../../src/lib/food/nutrition";

describe("round2", () => {
  it("strips binary-float noise from summed macros", () => {
    // 0.6 + 0.6 -> 1.2000000000000002 in IEEE-754; the UI must show 1.2.
    expect(round2(0.6 + 0.6)).toBe(1.2);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });

  it("rounds to at most two decimals", () => {
    expect(round2(38.567)).toBe(38.57);
    expect(round2(1.234)).toBe(1.23);
  });

  it("returns a number, so exact values gain no trailing zeros", () => {
    expect(round2(0.5)).toBe(0.5);
    expect(round2(134)).toBe(134);
    expect(String(round2(1.2))).toBe("1.2");
  });
});
