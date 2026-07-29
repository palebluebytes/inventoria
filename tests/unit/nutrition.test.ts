import { describe, it, expect } from "vitest";
import { roundFood, roundFoodDisplay } from "../../src/lib/food/nutrition";

describe("roundFood", () => {
  it("strips binary-float noise from summed macros", () => {
    // 0.6 + 0.6 -> 1.2000000000000002 in IEEE-754; the UI must show 1.2.
    expect(roundFood(0.6 + 0.6)).toBe(1.2);
    expect(roundFood(0.1 + 0.2)).toBe(0.3);
  });

  it("keeps up to three decimals, rounding a fourth away", () => {
    expect(roundFood(0.125)).toBe(0.125); // a fine-grained amount survives
    expect(roundFood(38.5678)).toBe(38.568);
    expect(roundFood(1.2344)).toBe(1.234);
  });

  it("returns a number, so exact values gain no trailing zeros", () => {
    // Decimals surface only when the value has them: whole → whole, 2 dp → 2 dp.
    expect(roundFood(0.5)).toBe(0.5);
    expect(roundFood(134)).toBe(134);
    expect(String(roundFood(1.2))).toBe("1.2");
    expect(String(roundFood(32.5))).toBe("32.5");
    expect(String(roundFood(400))).toBe("400");
  });
});

describe("roundFoodDisplay", () => {
  it("caps the shown value at two decimals though storage keeps more", () => {
    // A value logged at 3 dp is shown rounded to 2 dp.
    expect(roundFoodDisplay(0.125)).toBe(0.13);
    expect(roundFoodDisplay(21.667)).toBe(21.67);
    expect(roundFoodDisplay(1.895)).toBe(1.9);
  });

  it("still pads no trailing zeros, so whole/1-dp values read clean", () => {
    expect(roundFoodDisplay(32.5)).toBe(32.5);
    expect(String(roundFoodDisplay(400))).toBe("400");
    expect(String(roundFoodDisplay(12.3))).toBe("12.3");
  });
});
