import { describe, it, expect } from "vitest";
// A plain-Node ops script, deliberately outside the app's tsconfig, like the
// generator it was split out of.
// @ts-ignore
import {
  applyShippedNames,
  applyVariantDrops,
  assertAdjudicatedVariantsShip,
} from "../../scripts/usda-adjudication.mjs";
// @ts-ignore
import type { AppModule, Survivor } from "../../scripts/usda-bundle.mjs";
import {
  ADJUDICATED_NAMES,
  dropUncontestedQualifiers,
  renameSeedMaturity,
  resolveShippedNames,
  stripEnrichment,
  stripNonNamingQualifiers,
} from "../../src/lib/food/usda-shipped-name";
import {
  ADJUDICATED_VARIANTS,
  resolveFrozenMirrors,
  resolveVariantDrops,
} from "../../src/lib/food/usda-variant-drops";

// What a WRITTEN verdict does to a finished corpus: the rows ADR-0061 §5 removes
// by hand and the names it and ADR-0056 give. Every description here is a real
// corpus row, because a verdict reached by reading invented words was reached by
// reading nothing.

/**
 * The app's own rosters, in the shape the passes read them through.
 *
 * Partial on purpose — the two adjudication passes read these nine and nothing
 * else. `satisfies` keeps each one checked against the real export, so a
 * renamed roster or a changed signature still fails here.
 */
const app = {
  resolveVariantDrops,
  resolveFrozenMirrors,
  ADJUDICATED_VARIANTS,
  resolveShippedNames,
  stripNonNamingQualifiers,
  dropUncontestedQualifiers,
  stripEnrichment,
  renameSeedMaturity,
  ADJUDICATED_NAMES,
} satisfies Partial<AppModule> as unknown as AppModule;

/**
 * One survivor, as `applyVariantDrops` receives them.
 *
 * `dataType` is spelled even though no pass reads it: a real survivor has been
 * through `projectArchiveFood`, which always sets it, and a fixture that could
 * not exist is a fixture that proves nothing.
 */
const survivor = (fdcId: number, description: string): Survivor => ({
  food: { fdcId, description, dataType: "SR Legacy", foodNutrients: [] },
  merged_from: [],
  foodPortions: [],
});

describe("applyVariantDrops — ADR-0061's variants of a food the corpus keeps", () => {
  // A head phrase read row by row, in miniature: a plain milk, a flavoured one,
  // a powder and a second fortification of the plain one.
  const milk = [
    survivor(171266, "Milk, producer, fluid, 3.7% milkfat"),
    survivor(
      170879,
      "Milk, chocolate, fluid, commercial, whole, with added vitamin A and vitamin D"
    ),
    survivor(173454, "Milk, dry, whole, without added vitamin D"),
    survivor(
      172205,
      "Milk, reduced fat, fluid, 2% milkfat, without added vitamin A and vitamin D"
    ),
    survivor(
      746778,
      "Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D"
    ),
    survivor(170875, "Milk, low sodium, fluid"),
  ];

  it("takes each rule's own casualties, and counts them apart", () => {
    const applied = applyVariantDrops(milk, app);
    expect(
      applied.survivors.map((s: { food: { fdcId: number } }) => s.food.fdcId)
    ).toEqual([171266, 172205]);
    expect(applied.variant_dropped).toEqual({
      flavoured_variant: 1,
      dehydrated_form: 1,
      fortification_duplicate: 1,
      adjudicated_variant: 1,
    });
  });

  it("refuses a corpus that has moved past a written verdict", () => {
    // The whole risk of a hand list, and the same failure `assertSupersededSurvive`
    // guards from the other side: a mirror refresh rewrites the description the
    // verdict was reached by reading, and nothing notices.
    //
    // Handed a one-entry roster the way `assertTwinNamesRetrieve`'s tests hand
    // it a one-entry ledger — the check reads the roster off the app module, so
    // narrowing it is how a test asks about one row instead of thirty.
    const one = {
      ...app,
      // A whole entry, `why` and all: the roster's third element IS the written
      // verdict, and a fixture missing it is not the thing being guarded.
      ADJUDICATED_VARIANTS: [
        [170875, "Milk, low sodium, fluid", "a fixture, not a shipped verdict"],
      ],
    } as unknown as AppModule;
    expect(() =>
      assertAdjudicatedVariantsShip(
        [survivor(170875, "Milk, low sodium, fluid, reformulated")],
        one
      )
    ).toThrow(/reached by reading the other name/);
    expect(() => assertAdjudicatedVariantsShip([], one)).toThrow(
      /no longer holds it/
    );
    expect(
      assertAdjudicatedVariantsShip(
        [survivor(170875, "Milk, low sodium, fluid")],
        one
      )
    ).toBe(1);
  });
});

describe("applyShippedNames — the hand-adjudicated names (ADR-0061 §5)", () => {
  // Every entry has to be present, because the pass refuses a roster whose row
  // the corpus dropped — so a case that varies ONE row supplies the rest intact.
  const wholeRoster = () =>
    ADJUDICATED_NAMES.map(([fdcId, published]) => survivor(fdcId, published));
  /** The roster with one row's published description replaced. */
  const rosterExcept = (fdcId: number, description: string) =>
    wholeRoster().map((s) =>
      s.food.fdcId === fdcId ? survivor(fdcId, description) : s
    );

  it("ships the milk under the name a reader was given, not USDA's", () => {
    const applied = applyShippedNames(wholeRoster(), app);
    const shipped = (fdcId: number) =>
      applied.survivors.find((s: Survivor) => s.food.fdcId === fdcId)?.food
        .description;
    expect(shipped(171266)).toBe("Milk, whole, 3.7% milkfat");
    expect(applied.adjudicated).toBe(ADJUDICATED_NAMES.length);
  });

  it("names the bird on the eggs USDA filed by retail grade", () => {
    // ADR-0101's amendment. The `, raw` is load-bearing and not decoration: the
    // row's base-ingredient fact is read off the description at this point, and
    // USDA never wrote the word on a graded egg — so without it a box of fresh
    // eggs scores 0 where a drum of liquid egg scores 1. The strip takes the
    // word out again before the name ships, which is what this asserts.
    const applied = applyShippedNames(wholeRoster(), app);
    const shipped = (fdcId: number) =>
      applied.survivors.find((s: Survivor) => s.food.fdcId === fdcId)?.food
        .description;
    expect([shipped(748967), shipped(747997), shipped(748236)]).toEqual([
      "Egg, chicken, whole, fresh",
      "Egg, chicken, white, fresh",
      "Egg, chicken, yolk, fresh",
    ]);
  });

  it("refuses a corpus that has moved past the published name", () => {
    expect(() =>
      applyShippedNames(
        rosterExcept(171266, "Milk, producer, fluid, 3.7 percent milkfat"),
        app
      )
    ).toThrow(/reached by reading the other name/);
  });

  it("refuses a corpus that dropped the row it renames", () => {
    // The same check the variant list gets, in the same words. A rename whose
    // row an upstream filter took is not a harmless no-op: this one is the only
    // full-fat cow's milk the corpus has, and losing it silently is what a
    // written verdict is checked to prevent.
    expect(() =>
      applyShippedNames(
        [survivor(172225, "Milk, buttermilk, fluid, whole")],
        app
      )
    ).toThrow(/no longer holds it/);
  });
});
