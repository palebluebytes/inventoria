import { describe, it, expect, vi } from "vitest";
import {
  isPoorFoodTwin,
  mapPayloadToFoodResult,
  isCatalogueFood,
  searchUsdaFoods,
  NoReferenceFoodError,
  NO_FOOD_FOUND,
} from "../../src/lib/food/food-search";
import { searchUsdaCorpus } from "../../src/lib/food/usda-corpus";
import type { NutritionInfo } from "../../src/lib/food/nutrition";
import {
  buildArrival,
  buildManualEntry,
  FOOD_ARRIVAL_ATTR,
} from "../../src/lib/food/provenance";

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

  // ADR-0073 §11: the arrival mark is display-only. Reusability is inherited
  // from the sender's own classification, because this rule keys off
  // `food/manual_entry.kind` and nothing else — so a received menu dish is as
  // reusable as one you entered, and a received quick estimate is as one-off.
  it("ignores the arrival mark, which decides nothing about reuse", () => {
    const received = { [FOOD_ARRIVAL_ATTR]: buildArrival(1_756_600_000_000) };
    expect(isCatalogueFood({ ...menu, ...received }, "serving")).toBe(true);
    expect(isCatalogueFood({ ...quick, ...received }, "serving")).toBe(false);
    expect(isCatalogueFood(received, "g")).toBe(true);
  });
});

// ── Curated stand-ins folded into search (ADR-0046 §1) ──────────────────────
// The merge order is the whole behaviour: an exact curated hit LEADS so "cacao
// nibs" answers with the stand-in, and a partial one TRAILS so a broad "cocoa"
// never displaces USDA's cocoa powder. `searchUsdaCorpus` is stubbed because the
// ordering, not the corpus, is what is under test here — `usda-corpus.test.ts`
// asserts the search itself against the committed artifact.

vi.mock("../../src/lib/food/usda-corpus", () => ({
  searchUsdaCorpus: vi.fn(),
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
  const stubCorpus = (impl: () => Promise<unknown>) =>
    vi
      .mocked(searchUsdaCorpus)
      .mockImplementation(impl as typeof searchUsdaCorpus);
  /**
   * The corpus search's two-part answer (ADR-0049 §1): the foods, and the
   * phrases that reached them. `phrases` is what was typed unless the vocabulary
   * fallback fired, which is the case the last test here covers.
   */
  const found =
    (phrases: string[], foods: unknown[], rescued = false) =>
    async () => ({
      phrases,
      foods,
      rescued_by_vocabulary: rescued,
    });

  it("leads with the stand-in when the query IS the food", async () => {
    stubCorpus(found(["cacao nibs"], []));
    const { results } = await searchUsdaFoods("cacao nibs");
    expect(results.map((r) => r.entity)).toEqual(["gtin:5400706613279"]);
    expect(results[0].name).toBe("Cacao Nibs");
  });

  it("puts a partial hit BEHIND the USDA results", async () => {
    stubCorpus(
      found(["cocoa"], [usdaFood("fdc:1", "Cocoa, dry powder, unsweetened")])
    );
    const { results } = await searchUsdaFoods("cocoa");
    expect(results.map((r) => r.entity)).toEqual([
      "fdc:1",
      "gtin:5400706613279",
    ]);
  });

  it("says only that no food was found, and offers no scan (ADR-0047 §10)", async () => {
    // The two verdicts #118 drew collapsed with the evidence for them: the
    // filtered-out records are no longer in the index to be counted. #123 is
    // where a better empty state gets worked out.
    stubCorpus(found(["gorgonzola nibs of the sea"], []));
    const error = await searchUsdaFoods("gorgonzola nibs of the sea").catch(
      (e) => e
    );
    expect(error).toBeInstanceOf(NoReferenceFoodError);
    expect(error.message).toBe(NO_FOOD_FOUND);
    expect(NO_FOOD_FOUND).not.toMatch(/barcode|scan/i);
  });

  it("keeps a real fault a failure, never a coverage verdict", async () => {
    // A missing artifact is a broken install, not a food the tables lack, and
    // the user must see it as the fault it is.
    stubCorpus(async () => {
      throw new Error("Failed to load /usda/search-index.json (404).");
    });
    const error = await searchUsdaFoods("banana").catch((e) => e);
    expect(error).not.toBeInstanceOf(NoReferenceFoodError);
    expect(error.message).toContain("404");
  });

  it("reads the curated table with the phrases the search ran over", async () => {
    // ADR-0049 §6: when the vocabulary fallback fires, the reference-food search
    // and the curated table must be looking for the same thing. Here "cacao"
    // retrieved nothing and expanded to "cocoa", so the stand-in is reached
    // through the expansion — and trails, because "cocoa" is a partial hit.
    stubCorpus(
      found(["cocoa"], [usdaFood("fdc:1", "Cocoa, dry powder, unsweetened")])
    );
    const { results } = await searchUsdaFoods("cacao");
    expect(results.map((r) => r.entity)).toEqual([
      "fdc:1",
      "gtin:5400706613279",
    ]);
  });

  it("passes on whether the vocabulary answered, for #149's log", async () => {
    // The one caller that needs it is the search log (ADR-0053 §3): a rescued
    // query is recorded under its own outcome, and it is the search — not the
    // results — that knows a rescue happened.
    stubCorpus(found(["cocoa"], [usdaFood("fdc:1", "Cocoa")], true));
    expect((await searchUsdaFoods("cacao")).rescued_by_vocabulary).toBe(true);

    stubCorpus(found(["banana"], [usdaFood("fdc:2", "Bananas, raw")]));
    expect((await searchUsdaFoods("banana")).rescued_by_vocabulary).toBe(false);
  });
});

describe("mapPayloadToFoodResult", () => {
  it("carries the panel's own basis onto the row (#148)", () => {
    // A Recent row is any ledger twin, so the basis a list prints its figure
    // against cannot be assumed to be per 100 g.
    const cola = mapPayloadToFoodResult({
      entity: "gtin:5449000000996",
      attributes: {
        "food/name": "Coca-Cola",
        "nutrition/info": { serving_size: "100 ml", calories: 42 },
      },
    });
    expect(cola.basis).toBe("100 ml");
    expect(cola.calories).toBe(42);
  });

  it("falls back to the per-100 g reference basis for a panel-less twin", () => {
    const bare = mapPayloadToFoodResult({
      entity: "food:custom_x",
      attributes: { "food/name": "Leftovers" },
    });
    expect(bare.basis).toBe("100 g");
  });
});
