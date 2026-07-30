import { describe, it, expect } from "vitest";
import {
  NUTRIENT_CATALOGUE,
  DEFAULT_VISIBLE_NUTRIENTS,
  selectedNutrients,
  formatNutrientValue,
  nutrientDisplayValue,
  parseNutrientEntry,
  formatCalories,
  buildNutrientMeters,
  buildNutrientPills,
  buildNutrientBreakdown,
  buildDayRdaView,
  nutrientShortLabel,
  ABSENT_NUTRIENT,
} from "../../src/lib/food/nutrient-display";
import type { NutritionBreakdown } from "../../src/lib/food/nutrition";
import {
  REACH_TOWARD_KEYS,
  resolveNutrientTargets,
} from "../../src/lib/food/nutrition-targets";

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

  it("carries a compact short label for every nutrient, none colliding", () => {
    const shorts = NUTRIENT_CATALOGUE.map((n) => n.short);
    // Every catalogue entry has a non-empty short label.
    expect(shorts.every((s) => typeof s === "string" && s.length > 0)).toBe(
      true
    );
    // Shorts are unique, so a tight tally never shows two nutrients the same
    // (Fat "Fat" vs Fibre "Fib" is the canonical near-collision).
    expect(new Set(shorts).size).toBe(shorts.length);
  });
});

describe("nutrientShortLabel", () => {
  it("returns the catalogue short label for a known nutrient", () => {
    expect(nutrientShortLabel("protein")).toBe("Prot");
    expect(nutrientShortLabel("fiber_content")).toBe("Fib");
    expect(nutrientShortLabel("calcium")).toBe("Ca");
  });

  it("returns an empty string for calories and unknown keys", () => {
    // Calories are not in the selectable catalogue; a subtotal shows the value
    // alone rather than a stray code.
    expect(nutrientShortLabel("calories")).toBe("");
    expect(nutrientShortLabel("not_a_nutrient")).toBe("");
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

  it("rounds to whole numbers when decimals=0 (settings/food/round_nutrition)", () => {
    // The whole-number display mode passes 0 places; the exact default keeps 2.
    expect(formatCalories(133.5, 0)).toBe("134 kcal");
    expect(formatNutrientValue(12.345, "g", 0)).toBe("12 g");
    expect(formatNutrientValue(0.5, "mg", 0)).toBe("500 mg");
  });
});

describe("nutrientDisplayValue (numeric half of formatNutrientValue)", () => {
  it("returns the display-unit number without the unit suffix", () => {
    expect(nutrientDisplayValue(12.345, "g")).toBe(12.35);
    expect(nutrientDisplayValue(0.5, "mg")).toBe(500);
    expect(nutrientDisplayValue(0.00001, "µg")).toBe(10);
  });

  it("never yields NaN for a missing/garbage value", () => {
    expect(nutrientDisplayValue(NaN, "g")).toBe(0);
  });

  it("agrees with formatNutrientValue's numeric token", () => {
    // The formatter is exactly this number plus " <unit>", so the two can't drift.
    for (const [grams, unit] of [
      [12.345, "g"],
      [0.5, "mg"],
      [0.42, "mg"],
      [0.00002, "µg"],
    ] as Array<[number, "g" | "mg" | "µg"]>) {
      expect(formatNutrientValue(grams, unit)).toBe(
        `${nutrientDisplayValue(grams, unit)} ${unit}`
      );
    }
  });
});

describe("parseNutrientEntry (inverse of formatNutrientValue)", () => {
  it("converts a display value back to stored grams per unit", () => {
    expect(parseNutrientEntry(12.5, "g")).toBe(12.5);
    expect(parseNutrientEntry(500, "mg")).toBe(0.5);
    expect(parseNutrientEntry(10, "µg")).toBe(0.00001);
  });

  it("passes an energy value through in kcal (no gram conversion)", () => {
    expect(parseNutrientEntry(2000, "kcal")).toBe(2000);
  });

  it("reads a NaN input as 0, never NaN (mirrors formatNutrientValue)", () => {
    expect(parseNutrientEntry(NaN, "mg")).toBe(0);
  });

  it("round-trips with formatNutrientValue across g/mg/µg", () => {
    // format scales grams → display units; parse of that same display number
    // returns the original grams. Exercise a value per unit.
    const cases: Array<[number, "g" | "mg" | "µg"]> = [
      [12.5, "g"],
      [0.5, "mg"],
      [0.42, "mg"],
      [0.00002, "µg"],
    ];
    for (const [grams, unit] of cases) {
      const shown = Number(formatNutrientValue(grams, unit).split(" ")[0]);
      expect(parseNutrientEntry(shown, unit)).toBeCloseTo(grams, 10);
    }
  });

  it("round-trips a kcal energy value with formatCalories", () => {
    const shown = Number(formatCalories(2000).split(" ")[0]);
    expect(parseNutrientEntry(shown, "kcal")).toBe(2000);
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

describe("buildDayRdaView", () => {
  // The baked resolved targets (no overrides) and the reach-toward key set the
  // dashboard passes — energy 2000 kcal, protein 125 g, calcium 1.3 g, etc.
  const baked = resolveNutrientTargets({});

  // A realistic-ish day: macros + fibre, two micros, a genuine reported zero
  // (trans fat) and a limit nutrient (sodium). Vitamin E, magnesium, etc. are
  // absent — never reported. Values are stored grams (kcal for calories).
  const day: NutritionBreakdown = {
    calories: 1650,
    protein: 98,
    fat: 71, // over its 67 g target
    carbs: 180,
    fiber_content: 19,
    calcium: 0.78, // 780 mg vs 1300 mg target
    iron: 0.014, // 14 mg vs 18 mg target
    trans_fat_content: 0, // a reported zero, not absent
    sodium_content: 1.85, // 1850 mg — a limit nutrient, no target
  };

  it("leads Energy & macros with Calories, then the reach-toward macros in order", () => {
    const view = buildDayRdaView(day, baked, REACH_TOWARD_KEYS);
    expect(view.macros.map((r) => r.key)).toEqual([
      "calories",
      "protein",
      "fat",
      "carbs",
      "fiber_content",
    ]);
    const cals = view.macros[0];
    expect(cals.label).toBe("Calories");
    expect(cals.value).toBe("1650 kcal");
    expect(cals.target).toBe("2000 kcal");
  });

  it("puts the twelve micronutrients in Vitamins & minerals, none in macros", () => {
    const view = buildDayRdaView(day, baked, REACH_TOWARD_KEYS);
    expect(view.micros).toHaveLength(12);
    expect(view.micros.map((r) => r.key)).toContain("calcium");
    expect(view.micros.map((r) => r.key)).toContain("vitamin_e");
    // No macro leaks into the micro section and vice versa.
    expect(view.micros.map((r) => r.key)).not.toContain("protein");
    expect(view.macros.map((r) => r.key)).not.toContain("calcium");
  });

  it("renders a carried nutrient as value / target with a fill bar", () => {
    const view = buildDayRdaView(day, baked, REACH_TOWARD_KEYS);
    const calcium = view.micros.find((r) => r.key === "calcium")!;
    expect(calcium.value).toBe("780 mg");
    expect(calcium.target).toBe("1300 mg");
    expect(calcium.absent).toBe(false);
    expect(calcium.over).toBe(false);
    expect(calcium.fill).toBeCloseTo((0.78 / 1.3) * 100, 5);
  });

  it("renders an absent targeted nutrient as — / target, no fill", () => {
    const view = buildDayRdaView(day, baked, REACH_TOWARD_KEYS);
    const vitE = view.micros.find((r) => r.key === "vitamin_e")!;
    expect(vitE.value).toBe(ABSENT_NUTRIENT);
    expect(vitE.target).toBe("15 mg");
    expect(vitE.absent).toBe(true);
    expect(vitE.fill).toBe(0);
    expect(vitE.over).toBe(false);
  });

  it("marks an over-target nutrient (bar full + amber) with over and fill 100", () => {
    const view = buildDayRdaView(day, baked, REACH_TOWARD_KEYS);
    const fat = view.macros.find((r) => r.key === "fat")!;
    expect(fat.over).toBe(true);
    expect(fat.fill).toBe(100);
    expect(fat.value).toBe("71 g");
  });

  it("lists nutrients the day carried with no target under Not tracked, no bar", () => {
    const view = buildDayRdaView(day, baked, REACH_TOWARD_KEYS);
    const keys = view.untracked.map((r) => r.key);
    // A limit nutrient (sodium) and a reported-zero limit nutrient (trans fat).
    expect(keys).toContain("sodium_content");
    expect(keys).toContain("trans_fat_content");
    const sodium = view.untracked.find((r) => r.key === "sodium_content")!;
    expect(sodium.value).toBe("1850 mg");
    // A reported zero stays "0 g" (not absent) since the day measured it.
    const trans = view.untracked.find((r) => r.key === "trans_fat_content")!;
    expect(trans.value).toBe("0 g");
    // Targeted nutrients never appear in Not tracked.
    expect(keys).not.toContain("protein");
    expect(keys).not.toContain("calcium");
  });

  it("moves a 0-opt-out reach-toward nutrient from its bar section to Not tracked", () => {
    // The day carried calcium, but the user opted its target out (0).
    const optOut = resolveNutrientTargets({ calcium: 0 });
    const view = buildDayRdaView(day, optOut, REACH_TOWARD_KEYS);
    expect(view.micros.map((r) => r.key)).not.toContain("calcium");
    expect(view.untracked.map((r) => r.key)).toContain("calcium");
    const calcium = view.untracked.find((r) => r.key === "calcium")!;
    expect(calcium.value).toBe("780 mg"); // plain value, no bar
  });

  it("ranks Biggest gaps: no-data nutrients first, then lowest-fill", () => {
    const view = buildDayRdaView(day, baked, REACH_TOWARD_KEYS);
    // No-data targeted nutrients (percent null) lead the strip.
    const noDataGaps = view.gaps.filter((g) => g.percent === null);
    expect(noDataGaps.length).toBeGreaterThan(0);
    expect(noDataGaps.map((g) => g.key)).toContain("vitamin_e");
    expect(
      view.gaps.slice(0, noDataGaps.length).every((g) => g.percent === null)
    ).toBe(true);
    // The present gaps that follow are the only percentages in the modal and are
    // sorted furthest-below-target first (ascending fill).
    const present = view.gaps.filter((g) => g.percent !== null);
    expect(present.length).toBeGreaterThan(0);
    expect(present.length).toBeLessThanOrEqual(3);
    const pcts = present.map((g) => g.percent as number);
    expect([...pcts]).toEqual([...pcts].sort((a, b) => a - b));
    // An over-target nutrient (fat) is never a gap.
    expect(view.gaps.map((g) => g.key)).not.toContain("fat");
  });

  it("reads a present-but-zero nutrient as 'no data', never 0%", () => {
    // Protein reported at 0 g — present (≠ absent, still a "0 g / 125 g" card) but
    // 0% of target. In the gaps strip it must read "no data", not "0%".
    const zeroDay: NutritionBreakdown = {
      calories: 1650,
      protein: 0,
      fat: 71,
      carbs: 180,
      fiber_content: 19,
    };
    const view = buildDayRdaView(zeroDay, baked, REACH_TOWARD_KEYS);
    // Its macro card still shows the honest reported zero, not the absent marker.
    const proteinRow = view.macros.find((r) => r.key === "protein")!;
    expect(proteinRow.value).toBe("0 g");
    expect(proteinRow.absent).toBe(false);
    // Its gap chip is "no data" (percent null) and groups with the other no-data
    // entries at the front, ahead of any percentage.
    const proteinGap = view.gaps.find((g) => g.key === "protein")!;
    expect(proteinGap.percent).toBeNull();
    const firstPresent = view.gaps.findIndex((g) => g.percent !== null);
    const proteinIdx = view.gaps.findIndex((g) => g.key === "protein");
    expect(proteinIdx).toBeLessThan(
      firstPresent === -1 ? view.gaps.length : firstPresent
    );
    // No gap chip ever reads 0%.
    expect(view.gaps.every((g) => g.percent !== 0)).toBe(true);
  });

  it("threads display precision to every section (decimals=0)", () => {
    const view = buildDayRdaView(day, baked, REACH_TOWARD_KEYS, 0);
    const iron = view.micros.find((r) => r.key === "iron")!;
    expect(iron.value).toBe("14 mg");
    expect(iron.target).toBe("18 mg");
  });

  it("is independent of visible_nutrients — always the full reach-toward set", () => {
    // No selection is passed in; every reach-toward nutrient with a target shows,
    // whether or not the user pinned it as a meter.
    const view = buildDayRdaView(day, baked, REACH_TOWARD_KEYS);
    expect(view.macros).toHaveLength(5); // calories + 4 macros
    expect(view.micros).toHaveLength(12);
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

  it("keeps a selected-but-absent nutrient's pill, marked absent not 0 g", () => {
    // `scaled` carries no sodium; a food that never measured it must not read
    // "0 mg" (absent ≠ 0, #21/#30) — the pill stays put (#29) but shows "—".
    const pills = buildNutrientPills(scaled, ["sodium_content", "protein"]);
    expect(pills.map((p) => p.key)).toEqual([
      "calories",
      "sodium_content",
      "protein",
    ]);
    expect(pills[1].value).toBe(ABSENT_NUTRIENT);
    expect(pills[2].value).toBe("1.65 g");
  });

  it("distinguishes a carried zero from an absent nutrient", () => {
    // A food that measured sodium at 0 shows a genuine "0 mg", not the marker.
    const withZero: NutritionBreakdown = { ...scaled, sodium_content: 0 };
    const pills = buildNutrientPills(withZero, ["sodium_content"]);
    expect(pills[1].value).toBe("0 mg");
  });

  it("threads the display precision to every pill (decimals=0)", () => {
    const pills = buildNutrientPills(scaled, ["protein", "fiber_content"], 0);
    expect(pills.map((p) => p.value)).toEqual(["134 kcal", "2 g", "3 g"]);
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
