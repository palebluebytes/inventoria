import { describe, it, expect } from "vitest";
import {
  roundFood,
  roundFoodDisplay,
  formatPortionLabel,
  resolvePortionGrams,
  type Portion,
} from "../../src/lib/food/nutrition";

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

// ---- household portions (ADR-0030 §2) --------------------------------------

describe("formatPortionLabel", () => {
  it("joins amount and unit into a display label", () => {
    expect(formatPortionLabel(1, "medium")).toBe("1 medium");
    expect(formatPortionLabel(1, "cup, sliced")).toBe("1 cup, sliced");
    expect(formatPortionLabel(2, "tbsp")).toBe("2 tbsp");
  });

  it("collapses stray whitespace so a padded unit reads clean", () => {
    expect(formatPortionLabel(1, "  medium ")).toBe("1 medium");
  });
});

describe("resolvePortionGrams", () => {
  const portions: Portion[] = [
    { label: "1 medium", amount: 1, unit: "medium", grams: 118 },
    { label: "1 cup, sliced", amount: 1, unit: "cup, sliced", grams: 150 },
  ];

  it("returns the gram weight of the chosen portion", () => {
    expect(resolvePortionGrams(portions, "1 medium")).toBe(118);
    expect(resolvePortionGrams(portions, "1 cup, sliced")).toBe(150);
  });

  it("scales by the quantity of that portion", () => {
    // Two "1 medium" bananas resolve to 236 g; three cups to 450 g.
    expect(resolvePortionGrams(portions, "1 medium", 2)).toBe(236);
    expect(resolvePortionGrams(portions, "1 cup, sliced", 3)).toBe(450);
  });

  it("rounds a fractional-quantity result to the stored food precision", () => {
    // 0.5 × 118 = 59; a non-integer that would carry float noise is trimmed.
    expect(resolvePortionGrams(portions, "1 medium", 0.5)).toBe(59);
    expect(
      resolvePortionGrams([{ ...portions[0], grams: 0.1 }], "1 medium", 3)
    ).toBe(0.3);
  });

  it("returns undefined when the chosen label is not in the list", () => {
    expect(resolvePortionGrams(portions, "1 large")).toBeUndefined();
  });

  it("returns undefined for an empty or missing portion list", () => {
    expect(resolvePortionGrams([], "1 medium")).toBeUndefined();
    expect(resolvePortionGrams(undefined, "1 medium")).toBeUndefined();
  });

  it("returns undefined when the matched portion's grams are malformed", () => {
    const malformed: Portion[] = [
      { label: "bad", amount: 1, unit: "x", grams: NaN },
      {
        label: "missing",
        amount: 1,
        unit: "x",
        grams: undefined as unknown as number,
      },
    ];
    expect(resolvePortionGrams(malformed, "bad")).toBeUndefined();
    expect(resolvePortionGrams(malformed, "missing")).toBeUndefined();
  });

  it("returns undefined for a non-finite quantity", () => {
    expect(resolvePortionGrams(portions, "1 medium", NaN)).toBeUndefined();
    expect(resolvePortionGrams(portions, "1 medium", Infinity)).toBeUndefined();
  });
});
