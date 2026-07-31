import { describe, it, expect } from "vitest";
import {
  FDA_DAILY_VALUES_G,
  ACTIVE_ADULT_MACROS_G,
  BAKED_NUTRIENT_TARGETS_G,
  REACH_TOWARD_KEYS,
  PERSONALIZED_TARGET_KEYS,
  defaultNutrientTargets,
  resolveNutrientTargets,
  BAKED_NUTRIENT_LIMITS_G,
  LIMIT_KEYS,
  resolveNutrientLimits,
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

describe("defaultNutrientTargets (baked ⊕ the calculator's frozen set)", () => {
  it("is the plain baked map when no calculated set has been applied", () => {
    expect(defaultNutrientTargets()).toEqual(BAKED_NUTRIENT_TARGETS_G);
    expect(defaultNutrientTargets({})).toEqual(BAKED_NUTRIENT_TARGETS_G);
  });

  it("layers the calculated energy + macros over the baked defaults", () => {
    const defaults = defaultNutrientTargets({
      energy: 2143.75,
      protein: 112,
      fat: 71.5,
      carbs: 240,
    });
    expect(defaults.energy).toBe(2143.75);
    expect(defaults.protein).toBe(112);
    expect(defaults.fat).toBe(71.5);
    expect(defaults.carbs).toBe(240);
  });

  it("leaves fibre and the twelve micros at their baked default", () => {
    // The helper only writes energy + the three macros; everything else keeps its
    // cited reference value even after the calculator has run.
    const defaults = defaultNutrientTargets({ energy: 2600, protein: 150 });
    expect(defaults.fiber_content).toBe(28);
    expect(defaults.calcium).toBe(1.3);
    expect(defaults.iron).toBe(0.018);
  });

  it("ignores a non-personalizable or non-finite calculated key", () => {
    // Defence in depth: only the four PERSONALIZED_TARGET_KEYS are honoured, and a
    // NaN/Infinity value is dropped rather than corrupting a default.
    const defaults = defaultNutrientTargets({
      calcium: 5, // not a personalizable key — ignored
      fiber_content: 40, // not personalizable — ignored
      protein: Number.NaN, // non-finite — dropped, stays baked
    } as Record<string, number>);
    expect(defaults.calcium).toBe(1.3);
    expect(defaults.fiber_content).toBe(28);
    expect(defaults.protein).toBe(125);
  });

  it("does not mutate BAKED_NUTRIENT_TARGETS_G", () => {
    defaultNutrientTargets({ energy: 3000, protein: 200 });
    expect(BAKED_NUTRIENT_TARGETS_G.energy).toBe(2000);
    expect(BAKED_NUTRIENT_TARGETS_G.protein).toBe(125);
  });

  it("feeds resolveNutrientTargets as the baked layer: cleared override → calculated default", () => {
    // The end-to-end reset behaviour (ADR-0033 Amendment): once the calculator has run,
    // an absent override resolves to the computed figure, not the 2000-kcal
    // reference — and a non-positive energy override clamps back to it, not 2000.
    const defaults = defaultNutrientTargets({
      energy: 2400,
      protein: 130,
      fat: 80,
      carbs: 250,
    });
    const resolved = resolveNutrientTargets({}, defaults);
    expect(resolved.energy).toBe(2400);
    expect(resolved.protein).toBe(130);
    expect(resolveNutrientTargets({ energy: 0 }, defaults).energy).toBe(2400);
    // An explicit override still wins over the calculated default.
    expect(resolveNutrientTargets({ protein: 175 }, defaults).protein).toBe(
      175
    );
  });
});

describe("PERSONALIZED_TARGET_KEYS (the calculator's four writable keys)", () => {
  it("is exactly energy + the three macros", () => {
    expect([...PERSONALIZED_TARGET_KEYS].sort()).toEqual(
      ["carbs", "energy", "fat", "protein"].sort()
    );
  });

  it("never includes fibre, a micronutrient, or a limit", () => {
    expect(PERSONALIZED_TARGET_KEYS.has("fiber_content")).toBe(false);
    expect(PERSONALIZED_TARGET_KEYS.has("calcium")).toBe(false);
    expect(PERSONALIZED_TARGET_KEYS.has("sodium_content")).toBe(false);
  });
});

describe("BAKED_NUTRIENT_LIMITS_G (stay-under set, daily-nutrient-limits.md)", () => {
  it("transcribes the four limit caps exactly, in grams", () => {
    expect(BAKED_NUTRIENT_LIMITS_G).toEqual({
      sodium_content: 2.3, // 2300 mg
      saturated_fat_content: 20, // 20 g
      cholesterol_content: 0.3, // 300 mg
      trans_fat_content: 2, // WHO <1% energy ≈ 2.2 g, rounded
    });
  });

  it("carries no energy member — the limit set has no always-on cap", () => {
    expect(BAKED_NUTRIENT_LIMITS_G).not.toHaveProperty("energy");
  });

  it("does not limit total sugar (deferred — no citable total-sugar cap)", () => {
    expect(BAKED_NUTRIENT_LIMITS_G).not.toHaveProperty("sugar_content");
  });

  it("is disjoint from the reach-toward set — a key is a target or a limit", () => {
    for (const key of LIMIT_KEYS) {
      expect(REACH_TOWARD_KEYS.has(key)).toBe(false);
    }
    expect(LIMIT_KEYS.has("sodium_content")).toBe(true);
    expect(LIMIT_KEYS.has("protein")).toBe(false);
    expect(LIMIT_KEYS.size).toBe(4);
  });
});

describe("resolveNutrientLimits (override ?? baked, no energy clamp)", () => {
  it("resolves an absent key to its baked cap", () => {
    const resolved = resolveNutrientLimits({});
    expect(resolved.sodium_content).toBe(2.3);
    expect(resolved.trans_fat_content).toBe(2);
  });

  it("resolves a positive override to the override cap", () => {
    const resolved = resolveNutrientLimits({ sodium_content: 1.5 });
    expect(resolved.sodium_content).toBe(1.5);
    // Untouched limits stay baked.
    expect(resolved.saturated_fat_content).toBe(20);
  });

  it("resolves a 0 opt-out to 0 for every key — no mandatory limit, no clamp", () => {
    // Unlike energy in the reach-toward set, no limit clamps back to its baked
    // default; a 0 stays 0 (bar-less; the nutrient falls to Not tracked).
    const resolved = resolveNutrientLimits({
      sodium_content: 0,
      trans_fat_content: 0,
    });
    expect(resolved.sodium_content).toBe(0);
    expect(resolved.trans_fat_content).toBe(0);
  });

  it("ignores an override for a key absent from the baked limit map", () => {
    const resolved = resolveNutrientLimits({ protein: 100 } as Record<
      string,
      number
    >);
    expect(resolved).not.toHaveProperty("protein");
  });
});
