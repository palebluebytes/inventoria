import { describe, it, expect } from "vitest";
// A plain-Node ops script, deliberately outside the app's tsconfig, like the
// generator it runs inside.
// @ts-ignore
import {
  assertShippedRowsUnmoved,
  buildPairingTargets,
} from "../../scripts/usda-pairing-targets.mjs";
// @ts-ignore
import type { AppModule, Survivor } from "../../scripts/usda-bundle.mjs";
import {
  claimingAxis,
  collapseGroupKey,
  descriptionSegments,
  mayRepresentGroup,
  residualDescription,
  siblingsOf,
  withoutTrailingGloss,
} from "../../src/lib/food/usda-collapse-roster";
import {
  dropUncontestedQualifiers,
  renameSeedMaturity,
  resolveCollapsedNames,
  resolveShippedNames,
  resolveStorageNames,
  stripEnrichment,
  stripNonNamingQualifiers,
} from "../../src/lib/food/usda-shipped-name";
import {
  resolveFrozenRecords,
  resolveVariantDrops,
} from "../../src/lib/food/usda-variant-drops";

// ADR-0113 §11's second corpus. The records USDA cooked before it measured them
// are not Reference foods and never ship in the Search index (ADR-0104); this is
// the arm that re-admits them, under their own artifacts, for pairing alone.

/**
 * The app's own logic, in the shape the passes read it through.
 *
 * Partial on purpose, and the partiality says something: the pairing arm runs
 * the SHIPPED passes and writes none of its own, so what it reaches for is
 * exactly what ADR-0061's drops, ADR-0056's names and ADR-0103's collapse reach
 * for. `satisfies` keeps every entry checked against the real export.
 *
 * The two hand rosters are the exception, and are stubbed empty. Each is a
 * verdict about a named row of the corpus that ships, asserted against it by
 * `applyShippedNames` and `applyVariantDrops` themselves — so a roster naming
 * rows this fixture never held would fail on the absence rather than on
 * anything here. What they adjudicate is `usda-adjudication.test.ts`'s.
 */
const app = {
  resolveVariantDrops,
  ADJUDICATED_VARIANTS: [],
  resolveFrozenRecords,
  resolveShippedNames,
  renameSeedMaturity,
  dropUncontestedQualifiers,
  stripEnrichment,
  resolveStorageNames,
  stripNonNamingQualifiers,
  ADJUDICATED_NAMES: [],
  collapseGroupKey,
  mayRepresentGroup,
  descriptionSegments,
  residualDescription,
  claimingAxis,
  siblingsOf,
  withoutTrailingGloss,
  resolveCollapsedNames,
} satisfies Partial<AppModule> as unknown as AppModule;

/** One survivor as the passes receive them: a name and a panel. */
const survivor = (fdcId: number, description: string, panel = 1): Survivor => ({
  food: {
    fdcId,
    description,
    dataType: "SR Legacy",
    foodNutrients: Array.from({ length: panel }, (_, i) => ({
      nutrientId: 1000 + i,
      nutrientName: "n",
      value: 0,
      unitName: "g",
    })),
  },
  merged_from: [],
  foodPortions: [],
});

const names = (survivors: Survivor[]) =>
  survivors.map((s) => s.food.description);

describe("buildPairingTargets — the cooked records under the shipped rules", () => {
  // Two real shapes: a beef cut USDA published at two trims, and the boiled
  // bean that chartered the map.
  const cooked = [
    survivor(
      173735,
      "Beans, black, mature seeds, cooked, boiled, without salt"
    ),
    survivor(
      173736,
      "Beans, black, mature seeds, cooked, boiled, with salt",
      2
    ),
    survivor(
      168601,
      'Beef, round, eye of round, separable lean only, trimmed to 0" fat, cooked, roasted'
    ),
    survivor(
      168602,
      'Beef, round, eye of round, separable lean only, trimmed to 1/8" fat, cooked, roasted',
      2
    ),
  ];
  const shipped = survivor(9999, "Cheese, cheddar");

  it("keeps only the records the shipped corpus never held", () => {
    const { targets } = buildPairingTargets(
      [shipped, ...cooked],
      new Set([9999]),
      app
    );
    expect(names(targets)).not.toContain("Cheese, cheddar");
    expect(targets.length).toBeGreaterThan(0);
  });

  it("collapses them the way the shipped corpus collapses, salt included", () => {
    // ADR-0113 §12: salt is the fourth Collapsing axis, and it claims a segment
    // only where another names a cooking method the food was not bought in.
    // Both pairs here are such a row, so each ships once.
    const { targets } = buildPairingTargets(cooked, new Set(), app);
    expect(targets).toHaveLength(2);
    // The beef keeps the fuller panel of its two trims; the beans ship under
    // the residual name §5's strip leaves once the salt segment is gone, and
    // the `with salt` half may not represent a group at all (§5: non-preferred).
    expect(targets.map((s: Survivor) => s.food.fdcId)).toEqual([
      168602, 173735,
    ]);
    expect(names(targets)).toContain("Beans, black, dried, cooked, boiled");
  });

  it("returns the whole lifted corpus beside the targets, shipped rows and all", () => {
    // The shipped rows are what `assertShippedRowsUnmoved` is asked about, so
    // the arm cannot throw them away before anybody has read them.
    const { corpus, targets } = buildPairingTargets(
      [shipped, ...cooked],
      new Set([9999]),
      app
    );
    expect(names(corpus)).toContain("Cheese, cheddar");
    expect(corpus.length).toBe(targets.length + 1);
  });
});

describe("assertShippedRowsUnmoved — the lift may not touch what ships", () => {
  // The two artifacts describe one corpus between them. A cooked record that
  // absorbed a shipped row into its collapse group, or handed it a shorter
  // residual name, would make the Search index and the Pairing index disagree
  // about the same food — and the disagreement would ship silently.
  const shipped = [survivor(1, "Cheese, cheddar"), survivor(2, "Pears, dried")];

  it("counts the rows it checked when every one is where it was", () => {
    expect(
      assertShippedRowsUnmoved(shipped, [...shipped, survivor(3, "x")])
    ).toBe(2);
  });

  it("refuses a lift that removed a shipped row", () => {
    expect(() => assertShippedRowsUnmoved(shipped, [shipped[0]])).toThrow(
      /2 .*Pears, dried/s
    );
  });

  it("refuses a lift that renamed one", () => {
    expect(() =>
      assertShippedRowsUnmoved(shipped, [shipped[0], survivor(2, "Pears")])
    ).toThrow(/Pears, dried/);
  });
});
