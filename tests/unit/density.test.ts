/**
 * What a twin says about its density, and what a reader may conclude from it
 * (ADR-0108 §1, §4 and the pre-fill amendment).
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
  amountAgainstBasis,
  convertAmount,
  densityClassFromPanel,
  densityFor,
  panelCannotAnswer,
  densityGramsPerMl,
  densityNote,
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
      readFoodDensity({ [FOOD_DENSITY_ATTR]: { class: "liquid" } })
    ).toEqual({ class: "liquid" });
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
    // `milk-like` was one of the five, and #505 retired it without a
    // translation: a pre-release ledger holding one simply loses that food's
    // density rather than having it re-read as something the user never said.
    expect(
      readFoodDensity({ [FOOD_DENSITY_ATTR]: { class: "milk-like" } })
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
    // 100 ml of olive oil is 92 g, and the 78 kcal of error ADR-0108 opens with
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

describe("the panel names the class, and nobody is asked (#505)", () => {
  // ADR-0108 asked a five-way question of every volume food. #499 measured that
  // the answer was already on the twin: three lines over the panel.
  it("calls four-fifths fat an oil", () => {
    expect(densityClassFromPanel({ calories: 884, fat_content: 100 })).toBe(
      "oil"
    );
  });

  it("calls dense sugar with no fat a syrup", () => {
    expect(
      densityClassFromPanel({
        calories: 260,
        fat_content: 0.06,
        carbohydrate_content: 67,
      })
    ).toBe("syrup");
  });

  // 42 kcal is nowhere near 250, which is what keeps every soft drink out of the
  // class a jar of honey is in.
  it("calls a cola a liquid, not a syrup", () => {
    expect(
      densityClassFromPanel({
        calories: 42,
        fat_content: 0,
        carbohydrate_content: 10.6,
      })
    ).toBe("liquid");
  });

  // The rule is right where the food's own name is wrong: 51 kcal is a liquid
  // however the label spells it, and the error against 1.00 is 0.1 kcal.
  it("calls sugar-free syrup a liquid, which its name does not", () => {
    expect(
      densityClassFromPanel({
        calories: 51,
        fat_content: 0,
        carbohydrate_content: 12,
      })
    ).toBe("liquid");
  });

  it("reads nothing off a panel that states no energy", () => {
    expect(densityClassFromPanel({ fat_content: 100 })).toBeUndefined();
    expect(densityClassFromPanel({})).toBeUndefined();
  });
});

describe("two things a panel cannot classify, and both get asked", () => {
  // Air has no macros, so an ice cream's panel looks like a custard's. This is
  // all that survives of the category-tag route.
  it("finds an ice cream, because air has no macros", () => {
    expect(panelCannotAnswer(["en:ice-creams"])).toBe(true);
    expect(panelCannotAnswer(["en:beverages", "EN:Frozen-Desserts"])).toBe(
      true
    );
  });

  // The case that nearly got through: a squash's panel is a juice's panel, and
  // nothing in it says you will dilute this. Read as a liquid it is ~90 kcal out
  // on a 300 ml pour, nine times the bar the silent path rests on.
  it("finds a concentrate, because its panel describes the bottle", () => {
    expect(panelCannotAnswer(["en:beverages", "en:cordials"])).toBe(true);
    expect(panelCannotAnswer(["en:fruit-juices", "en:squashes"])).toBe(true);
    expect(panelCannotAnswer(["en:condensed-milks"])).toBe(true);
  });

  it("says nothing about a food the panel can read", () => {
    expect(panelCannotAnswer(["en:milks"])).toBe(false);
    expect(panelCannotAnswer(["en:fruit-juices"])).toBe(false);
    expect(panelCannotAnswer([])).toBe(false);
    expect(panelCannotAnswer(undefined)).toBe(false);
  });
});

describe("what a food is weighed with, resolved in one place (#505)", () => {
  const perMl = { serving_size: "100 ml", calories: 42 };
  const perGram = { serving_size: "100 g", calories: 350 };

  it("derives a class from the panel, and writes no datom to do it", () => {
    const reading = densityFor(undefined, perMl, []);
    expect(reading).toEqual({
      density: { class: "liquid" },
      asserted: false,
      mustAsk: false,
    });
  });

  // A `food/density` datom exists only because somebody disagreed with us, so it
  // outranks anything derivable — it is a person's answer, not a cache.
  it("lets a correction outrank the derivation", () => {
    const reading = densityFor(
      { [FOOD_DENSITY_ATTR]: { g_per_ml: 1.25 } },
      perMl,
      []
    );
    expect(reading).toEqual({
      density: { g_per_ml: 1.25 },
      asserted: true,
      mustAsk: false,
    });
  });

  // The load-bearing gate. Over the whole corpus this rule calls dry noodles
  // "syrup" and would be wrong by 400 kcal; they never reach it.
  it("asks nothing of a food that is not sold by volume", () => {
    expect(densityFor(undefined, perGram, [])).toEqual({
      density: undefined,
      asserted: false,
      mustAsk: false,
    });
  });

  it("asks rather than applies for an aerated food", () => {
    expect(densityFor(undefined, perMl, ["en:ice-creams"])).toEqual({
      density: undefined,
      asserted: false,
      mustAsk: true,
    });
  });

  it("has nothing to offer a volume food with no panel", () => {
    expect(densityFor(undefined, undefined, [])).toEqual({
      density: undefined,
      asserted: false,
      mustAsk: false,
    });
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
    expect(openingUnit("log", "ml", { class: "liquid" }, null)).toBe("ml");
  });

  it("takes the memory of this context over the context's default", () => {
    expect(openingUnit("recipe", "ml", { class: "oil" }, "ml")).toBe("ml");
    expect(openingUnit("log", "ml", { class: "oil" }, "g")).toBe("g");
  });

  it("reads memory per context, so a can drunk for months still opens on grams in a recipe", () => {
    // The scenario the flat rule gets wrong: a food with any history at all
    // takes it, and the context rule never runs. A recipe list has no memory of
    // a can nobody has cooked with, so the context decides.
    expect(openingUnit("log", "ml", { class: "liquid" }, "ml")).toBe("ml");
    expect(openingUnit("recipe", "ml", { class: "liquid" }, null)).toBe("g");
  });
});

describe("an amount is put into the panel's own unit, never the other way round", () => {
  it("converts a gram entry against a volume panel", () => {
    // 92 g of an oil published per 100 ml is 100 ml of it. Dividing the 92
    // unconverted is an 8% error wearing the right unit, and rescaling the
    // panel instead is what ADR-0048 §3 forbids.
    expect(amountAgainstBasis(92, "g", "100 ml", { class: "oil" })).toBe(100);
  });

  it("is the identity wherever the units already agree", () => {
    expect(amountAgainstBasis(250, "ml", "100 ml", { class: "oil" })).toBe(250);
    expect(amountAgainstBasis(40, "g", "100 g", undefined)).toBe(40);
  });

  it("holds the figure where nothing licenses a conversion", () => {
    // Only reachable by a row logged under a class since retired, and holding
    // the amount is the least wrong of the answers available: the alternative
    // drops a logged figure to zero.
    expect(amountAgainstBasis(92, "g", "100 ml", undefined)).toBe(92);
  });
});

describe("the explainer says how the weight came about (ADR-0108 §9)", () => {
  it("names the class, the figure, and what measured it", () => {
    // Three things, because three things are true and each could be misread on
    // its own: what the user asserted, what the app read it as, and where that
    // reading comes from.
    const note = densityNote({ class: "oil" })!;
    expect(note).toContain("oil");
    expect(note).toContain("0.92");
    expect(note).toContain("USDA");
    // The panel is the source's own and stays so (§5).
    expect(note).toContain("unchanged");
  });

  it("says a typed figure is the user's own and unchecked", () => {
    // It is an asserted density and never a measured one: nothing here measured
    // it and nothing here can check it.
    const note = densityNote({ g_per_ml: 1.2 })!;
    expect(note).toContain("1.2");
    expect(note).toContain("your own figure");
    expect(note).not.toContain("USDA");
  });

  it("says nothing about a food nobody has classified", () => {
    expect(densityNote(undefined)).toBeNull();
  });
});
