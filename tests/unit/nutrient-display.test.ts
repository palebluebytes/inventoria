import { describe, it, expect } from "vitest";
import {
  NUTRIENT_CATALOGUE,
  DEFAULT_VISIBLE_NUTRIENTS,
  selectedNutrients,
  formatNutrientValue,
  formatCalories,
  buildNutrientMeters,
  buildNutrientPills,
  buildNutrientBreakdown,
} from "../../src/lib/food/nutrient-display";
import type { NutritionBreakdown } from "../../src/lib/food/nutrition";

describe("nutrient catalogue", () => {
  it("offers the three macros plus fibre/sugar/sodium/the fats", () => {
    const keys = NUTRIENT_CATALOGUE.map((n) => n.key);
    for (const k of [
      "protein",
      "fat",
      "carbs",
      "fiber_content",
      "sugar_content",
      "sodium_content",
      "saturated_fat_content",
      "trans_fat_content",
      "unsaturated_fat_content",
    ]) {
      expect(keys).toContain(k);
    }
    // Calories are always-on (the ring) and never a selectable option.
    expect(keys).not.toContain("calories");
  });

  it("includes the twelve micronutrients as options", () => {
    const keys = NUTRIENT_CATALOGUE.map((n) => n.key);
    for (const k of [
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
    ]) {
      expect(keys).toContain(k);
    }
  });

  it("defaults to Protein/Fat/Carbs/Fibre", () => {
    expect(DEFAULT_VISIBLE_NUTRIENTS).toEqual([
      "protein",
      "fat",
      "carbs",
      "fiber_content",
    ]);
  });
});

describe("selectedNutrients", () => {
  it("falls back to the default when the selection is absent", () => {
    expect(selectedNutrients(undefined).map((d) => d.key)).toEqual(
      DEFAULT_VISIBLE_NUTRIENTS
    );
  });

  it("honours an explicit empty selection as 'only calories'", () => {
    expect(selectedNutrients([])).toEqual([]);
  });

  it("preserves the user's order and drops unknown keys", () => {
    expect(
      selectedNutrients(["carbs", "not_a_nutrient", "protein"]).map(
        (d) => d.key
      )
    ).toEqual(["carbs", "protein"]);
  });
});

describe("formatNutrientValue", () => {
  it("shows gram-scale nutrients in grams", () => {
    expect(formatNutrientValue(12.345, "g")).toBe("12.35 g");
  });

  it("reformats stored grams to mg and µg", () => {
    expect(formatNutrientValue(0.5, "mg")).toBe("500 mg");
    expect(formatNutrientValue(0.00001, "µg")).toBe("10 µg");
  });

  it("never yields NaN for a missing/garbage value", () => {
    expect(formatNutrientValue(NaN, "g")).toBe("0 g");
  });

  it("formats calories in kcal", () => {
    expect(formatCalories(133.5)).toBe("133.5 kcal");
  });
});

describe("buildNutrientMeters", () => {
  const total: NutritionBreakdown = {
    calories: 500,
    protein: 40,
    fat: 20,
    carbs: 60,
    fiber_content: 8,
  };

  it("gives a targeted macro a fill and formatted target", () => {
    const [protein] = buildNutrientMeters(total, ["protein"], { protein: 130 });
    expect(protein.value).toBe("40 g");
    expect(protein.target).toBe("130 g");
    // 40 / 130 ≈ 30.8%.
    expect(protein.fill).toBeCloseTo((40 / 130) * 100, 5);
  });

  it("clamps an over-target fill to 100%", () => {
    const [protein] = buildNutrientMeters(total, ["protein"], { protein: 20 });
    expect(protein.fill).toBe(100);
  });

  it("renders a no-target nutrient as a bare total (no fill, no target)", () => {
    const [fibre] = buildNutrientMeters(total, ["fiber_content"], {
      protein: 130,
    });
    expect(fibre.label).toBe("Fibre");
    expect(fibre.value).toBe("8 g");
    expect(fibre.fill).toBeUndefined();
    expect(fibre.target).toBeUndefined();
  });

  it("treats a nutrient the day never carried as 0, never NaN", () => {
    const [sugar] = buildNutrientMeters(total, ["sugar_content"], {});
    expect(sugar.value).toBe("0 g");
    expect(sugar.fill).toBeUndefined();
  });

  it("builds the default Protein/Fat/Carbs/Fibre meters when unset", () => {
    expect(buildNutrientMeters(total, undefined).map((m) => m.label)).toEqual([
      "Protein",
      "Fat",
      "Carbs",
      "Fibre",
    ]);
  });
});

describe("buildNutrientPills", () => {
  const scaled: NutritionBreakdown = {
    calories: 134,
    protein: 1.65,
    fat: 0.45,
    carbs: 34.2,
    fiber_content: 3,
  };

  it("always leads with a Calories pill", () => {
    const pills = buildNutrientPills(scaled, ["protein"]);
    expect(pills[0]).toEqual({
      key: "calories",
      label: "Calories",
      value: "134 kcal",
    });
  });

  it("renders exactly the selected nutrients after calories, in order", () => {
    const pills = buildNutrientPills(scaled, ["fiber_content", "protein"]);
    expect(pills.map((p) => p.key)).toEqual([
      "calories",
      "fiber_content",
      "protein",
    ]);
    expect(pills[1].value).toBe("3 g");
  });

  it("defaults to calories + Protein/Fat/Carbs/Fibre when unset", () => {
    expect(buildNutrientPills(scaled, undefined).map((p) => p.key)).toEqual([
      "calories",
      "protein",
      "fat",
      "carbs",
      "fiber_content",
    ]);
  });
});

describe("buildNutrientBreakdown", () => {
  it("leads with calories, then macros, then every carried extra in panel order", () => {
    // A rich panel: the three macros plus fibre, sodium, saturated fat, and two
    // micronutrients (stored in grams). Ordering mirrors NUTRIENT_CATALOGUE.
    const scaled: NutritionBreakdown = {
      calories: 134,
      protein: 1.65,
      fat: 0.45,
      carbs: 34.2,
      fiber_content: 3,
      sodium_content: 0.001, // 1 mg
      saturated_fat_content: 0.15,
      calcium: 0.008, // 8 mg
      iron: 0.0004, // 0.4 mg
    };
    expect(buildNutrientBreakdown(scaled).map((r) => r.key)).toEqual([
      "calories",
      "protein",
      "fat",
      "carbs",
      "fiber_content",
      "sodium_content",
      "saturated_fat_content",
      "calcium",
      "iron",
    ]);
  });

  it("omits extras the food never carried (absent, not 0/blank)", () => {
    const scaled: NutritionBreakdown = {
      calories: 89,
      protein: 1.1,
      fat: 0.3,
      carbs: 22.8,
    };
    const keys = buildNutrientBreakdown(scaled).map((r) => r.key);
    // Only calories + the three macros — no fibre/sugar/sodium/micronutrient row.
    expect(keys).toEqual(["calories", "protein", "fat", "carbs"]);
    for (const absent of [
      "fiber_content",
      "sugar_content",
      "sodium_content",
      "calcium",
      "iron",
      "vitamin_c",
    ]) {
      expect(keys).not.toContain(absent);
    }
  });

  it("formats each row in its display unit — kcal, grams, and mg/µg for micros", () => {
    const scaled: NutritionBreakdown = {
      calories: 89,
      protein: 1.1,
      fat: 0.3,
      carbs: 22.8,
      sodium_content: 0.001, // stored grams
      calcium: 0.005,
      vitamin_d: 0.0000012,
    };
    const byKey = new Map(
      buildNutrientBreakdown(scaled).map((r) => [r.key, r.value])
    );
    expect(byKey.get("calories")).toBe("89 kcal");
    expect(byKey.get("protein")).toBe("1.1 g");
    expect(byKey.get("sodium_content")).toBe("1 mg");
    expect(byKey.get("calcium")).toBe("5 mg");
    expect(byKey.get("vitamin_d")).toBe("1.2 µg");
  });

  it("distinguishes a carried zero from an absent nutrient", () => {
    // A food that measured fibre at 0 g still shows a Fibre row (it was measured);
    // one that never measured it shows none.
    const measured: NutritionBreakdown = {
      calories: 10,
      protein: 0,
      fat: 0,
      carbs: 0,
      fiber_content: 0,
    };
    expect(buildNutrientBreakdown(measured).map((r) => r.key)).toContain(
      "fiber_content"
    );
    const unmeasured: NutritionBreakdown = {
      calories: 10,
      protein: 0,
      fat: 0,
      carbs: 0,
    };
    expect(buildNutrientBreakdown(unmeasured).map((r) => r.key)).not.toContain(
      "fiber_content"
    );
  });
});
