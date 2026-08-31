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
  macroNutrients,
  buildNutrientBreakdown,
  buildDayRdaView,
  buildMealRdaView,
  nutrientShortLabel,
  ABSENT_NUTRIENT,
} from "../../src/lib/food/nutrient-display";
import type { NutritionBreakdown } from "../../src/lib/food/nutrition";
import {
  resolveNutrientTargets,
  resolveNutrientLimits,
} from "../../src/lib/food/nutrition-targets";

describe("nutrient catalogue", () => {
  it("offers the three macros plus fibre/sodium/the fats", () => {
    const keys = NUTRIENT_CATALOGUE.map((n) => n.key);
    for (const k of [
      "protein",
      "fat",
      "carbs",
      "fiber_content",
      "sodium_content",
      "saturated_fat_content",
      "trans_fat_content",
      "unsaturated_fat_content",
    ]) {
      expect(keys).toContain(k);
    }
    // Calories are always-on (the ring) and never a selectable option.
    expect(keys).not.toContain("calories");
    // Total sugar is a captured field but withheld from display (ADR-0032): the
    // only citable cap is the added-sugars DV, a quantity the panel doesn't carry.
    expect(keys).not.toContain("sugar_content");
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

  it("rounds CALORIES to whole numbers when decimals=0 (settings/food/round_nutrition)", () => {
    // The whole-number display mode passes 0 places; the exact default keeps 2.
    expect(formatCalories(133.5, 0)).toBe("134 kcal");
  });

  it("fixes a nutrient's precision — the round setting can't reach it", () => {
    // formatNutrientValue takes no precision argument at all, so a gram figure
    // reads the same whichever way the whole-number toggle is set.
    expect(formatNutrientValue(12.345, "g")).toBe("12.35 g");
    expect(formatNutrientValue(0.6, "g")).toBe("0.6 g");
    expect(formatNutrientValue(0.0005, "mg")).toBe("0.5 mg");
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

  it("leads with calories, and puts that bar away on request", () => {
    // Calories used to be prepended unconditionally, so somebody tracking
    // protein alone had a calorie bar they could not remove. `showCalories` is a
    // separate argument rather than a `calories` entry in the selection: every
    // selection already stored predates the choice, and reading membership would
    // have read all of them as "off".
    const shown = buildNutrientMeters(total, ["protein"], {}, 2, true);
    expect(shown.map((m) => m.key)).toEqual(["calories", "protein"]);
    const hidden = buildNutrientMeters(total, ["protein"], {}, 2, false);
    expect(hidden.map((m) => m.key)).toEqual(["protein"]);
    // Defaulting to shown is what keeps every existing caller unchanged.
    expect(buildNutrientMeters(total, ["protein"]).map((m) => m.key)).toEqual([
      "calories",
      "protein",
    ]);
    // Hiding the bar hides only the bar — the day's other meters are untouched,
    // and a selection naming nothing leaves an empty list rather than a stray.
    expect(buildNutrientMeters(total, [], {}, 2, false)).toEqual([]);
    // A stray "calories" in the selection cannot produce the bar twice: there is
    // no such entry in the catalogue, so `selectedNutrients` drops it.
    expect(
      buildNutrientMeters(total, ["calories", "protein"], {}, 2, true).map(
        (m) => m.key
      )
    ).toEqual(["calories", "protein"]);
  });

  it("gives a targeted macro a fill and formatted target", () => {
    const [, protein] = buildNutrientMeters(total, ["protein"], {
      protein: 130,
    });
    expect(protein.value).toBe("40 g");
    expect(protein.target).toBe("130 g");
    // 40 / 130 ≈ 30.8%.
    expect(protein.fill).toBeCloseTo((40 / 130) * 100, 5);
  });

  it("clamps an over-target fill to 100%", () => {
    const [, protein] = buildNutrientMeters(total, ["protein"], {
      protein: 20,
    });
    expect(protein.fill).toBe(100);
  });

  it("renders a no-target nutrient as a bare total (no fill, no target)", () => {
    const [, fibre] = buildNutrientMeters(total, ["fiber_content"], {
      protein: 130,
    });
    expect(fibre.label).toBe("Fibre");
    expect(fibre.value).toBe("8 g");
    expect(fibre.fill).toBeUndefined();
    expect(fibre.target).toBeUndefined();
  });

  it("treats a nutrient the day never carried as 0, never NaN", () => {
    const [, unsat] = buildNutrientMeters(
      total,
      ["unsaturated_fat_content"],
      {}
    );
    expect(unsat.value).toBe("0 g");
    expect(unsat.fill).toBeUndefined();
  });

  it("builds the default Protein/Fat/Carbs/Fibre meters when unset", () => {
    expect(buildNutrientMeters(total, undefined).map((m) => m.label)).toEqual([
      "Calories",
      "Protein",
      "Fat",
      "Carbs",
      "Fibre",
    ]);
  });

  // Calories are a bar like the rest: same shape, same fill rule, filling toward
  // the resolved `energy` target rather than a gram one.
  it("leads with a Calories meter filling toward the energy target", () => {
    const [calories] = buildNutrientMeters(total, [], { energy: 2000 });
    expect(calories.key).toBe("calories");
    expect(calories.label).toBe("Calories");
    expect(calories.value).toBe("500 kcal");
    expect(calories.target).toBe("2000 kcal");
    expect(calories.fill).toBeCloseTo(25, 5);
  });

  it("clamps an over-target calorie fill to 100%", () => {
    const [calories] = buildNutrientMeters(total, [], { energy: 400 });
    expect(calories.fill).toBe(100);
  });

  it("renders calories bar-less when no energy target is configured", () => {
    const [calories] = buildNutrientMeters(total, []);
    expect(calories.value).toBe("500 kcal");
    expect(calories.fill).toBeUndefined();
    expect(calories.target).toBeUndefined();
  });

  // The whole-number display setting reaches the calorie meter alone — the same
  // rule the pills and the breakdown follow.
  it("honours the whole-number calorie setting on the calorie meter only", () => {
    const fractional: NutritionBreakdown = { ...total, calories: 133.5 };
    const [calories, protein] = buildNutrientMeters(
      fractional,
      ["protein"],
      { energy: 2000, protein: 130 },
      0
    );
    expect(calories.value).toBe("134 kcal");
    expect(protein.value).toBe("40 g");
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
    const view = buildDayRdaView(day, baked);
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
    const view = buildDayRdaView(day, baked);
    expect(view.micros).toHaveLength(12);
    expect(view.micros.map((r) => r.key)).toContain("calcium");
    expect(view.micros.map((r) => r.key)).toContain("vitamin_e");
    // No macro leaks into the micro section and vice versa.
    expect(view.micros.map((r) => r.key)).not.toContain("protein");
    expect(view.macros.map((r) => r.key)).not.toContain("calcium");
  });

  it("renders a carried nutrient as value / target with a fill bar", () => {
    const view = buildDayRdaView(day, baked);
    const calcium = view.micros.find((r) => r.key === "calcium")!;
    expect(calcium.value).toBe("780 mg");
    expect(calcium.target).toBe("1300 mg");
    expect(calcium.absent).toBe(false);
    expect(calcium.over).toBe(false);
    expect(calcium.fill).toBeCloseTo((0.78 / 1.3) * 100, 5);
  });

  it("renders an absent targeted nutrient as — / target, no fill", () => {
    const view = buildDayRdaView(day, baked);
    const vitE = view.micros.find((r) => r.key === "vitamin_e")!;
    expect(vitE.value).toBe(ABSENT_NUTRIENT);
    expect(vitE.target).toBe("15 mg");
    expect(vitE.absent).toBe(true);
    expect(vitE.fill).toBe(0);
    expect(vitE.over).toBe(false);
  });

  it("marks an over-target nutrient (bar full + amber) with over and fill 100", () => {
    const view = buildDayRdaView(day, baked);
    const fat = view.macros.find((r) => r.key === "fat")!;
    expect(fat.over).toBe(true);
    expect(fat.fill).toBe(100);
    expect(fat.value).toBe("71 g");
  });

  it("lists nutrients the day carried with no target under Not tracked, no bar", () => {
    const view = buildDayRdaView(day, baked);
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
    const view = buildDayRdaView(day, optOut);
    expect(view.micros.map((r) => r.key)).not.toContain("calcium");
    expect(view.untracked.map((r) => r.key)).toContain("calcium");
    const calcium = view.untracked.find((r) => r.key === "calcium")!;
    expect(calcium.value).toBe("780 mg"); // plain value, no bar
  });

  it("ranks Biggest gaps: no-data nutrients first, then lowest-fill", () => {
    const view = buildDayRdaView(day, baked);
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

  it("ranks only the tracked nutrients (+ always Calories) when given a selection", () => {
    // The user tracks protein only. The gaps strip is their "what to eat next",
    // so it ranks protein + Calories — not the full reference set the sections show.
    const view = buildDayRdaView(day, baked, {
      gapLimit: 3,
      selection: ["protein"],
    });
    const keys = view.gaps.map((g) => g.key);
    expect(keys).toContain("protein");
    // Calories is always ranked (the always-on ring), even though it's not a
    // selectable meter.
    expect(keys).toContain("calories");
    // Nothing the user hasn't tracked appears — no micros, no other macros.
    expect(keys).not.toContain("calcium");
    expect(keys).not.toContain("vitamin_e");
    expect(keys).not.toContain("carbs");
    expect(keys).not.toContain("fiber_content");
    // The card sections stay the full reference set regardless of the selection.
    expect(view.macros).toHaveLength(5);
    expect(view.micros).toHaveLength(12);
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
    const view = buildDayRdaView(zeroDay, baked);
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

  it("threads the calorie precision to the calories row only (calorieDecimals=0)", () => {
    const view = buildDayRdaView(day, baked, { calorieDecimals: 0 });
    const calories = view.macros.find((r) => r.key === "calories")!;
    expect(calories.value).toBe(formatCalories(day.calories, 0));
    // A micronutrient keeps its own fixed precision either way.
    const iron = view.micros.find((r) => r.key === "iron")!;
    expect(iron.value).toBe(formatNutrientValue(day.iron!, "mg"));
    expect(iron.target).toBe(formatNutrientValue(baked.iron!, "mg"));
  });

  it("is independent of visible_nutrients — always the full reach-toward set", () => {
    // No selection is passed in; every reach-toward nutrient with a target shows,
    // whether or not the user pinned it as a meter.
    const view = buildDayRdaView(day, baked);
    expect(view.macros).toHaveLength(5); // calories + 4 macros
    expect(view.micros).toHaveLength(12);
  });

  it("leaves limit nutrients in Not tracked when no limits map is passed", () => {
    // Backward-compatible default: with limits={} nothing gains a cap, so the
    // limit nutrients the day carried still fall to Not tracked (pre-#43 behaviour).
    const view = buildDayRdaView(day, baked);
    expect(view.limits).toEqual([]);
    expect(view.untracked.map((r) => r.key)).toContain("sodium_content");
  });
});

describe("buildDayRdaView — Limits section (ADR-0032, #43)", () => {
  const baked = resolveNutrientTargets({});
  const bakedLimits = resolveNutrientLimits({});

  // A day carrying three of the four limit nutrients: sodium under its cap,
  // saturated fat over it, trans fat a reported zero; cholesterol absent.
  const day: NutritionBreakdown = {
    calories: 1650,
    protein: 98,
    fat: 71,
    carbs: 180,
    fiber_content: 19,
    sodium_content: 1.85, // 1850 mg — under the 2300 mg cap
    saturated_fat_content: 25, // 25 g — OVER the 20 g cap
    trans_fat_content: 0, // reported zero — under the 2 g cap
    // cholesterol_content absent — never reported
  };

  // Only the resolved limits map is threaded in; decimals/gapLimit/selection
  // fall back to their defaults.
  const rda = (limits = bakedLimits) => buildDayRdaView(day, baked, { limits });

  it("carries the present limits toward their caps, omitting absent ones", () => {
    const keys = rda().limits.map((r) => r.key);
    expect(keys).toContain("sodium_content");
    expect(keys).toContain("saturated_fat_content");
    expect(keys).toContain("trans_fat_content");
    // Cholesterol was never carried — a "bad" nutrient at zero stays quiet.
    expect(keys).not.toContain("cholesterol_content");
  });

  it("renders a present limit under its cap as value / cap, a bar, not over", () => {
    const sodium = rda().limits.find((r) => r.key === "sodium_content")!;
    expect(sodium.value).toBe("1850 mg");
    expect(sodium.target).toBe("2300 mg");
    expect(sodium.absent).toBe(false);
    expect(sodium.over).toBe(false);
    expect(sodium.fill).toBeCloseTo((1.85 / 2.3) * 100, 5);
  });

  it("marks a limit over its cap with over + amber (bar full)", () => {
    const sat = rda().limits.find((r) => r.key === "saturated_fat_content")!;
    expect(sat.value).toBe("25 g");
    expect(sat.target).toBe("20 g");
    expect(sat.over).toBe(true);
    expect(sat.fill).toBe(100);
  });

  it("omits an absent limit entirely — never shown as — / cap (story 5)", () => {
    const view = rda();
    expect(view.limits.map((r) => r.key)).not.toContain("cholesterol_content");
    // And it isn't dumped into Not tracked either — absent means omitted.
    expect(view.untracked.map((r) => r.key)).not.toContain(
      "cholesterol_content"
    );
  });

  it("moves carried limits out of Not tracked once a cap resolves", () => {
    const keys = rda().untracked.map((r) => r.key);
    expect(keys).not.toContain("sodium_content");
    expect(keys).not.toContain("saturated_fat_content");
    expect(keys).not.toContain("trans_fat_content");
  });

  it("drops a 0-opt-out limit to Not tracked, not the Limits section", () => {
    const optOut = resolveNutrientLimits({ sodium_content: 0 });
    const view = rda(optOut);
    expect(view.limits.map((r) => r.key)).not.toContain("sodium_content");
    const sodium = view.untracked.find((r) => r.key === "sodium_content")!;
    expect(sodium.value).toBe("1850 mg"); // plain value, no bar
  });

  it("keeps limits out of the Biggest gaps strip (overage is not a shortfall)", () => {
    const keys = rda().gaps.map((g) => g.key);
    expect(keys).not.toContain("sodium_content");
    expect(keys).not.toContain("saturated_fat_content");
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

  it("threads the calorie precision to the calories pill only (calorieDecimals=0)", () => {
    const pills = buildNutrientPills(scaled, ["protein", "fiber_content"], 0);
    expect(pills[0].value).toBe("134 kcal");
    expect(pills.slice(1).map((p) => p.value)).toEqual([
      formatNutrientValue(scaled.protein, "g"),
      formatNutrientValue(scaled.fiber_content!, "g"),
    ]);
  });

  it("hideEmpty drops a selected-but-absent nutrient's pill entirely", () => {
    // A single food's preview: `scaled` carries no sodium, so with hideEmpty the
    // sodium pill is gone (not a "–"), while present nutrients still show.
    const pills = buildNutrientPills(
      scaled,
      ["sodium_content", "protein"],
      undefined,
      true
    );
    expect(pills.map((p) => p.key)).toEqual(["calories", "protein"]);
    expect(pills.find((p) => p.key === "sodium_content")).toBeUndefined();
  });

  it("hideEmpty also drops a carried zero (0 g fat shows no pill)", () => {
    const withZero: NutritionBreakdown = { ...scaled, fat: 0 };
    const pills = buildNutrientPills(
      withZero,
      ["fat", "protein"],
      undefined,
      true
    );
    expect(pills.map((p) => p.key)).toEqual(["calories", "protein"]);
    expect(pills.find((p) => p.key === "fat")).toBeUndefined();
  });

  it("hideEmpty keeps a sub-milligram micronutrient that displays non-zero", () => {
    // iron 0.00026 g reads as "0.26 mg" — a real value in its own unit, so it
    // must NOT be dropped as a "zero" just because it rounds to 0 g.
    const withIron: NutritionBreakdown = { ...scaled, iron: 0.00026 };
    const pills = buildNutrientPills(withIron, ["iron"], undefined, true);
    expect(pills.map((p) => p.key)).toEqual(["calories", "iron"]);
    expect(pills[1].value).toBe("0.26 mg");
  });
});

describe("macroNutrients", () => {
  it("drops micronutrients, keeping only the tracked macros in order", () => {
    // A full selection — macros interleaved with micros the RDA surface shows.
    expect(
      macroNutrients([
        "protein",
        "magnesium",
        "carbs",
        "folate",
        "fiber_content",
        "vitamin_c",
      ])
    ).toEqual(["protein", "carbs", "fiber_content"]);
  });

  it("falls back to the default macros when the selection is unset", () => {
    expect(macroNutrients(undefined)).toEqual([
      "protein",
      "fat",
      "carbs",
      "fiber_content",
    ]);
  });

  it("honours an explicit empty selection as no macros", () => {
    expect(macroNutrients([])).toEqual([]);
  });

  it("returns nothing when the user tracks only micronutrients", () => {
    expect(macroNutrients(["magnesium", "folate"])).toEqual([]);
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

  it("hideEmpty drops missing AND zero rows, keeping calories + carried values", () => {
    // The "Aceite" case: an oil reporting 0 for protein/carbs/fibre/sodium/sat-fat.
    const scaled: NutritionBreakdown = {
      calories: 9,
      protein: 0,
      fat: 0.6,
      carbs: 0,
      fiber_content: 0,
      sodium_content: 0,
      saturated_fat_content: 0,
      iron: 0.00026, // 0.26 mg — a real value in its unit, must survive
    };
    const rows = buildNutrientBreakdown(scaled, undefined, true);
    expect(rows.map((r) => r.key)).toEqual(["calories", "fat", "iron"]);
    expect(rows.find((r) => r.key === "fat")!.value).toBe("0.6 g");
    expect(rows.find((r) => r.key === "iron")!.value).toBe("0.26 mg");
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

  it("excludes the given keys (the macro grid's) so full nutrition lists only extras", () => {
    // The staged card shows Calories + Protein/Fat/Carbs/Fibre in the grid, then
    // this disclosure — passing the grid's keys leaves only the extras (sodium,
    // sat fat, the micronutrients), never repeating a grid row. Calories itself
    // drops when excluded.
    const scaled: NutritionBreakdown = {
      calories: 134,
      protein: 1.65,
      fat: 0.45,
      carbs: 34.2,
      fiber_content: 3,
      sodium_content: 0.001,
      saturated_fat_content: 0.15,
      calcium: 0.008,
    };
    const gridKeys = new Set([
      "calories",
      "protein",
      "fat",
      "carbs",
      "fiber_content",
    ]);
    expect(
      buildNutrientBreakdown(scaled, undefined, true, gridKeys).map(
        (r) => r.key
      )
    ).toEqual(["sodium_content", "saturated_fat_content", "calcium"]);
  });

  it("with no exclusion still leads with calories and lists every carried nutrient", () => {
    // The default (empty exclusion) path is unchanged — a caller wanting the full
    // list gets calories + every extra, exactly as before.
    const scaled: NutritionBreakdown = {
      calories: 89,
      protein: 1.1,
      fat: 0.3,
      carbs: 22.8,
      calcium: 0.005,
    };
    expect(buildNutrientBreakdown(scaled).map((r) => r.key)).toEqual([
      "calories",
      "protein",
      "fat",
      "carbs",
      "calcium",
    ]);
  });
});

describe("buildMealRdaView", () => {
  const baked = resolveNutrientTargets({});

  // One meal rather than a day: three macros, one micro it carries, one micro
  // it measured as a genuine zero, and a limit nutrient. Everything else was
  // never reported.
  const meal: NutritionBreakdown = {
    calories: 412,
    protein: 21,
    fat: 14,
    carbs: 48,
    calcium: 0.31,
    vitamin_d: 0, // measured, and zero
    sodium_content: 0.62, // a limit nutrient, no target
    unsaturated_fat_content: 5, // no target and no limit: the day's Not tracked
  };

  it("carries only the nutrients the meal has, in the day panel's order", () => {
    const view = buildMealRdaView(meal, baked);
    expect(view.macros.map((r) => r.key)).toEqual([
      "calories",
      "protein",
      "fat",
      "carbs",
    ]);
    expect(view.micros.map((r) => r.key)).toEqual(["calcium"]);
  });

  it("drops a nutrient the meal never carried, rather than printing it as —", () => {
    const day = buildDayRdaView(meal, baked);
    expect(day.micros.map((r) => r.key)).toContain("vitamin_e");
    expect(day.micros.find((r) => r.key === "vitamin_e")!.value).toBe(
      ABSENT_NUTRIENT
    );
    // Forty cards reading "—" say only that most foods are not most nutrients.
    expect(
      buildMealRdaView(meal, baked).micros.map((r) => r.key)
    ).not.toContain("vitamin_e");
  });

  it("drops a nutrient measured at zero too, for the same reason", () => {
    expect(
      buildMealRdaView(meal, baked).micros.map((r) => r.key)
    ).not.toContain("vitamin_d");
  });

  it("drops a nutrient that rounds to zero in its own display unit", () => {
    // 0.004 µg of vitamin D reads "0 µg", which is a card that says nothing.
    const trace: NutritionBreakdown = { ...meal, vitamin_d: 0.000000004 };
    const view = buildMealRdaView(trace, baked);
    expect(view.micros.map((r) => r.key)).not.toContain("vitamin_d");
    // A carried micronutrient at a genuinely readable amount stays.
    expect(view.micros.map((r) => r.key)).toContain("calcium");
  });

  it("keeps a fibre-free meal's fibre card out, but a fibre-carrying meal's in", () => {
    const withFibre = buildMealRdaView({ ...meal, fiber_content: 6 }, baked);
    expect(withFibre.macros.map((r) => r.key)).toContain("fiber_content");
    expect(
      buildMealRdaView(meal, baked).macros.map((r) => r.key)
    ).not.toContain("fiber_content");
  });

  it("carries no whole-day reading: no gaps, no limits, no not-tracked", () => {
    // Every one of the five omissions is the same argument — these are readings
    // of a day, and a meal is short of nearly everything by construction.
    const day = buildDayRdaView(meal, baked, {
      limits: resolveNutrientLimits({}),
    });
    expect(day.gaps.length).toBeGreaterThan(0);
    expect(day.limits.length).toBeGreaterThan(0);
    expect(day.untracked.length).toBeGreaterThan(0);
    const view = buildMealRdaView(meal, baked);
    expect(Object.keys(view)).toEqual(["macros", "micros"]);
    // The nutrients those sections held do not resurface in the two that stay.
    const keys = [...view.macros, ...view.micros].map((r) => r.key);
    expect(keys).not.toContain("sodium_content");
    expect(keys).not.toContain("unsaturated_fat_content");
  });

  it("honours the calorie display precision the device is set to", () => {
    const odd = { ...meal, calories: 412.55 };
    expect(buildMealRdaView(odd, baked).macros[0].value).toBe("412.55 kcal");
    expect(
      buildMealRdaView(odd, baked, { calorieDecimals: 0 }).macros[0].value
    ).toBe("413 kcal");
  });

  it("has nothing at all to show for a meal with no rows in it", () => {
    const view = buildMealRdaView({} as NutritionBreakdown, baked);
    expect(view.macros).toEqual([]);
    expect(view.micros).toEqual([]);
  });
});
