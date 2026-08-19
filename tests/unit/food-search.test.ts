import { describe, it, expect, vi } from "vitest";
import {
  isPoorFoodTwin,
  isCatalogueFood,
  searchUsdaFoods,
  explainEmptySearch,
  NoReferenceFoodError,
} from "../../src/lib/food/food-search";
import { searchFdc } from "../../src/lib/food/usda-fdc";
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

// ── Curated stand-ins folded into search (ADR-0046 §1) ──────────────────────
// The merge order is the whole behaviour: an exact curated hit LEADS so "cacao
// nibs" answers with the stand-in, and a partial one TRAILS so a broad "cocoa"
// never displaces USDA's cocoa powder. `searchFdc` is stubbed because the real
// one needs a key and a network; what is under test is the ordering, not USDA.

vi.mock("../../src/lib/food/usda-fdc", () => ({
  searchFdc: vi.fn(),
}));

const usdaFood = (entity: string, name: string) => ({
  entity,
  attributes: {
    "food/name": name,
    "nutrition/info": { serving_size: "100 g", calories: 228 },
  },
});

describe("searchUsdaFoods with curated stand-ins", () => {
  // Every case sets its own implementation with `mockImplementation(async …)`.
  // `mockResolvedValue` is avoided deliberately: in Vitest 4 it makes a later
  // case's rejection surface as an unhandled one, which reads as a failure in
  // the code under test rather than in the harness.
  const stubFdc = (impl: () => Promise<unknown>) =>
    vi.mocked(searchFdc).mockImplementation(impl as typeof searchFdc);
  const found =
    (foods: unknown[], matchedFoods = foods.length) =>
    async () => ({
      foods,
      matchedFoods,
    });

  it("leads with the stand-in when the query IS the food", async () => {
    stubFdc(found([]));
    const results = await searchUsdaFoods("cacao nibs");
    expect(results.map((r) => r.entity)).toEqual(["gtin:5400706613279"]);
    expect(results[0].name).toBe("Cacao Nibs");
  });

  it("puts a partial hit BEHIND the USDA results", async () => {
    stubFdc(found([usdaFood("fdc:1", "Cocoa, dry powder, unsweetened")]));
    const results = await searchUsdaFoods("cocoa");
    expect(results.map((r) => r.entity)).toEqual([
      "fdc:1",
      "gtin:5400706613279",
    ]);
  });

  it("still throws when neither USDA nor the curated list has anything", async () => {
    stubFdc(found([]));
    await expect(
      searchUsdaFoods("gorgonzola nibs of the sea")
    ).rejects.toBeInstanceOf(NoReferenceFoodError);
  });

  it("says NOT COVERED when USDA matched nothing at all", async () => {
    stubFdc(found([], 0));
    const error = await searchUsdaFoods("gorgonzola nibs of the sea").catch(
      (e) => e
    );
    expect(error).toBeInstanceOf(NoReferenceFoodError);
    expect(error.verdict.reason).toBe("not-covered");
    expect(error.verdict.offerScan).toBe(false);
  });

  it("says FILTERED OUT when USDA matched records the filters dropped", async () => {
    // Twelve chocolate bars, every one brand-specific: a food we do hold records
    // of and route to the barcode path, not a food we have no record of.
    stubFdc(found([], 12));
    const error = await searchUsdaFoods("gorgonzola nibs of the sea").catch(
      (e) => e
    );
    expect(error.verdict.reason).toBe("filtered-out");
    expect(error.verdict.offerScan).toBe(true);
  });

  it("lets a USDA failure propagate rather than masking it with a stand-in", async () => {
    // A missing key or exhausted quota is a real fault the user must see, even
    // on a query the curated list could have answered by itself.
    stubFdc(async () => {
      throw new Error("USDA API rate limit reached.");
    });
    await expect(searchUsdaFoods("cacao nibs")).rejects.toThrow("rate limit");
  });

  it("keeps a real API failure a failure, never a coverage verdict", async () => {
    // The distinction only means anything if an outage cannot wear it.
    stubFdc(async () => {
      throw new Error("USDA API request failed (500).");
    });
    const error = await searchUsdaFoods("banana").catch((e) => e);
    expect(error).not.toBeInstanceOf(NoReferenceFoodError);
    expect(error.message).toContain("500");
  });
});

// ── Why a search came back empty (issue #118) ───────────────────────────────
// USDA returning twelve brand-specific chocolate bars that the ADR-0042 filters
// then drop is a different event from USDA matching nothing at all, and only the
// first can honestly say "we hold records here, none of them reference foods".
// The distinction is this pure verdict, asserted directly rather than through
// the markup that renders it.

describe("explainEmptySearch", () => {
  it("says the filters emptied the results when USDA did return foods", () => {
    const verdict = explainEmptySearch({
      query: "twix",
      matchedFoods: 12,
    });
    expect(verdict.reason).toBe("filtered-out");
    expect(verdict.message).toContain("twix");
  });

  it("points an all-filtered query at the barcode path", () => {
    const verdict = explainEmptySearch({ query: "twix", matchedFoods: 12 });
    expect(verdict.offerScan).toBe(true);
    expect(verdict.message).toMatch(/barcode/i);
  });

  it("quotes no count, since the count is one page of a wildcarded query", () => {
    // "USDA holds 12 records for X" would assert a total nobody asked FDC for,
    // and a relevance an OR-of-prefixes query does not guarantee. That USDA
    // returned something is all that is known, so it is all that is said.
    const twelve = explainEmptySearch({ query: "twix", matchedFoods: 12 });
    const one = explainEmptySearch({ query: "twix", matchedFoods: 1 });
    expect(twelve.message).toBe(one.message);
    expect(twelve.message).not.toMatch(/\d/);
  });

  it("names every filter family, not just the ones with barcodes", () => {
    // The count cannot say WHICH ADR-0042 filter emptied the list, so the copy
    // may not claim they were all brand-specific packs.
    const message = explainEmptySearch({
      query: "potato salad",
      matchedFoods: 5,
    }).message;
    expect(message).toContain("brand-specific, packaged and prepared");
  });

  it("says the food is not covered when USDA matched nothing", () => {
    const verdict = explainEmptySearch({
      query: "gorgonzola nibs",
      matchedFoods: 0,
    });
    expect(verdict.reason).toBe("not-covered");
    expect(verdict.message).toContain("gorgonzola nibs");
  });

  it("does not push the barcode path where it is only a guess", () => {
    // Nothing matched, so there is no evidence the pack is in OFF either — the
    // other doors are named, not prescribed.
    expect(explainEmptySearch({ query: "x", matchedFoods: 0 }).offerScan).toBe(
      false
    );
  });

  it("claims only that USDA does not carry the food, never that it does not exist", () => {
    const message = explainEmptySearch({
      query: "cacao nibs",
      matchedFoods: 0,
    }).message;
    expect(message).toMatch(/USDA/);
    expect(message).not.toMatch(/does not exist|no such food|isn't a food/i);
  });
});
