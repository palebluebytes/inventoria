import { describe, it, expect } from "vitest";
import {
  FDA_DAILY_VALUES_G,
  ACTIVE_ADULT_MACROS_G,
  BAKED_NUTRIENT_TARGETS_G,
  REACH_TOWARD_KEYS,
  resolveNutrientTargets,
} from "../../src/lib/food/nutrition-targets";

// The reach-toward set: energy + the three macros + fibre + the twelve label
// micronutrients. Exactly these seventeen keys, no limit nutrients.
const REACH_TOWARD = [
  "energy",
  "protein",
  "fat",
  "carbs",
  "fiber_content",
  "vitamin_d",
  "calcium",
  "iron",
  "potassium",
  "vitamin_a",
  "vitamin_c",
  "vitamin_e",
  "vitamin_b6",
  "vitamin_b12",
  "folate",
  "magnesium",
  "zinc",
];

describe("baked reference maps (transcription of the primary-source docs)", () => {
  it("transcribes the FDA Daily Values (fda-daily-values.md) exactly", () => {
    expect(FDA_DAILY_VALUES_G).toEqual({
      energy: 2000,
      protein: 50,
      fat: 78,
      carbs: 275,
      fiber_content: 28,
      vitamin_d: 0.00002,
      calcium: 1.3,
      iron: 0.018,
      potassium: 4.7,
      vitamin_a: 0.0009,
      vitamin_c: 0.09,
      vitamin_e: 0.015,
      vitamin_b6: 0.0017,
      vitamin_b12: 0.0000024,
      folate: 0.0004,
      magnesium: 0.42,
      zinc: 0.011,
    });
  });

  it("transcribes the active-adult macros (active-adult-macros.md) exactly", () => {
    expect(ACTIVE_ADULT_MACROS_G).toEqual({
      energy: 2000,
      protein: 125,
      fat: 67,
      carbs: 225,
      fiber_content: 28,
    });
  });
});

describe("BAKED_NUTRIENT_TARGETS_G (FDA micros ⊕ active-adult macros)", () => {
  it("carries exactly the seventeen reach-toward keys — no limit nutrients", () => {
    expect(Object.keys(BAKED_NUTRIENT_TARGETS_G).sort()).toEqual(
      [...REACH_TOWARD].sort()
    );
    // Limit nutrients (sodium, saturated/trans fat, cholesterol, sugar) are
    // absent by construction, so they can never gain a fill bar.
    for (const limit of [
      "sodium_content",
      "saturated_fat_content",
      "trans_fat_content",
      "cholesterol_content",
      "sugar_content",
    ]) {
      expect(BAKED_NUTRIENT_TARGETS_G).not.toHaveProperty(limit);
    }
  });

  it("takes the active-adult macros, not the FDA reference-diet macros", () => {
    expect(BAKED_NUTRIENT_TARGETS_G.protein).toBe(125);
    expect(BAKED_NUTRIENT_TARGETS_G.fat).toBe(67);
    expect(BAKED_NUTRIENT_TARGETS_G.carbs).toBe(225);
    // Energy (2000 kcal) and fibre (28 g) coincide between the two bases.
    expect(BAKED_NUTRIENT_TARGETS_G.energy).toBe(2000);
    expect(BAKED_NUTRIENT_TARGETS_G.fiber_content).toBe(28);
  });

  it("takes the twelve micronutrients from the FDA Daily Values", () => {
    expect(BAKED_NUTRIENT_TARGETS_G.calcium).toBe(1.3);
    expect(BAKED_NUTRIENT_TARGETS_G.iron).toBe(0.018);
    expect(BAKED_NUTRIENT_TARGETS_G.vitamin_d).toBe(0.00002);
    expect(BAKED_NUTRIENT_TARGETS_G.vitamin_b12).toBe(0.0000024);
  });

  it("exposes the reach-toward key set for override filtering", () => {
    expect(REACH_TOWARD_KEYS.has("calcium")).toBe(true);
    expect(REACH_TOWARD_KEYS.has("energy")).toBe(true);
    expect(REACH_TOWARD_KEYS.has("sodium_content")).toBe(false);
    expect(REACH_TOWARD_KEYS.size).toBe(17);
  });
});

describe("resolveNutrientTargets (override ?? baked, per key)", () => {
  it("resolves an absent key to its baked default", () => {
    const resolved = resolveNutrientTargets({});
    expect(resolved.protein).toBe(125);
    expect(resolved.calcium).toBe(1.3);
    expect(resolved.energy).toBe(2000);
  });

  it("resolves a positive override to the override value", () => {
    const resolved = resolveNutrientTargets({ protein: 160, calcium: 1.5 });
    expect(resolved.protein).toBe(160);
    expect(resolved.calcium).toBe(1.5);
    // Untouched keys stay baked.
    expect(resolved.fat).toBe(67);
  });

  it("resolves a 0 opt-out to a non-positive target (no bar renders)", () => {
    const resolved = resolveNutrientTargets({ calcium: 0, iron: 0 });
    expect(resolved.calcium).toBe(0);
    expect(resolved.iron).toBe(0);
    // A non-positive target draws no fill bar in buildNutrientMeters.
    expect(resolved.calcium > 0).toBe(false);
  });

  it("clamps a 0 energy override back to the baked 2000 kcal (ring always on)", () => {
    expect(resolveNutrientTargets({ energy: 0 }).energy).toBe(2000);
  });

  it("clamps a negative energy override back to the baked 2000 kcal", () => {
    expect(resolveNutrientTargets({ energy: -500 }).energy).toBe(2000);
  });

  it("honours a positive energy override", () => {
    expect(resolveNutrientTargets({ energy: 2500 }).energy).toBe(2500);
  });

  it("ignores an override for a key absent from the baked map", () => {
    // The resolver only walks baked keys, so a stray key never leaks through.
    const resolved = resolveNutrientTargets({ sodium_content: 100 } as Record<
      string,
      number
    >);
    expect(resolved).not.toHaveProperty("sodium_content");
  });
});
