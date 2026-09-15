/**
 * What a twin says about its density, and what a reader may conclude from it
 * (ADR-0105 §1, §4 and the pre-fill amendment).
 *
 * `density-class.test.ts` holds the other half — that the five figures are the
 * ones the corpus measures. Nothing here re-measures a class: these are
 * statements about the attribute, the resolution, and the rule that decides
 * whether a source has said enough for the app to propose anything at all.
 */
import { describe, expect, it } from "vitest";
import {
  ASSERTED_FIGURE_BOUNDS,
  DENSITY_CLASS_OPTIONS,
  FOOD_DENSITY_ATTR,
  convertAmount,
  densityClassFromCategoryTags,
  densityGramsPerMl,
  openingUnit,
  readFoodDensity,
} from "../../src/lib/food/density";
import { DENSITY_CLASSES } from "../../src/lib/food/density-class";
import { offCategoryTagsFromTwin } from "../../src/lib/food/open-food-facts";

describe("the twin stores the class and the figure is derived (§4)", () => {
  it("resolves a class through the pinned table rather than off the twin", () => {
    const oil = DENSITY_CLASSES.find((c) => c.id === "oil")!;
    expect(densityGramsPerMl({ class: "oil" })).toBe(oil.figure);
    // The figure the class resolves to is nowhere in what was stored: that is
    // what lets an improved class improve every food filed under it.
    expect(
      Object.values({ class: "oil" } as Record<string, unknown>)
    ).not.toContain(oil.figure);
  });

  it("hands back an asserted figure untouched", () => {
    expect(densityGramsPerMl({ g_per_ml: 1.2 })).toBe(1.2);
  });

  it("has no figure for a food that asserts nothing", () => {
    expect(densityGramsPerMl(undefined)).toBeUndefined();
  });

  it("gives every shipped class words a person can pick by", () => {
    for (const cls of DENSITY_CLASSES) {
      const option = DENSITY_CLASS_OPTIONS[cls.id];
      expect(option).toBeTruthy();
      // Names the thing, never the number (§9): showing `0.92 g/ml` in the
      // picker asks you to validate a figure you have no way to check.
      expect(option).not.toContain(String(cls.figure));
      expect(option).not.toMatch(/g\/ml/);
    }
  });
});

describe("a malformed density reads as no density, never a wrong figure", () => {
  it("reads a class and a figure back off a twin", () => {
    expect(
      readFoodDensity({ [FOOD_DENSITY_ATTR]: { class: "juice" } })
    ).toEqual({ class: "juice" });
    expect(readFoodDensity({ [FOOD_DENSITY_ATTR]: { g_per_ml: 1.2 } })).toEqual(
      {
        g_per_ml: 1.2,
      }
    );
  });

  it("declines a class the table no longer holds", () => {
    // A value written by an older build, or arriving from one of your own
    // devices, naming a class since retired. The food falls back to the
    // standing state — millilitres, fully loggable (§6) — and never to 1.0.
    expect(
      readFoodDensity({ [FOOD_DENSITY_ATTR]: { class: "syrup" } })
    ).toBeUndefined();
  });

  it("declines a figure outside the pourable world", () => {
    // The error this catches is a slipped decimal point: 92 for 0.92.
    expect(
      readFoodDensity({ [FOOD_DENSITY_ATTR]: { g_per_ml: 92 } })
    ).toBeUndefined();
    expect(
      readFoodDensity({ [FOOD_DENSITY_ATTR]: { g_per_ml: 0 } })
    ).toBeUndefined();
    expect(
      readFoodDensity({
        [FOOD_DENSITY_ATTR]: { g_per_ml: ASSERTED_FIGURE_BOUNDS.max },
      })
    ).toEqual({ g_per_ml: ASSERTED_FIGURE_BOUNDS.max });
  });

  it("declines a bare number, a string and a missing attribute", () => {
    expect(readFoodDensity({ [FOOD_DENSITY_ATTR]: 0.92 })).toBeUndefined();
    expect(readFoodDensity({ [FOOD_DENSITY_ATTR]: "oil" })).toBeUndefined();
    expect(readFoodDensity({})).toBeUndefined();
    expect(readFoodDensity(undefined)).toBeUndefined();
  });
});

describe("the one place a volume becomes a weight (§1)", () => {
  it("converts both ways through the asserted class", () => {
    // 100 ml of olive oil is 92 g, and the 78 kcal of error ADR-0105 opens with
    // is the difference between reading that and assuming 1 g/ml.
    expect(convertAmount(100, "ml", "g", { class: "oil" })).toBe(92);
    expect(convertAmount(92, "g", "ml", { class: "oil" })).toBe(100);
  });

  it("refuses to bridge the units with no density, rather than converting at 1", () => {
    expect(convertAmount(100, "ml", "g", undefined)).toBeUndefined();
    // ADR-0060 §2's ratio-1 pretence, stated as the thing this does not do.
    expect(convertAmount(100, "ml", "g", undefined)).not.toBe(100);
  });

  it("is an identity within one unit, density or not", () => {
    expect(convertAmount(250, "ml", "ml", undefined)).toBe(250);
    expect(convertAmount(40, "g", "g", { class: "oil" })).toBe(40);
  });
});

describe("the source pre-fills only where its tags name exactly one class", () => {
  it("proposes the class an unambiguous tag names", () => {
    expect(
      densityClassFromCategoryTags(["en:beverages", "en:olive-oils"])
    ).toBe("oil");
    expect(densityClassFromCategoryTags(["EN:Waters"])).toBe("water-like");
  });

  it("proposes nothing for squash, which carries juice and cordial together", () => {
    // 18.6% of millilitre cordials do. A juice rule would put 1.04 on a
    // concentrate nearer 1.20, and a wrong pre-fill converts a question into a
    // nod — which is worse than asking.
    expect(
      densityClassFromCategoryTags(["en:fruit-juices", "en:cordials"])
    ).toBeUndefined();
  });

  it("proposes nothing for a coconut tin sold for cooking", () => {
    // `en:plant-based-creams-for-cooking` beside a drinkable tag makes a
    // cooking tin indistinguishable from a drinking carton.
    expect(
      densityClassFromCategoryTags([
        "en:beverages",
        "en:plant-based-creams-for-cooking",
      ])
    ).toBeUndefined();
  });

  it("proposes nothing where two classes match", () => {
    expect(
      densityClassFromCategoryTags(["en:milks", "en:orange-juices"])
    ).toBeUndefined();
  });

  it("proposes nothing for the 41% the classes do not name", () => {
    // Half of them are drinkables the five classes do not cover and half are
    // not drinks at all, yet sold in millilitres.
    expect(densityClassFromCategoryTags(["en:energy-drinks"])).toBeUndefined();
    expect(densityClassFromCategoryTags(["en:ice-creams"])).toBeUndefined();
    expect(densityClassFromCategoryTags(["en:vinegars"])).toBeUndefined();
    expect(densityClassFromCategoryTags(["en:spirits"])).toBeUndefined();
  });

  it("proposes nothing for the 24% carrying no usable tags", () => {
    // Orangina, Red Bull, Bière 33cl — ordinary products, not oddities.
    expect(densityClassFromCategoryTags([])).toBeUndefined();
    expect(densityClassFromCategoryTags(undefined)).toBeUndefined();
    expect(densityClassFromCategoryTags(["en:unknown-thing"])).toBeUndefined();
  });

  it("does not need a beverages ancestor to reach a milk", () => {
    // `en:milks` never inherits `en:beverages`, so a rule anchored on the
    // beverages tree would see no milk at all.
    expect(densityClassFromCategoryTags(["en:milks"])).toBe("milk-like");
  });

  it("does not read a plant drink as a milk", () => {
    // The tag is `en:oat-based-drinks`, never `en:oat-milks`, and a plant milk
    // never inherits `en:dairies`.
    expect(
      densityClassFromCategoryTags(["en:oat-based-drinks"])
    ).toBeUndefined();
    expect(
      densityClassFromCategoryTags(["en:milks", "en:oat-based-drinks"])
    ).toBeUndefined();
  });

  it("does not read a concentrate or a powder as a milk", () => {
    // The milk-like class was measured without them: 1.0651 puts the first
    // evaporated milk outside the class it would otherwise widen.
    expect(
      densityClassFromCategoryTags(["en:milks", "en:condensed-milks"])
    ).toBeUndefined();
  });
});

describe("the tags are read off a twin already in the ledger", () => {
  const twin = (raw: unknown) => ({
    "provenance/raw": { adapter: "off", raw_data: raw },
  });

  it("reads them out of the raw provenance, with no re-fetch", () => {
    expect(
      offCategoryTagsFromTwin(
        twin({ product: { categories_tags: ["en:olive-oils"] } })
      )
    ).toEqual(["en:olive-oils"]);
  });

  it("is empty for a twin from any other source", () => {
    expect(
      offCategoryTagsFromTwin({
        "provenance/raw": { adapter: "usda", raw_data: {} },
      })
    ).toEqual([]);
    expect(offCategoryTagsFromTwin(undefined)).toEqual([]);
    expect(offCategoryTagsFromTwin(twin({ product: {} }))).toEqual([]);
  });
});

describe("context sets the opening unit and memory overrides it (§7)", () => {
  it("leaves a food with no density on its panel's own unit", () => {
    // ADR-0060 §1 everywhere else: a food with no density has no choice to make.
    expect(openingUnit("recipe", "ml", undefined, null)).toBe("ml");
    expect(openingUnit("log", "ml", undefined, null)).toBe("ml");
  });

  it("opens a classified food on grams in a recipe and on the panel in a log", () => {
    expect(openingUnit("recipe", "ml", { class: "oil" }, null)).toBe("g");
    // Unqualified "grams the default" would open a can of Coke in grams, and
    // nobody weighs a can of Coke.
    expect(openingUnit("log", "ml", { class: "juice" }, null)).toBe("ml");
  });

  it("takes the memory of this context over the context's default", () => {
    expect(
      openingUnit("recipe", "ml", { class: "oil" }, { amount: 30, unit: "ml" })
    ).toBe("ml");
    expect(
      openingUnit("log", "ml", { class: "oil" }, { amount: 15, unit: "g" })
    ).toBe("g");
  });

  it("reads memory per context, so a can drunk for months still opens on grams in a recipe", () => {
    // The scenario the flat rule gets wrong: a food with any history at all
    // takes it, and the context rule never runs. A recipe list has no memory of
    // a can nobody has cooked with, so the context decides.
    const drunkInMillilitres = { amount: 330, unit: "ml" } as const;
    expect(
      openingUnit("log", "ml", { class: "juice" }, drunkInMillilitres)
    ).toBe("ml");
    expect(openingUnit("recipe", "ml", { class: "juice" }, null)).toBe("g");
  });
});
