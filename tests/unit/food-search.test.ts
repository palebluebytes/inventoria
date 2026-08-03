import { describe, it, expect } from "vitest";
import {
  isPoorFoodTwin,
  isCatalogueFood,
} from "../../src/lib/food/food-search";
import type { NutritionInfo } from "../../src/lib/food/nutrition";
import { buildManualEntry } from "../../src/lib/food/provenance";

// The poor-quality predicate (ADR-0034 §1) is the ONE place the label-capture
// effort decides a scanned twin is "poor" enough to nudge. Pure, so assert its
// verdict directly across the boundary cases #48 recorded.

// A twin with every core macro present — the "good enough" baseline the cases
// perturb one field at a time.
const goodPanel: NutritionInfo = {
  serving_size: "100 g",
  calories: 250,
  protein_content: 8,
  fat_content: 12,
  carbohydrate_content: 30,
};

describe("isPoorFoodTwin", () => {
  it("is poor when the name is blank", () => {
    expect(isPoorFoodTwin({ name: "", nutrition: goodPanel })).toBe(true);
  });

  it("is poor when the name is the mapper's 'Unknown' placeholder", () => {
    expect(isPoorFoodTwin({ name: "Unknown", nutrition: goodPanel })).toBe(
      true
    );
    // Case-insensitively — the placeholder is a fixed sentinel however cased.
    expect(isPoorFoodTwin({ name: "unknown", nutrition: goodPanel })).toBe(
      true
    );
  });

  it("is poor when any core macro is missing", () => {
    const noProtein: NutritionInfo = {
      serving_size: "100 g",
      calories: 250,
      fat_content: 12,
      carbohydrate_content: 30,
    };
    expect(
      isPoorFoodTwin({ name: "Hearty Wholegrain Loaf", nutrition: noProtein })
    ).toBe(true);
  });

  it("is poor when the whole panel is absent", () => {
    expect(
      isPoorFoodTwin({ name: "Mystery Snack Bar", nutrition: undefined })
    ).toBe(true);
  });

  it("treats a genuine zero macro as present, not missing", () => {
    // A zero-calorie drink legitimately reports 0 — that is a value, not a gap.
    const zeroCal: NutritionInfo = {
      serving_size: "100 g",
      calories: 0,
      protein_content: 0,
      fat_content: 0,
      carbohydrate_content: 0,
    };
    expect(
      isPoorFoodTwin({ name: "Sparkling Water", nutrition: zeroCal })
    ).toBe(false);
  });

  it("does NOT flag a short generic name on its own", () => {
    // "Aceite" (Spanish "oil") with a full panel and no corroborator is left be.
    expect(isPoorFoodTwin({ name: "Aceite", nutrition: goodPanel })).toBe(
      false
    );
  });

  it("flags a short generic name WITH a missing macro", () => {
    const noCarb: NutritionInfo = {
      serving_size: "100 g",
      calories: 800,
      protein_content: 0,
      fat_content: 91,
    };
    expect(isPoorFoodTwin({ name: "Aceite", nutrition: noCarb })).toBe(true);
  });

  it("flags a short generic name WITH low OFF completeness", () => {
    expect(
      isPoorFoodTwin({
        name: "Aceite",
        nutrition: goodPanel,
        completeness: 0.38,
      })
    ).toBe(true);
  });

  it("leaves a short generic name alone when completeness is healthy", () => {
    expect(
      isPoorFoodTwin({
        name: "Aceite",
        nutrition: goodPanel,
        completeness: 0.9,
      })
    ).toBe(false);
  });

  it("is not poor for a full, well-named twin", () => {
    expect(
      isPoorFoodTwin({
        name: "Organic Crunchy Peanut Butter",
        nutrition: goodPanel,
        completeness: 0.85,
      })
    ).toBe(false);
  });

  it("is not poor for a twin missing only a micronutrient", () => {
    // Sub-macros and micros never trigger — a label omitting vitamin B12 is fine.
    const noMicro: NutritionInfo = {
      ...goodPanel,
      fiber_content: 3,
      // vitamin_b12 deliberately absent
    };
    expect(
      isPoorFoodTwin({ name: "Wholegrain Oat Cereal", nutrition: noMicro })
    ).toBe(false);
  });
});

// The single Recent/Search catalogue rule (ADR-0035 §6): gram foods always
// qualify; whole-serving foods qualify only as a reusable `menu` manual entry.
describe("isCatalogueFood", () => {
  const menu = {
    "food/manual_entry": buildManualEntry({ kind: "menu", fields: [] }),
  };
  const quick = {
    "food/manual_entry": buildManualEntry({
      kind: "quick_estimate",
      fields: [],
    }),
  };
  const plate = {
    "food/manual_entry": buildManualEntry({
      kind: "plate_estimate",
      fields: [],
    }),
  };

  it("keeps any gram-basis food regardless of provenance", () => {
    expect(isCatalogueFood({}, "g")).toBe(true);
    expect(isCatalogueFood(quick, "g")).toBe(true);
  });

  it("keeps a whole-serving menu dish", () => {
    expect(isCatalogueFood(menu, "serving")).toBe(true);
  });

  it("drops a whole-serving quick estimate or plate estimate (one-offs)", () => {
    expect(isCatalogueFood(quick, "serving")).toBe(false);
    expect(isCatalogueFood(plate, "serving")).toBe(false);
  });

  it("drops a whole-serving food with no manual-entry (label capture / legacy custom)", () => {
    expect(isCatalogueFood({ "twin/brand": "Acme" }, "serving")).toBe(false);
  });
});
