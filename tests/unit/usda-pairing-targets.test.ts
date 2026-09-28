import { describe, it, expect } from "vitest";
// A plain-Node ops script, deliberately outside the app's tsconfig, like the
// generator it runs inside.
// @ts-ignore
import {
  assertArmCollapseIsClosed,
  assertArmFiguresAddUp,
  assertShippedRowsUnmoved,
  buildPairingTargets,
  pairingCollapseCensus,
  serialisePairingCollapse,
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

  it("hands back the rows its collapse absorbed, and only the cooked ones", () => {
    // The arm's own census (ADR-0113 §12): the collapse in this arm is invisible
    // in the Pairing index, because §5 struck the claimed segments out of the
    // survivor's name and the absorbed row is simply absent. Without these rows
    // the account's second table could not state an absorbed count at all.
    const { absorbed } = buildPairingTargets(
      [shipped, ...cooked],
      new Set([9999]),
      app
    );
    // Sorted here, because the order is the collapse map's and the census sorts
    // by `fdcId` before it is written: what this asks is which records were
    // taken and what took them.
    expect(
      absorbed
        .map(({ row, into }: { row: Survivor; into: Survivor }) => [
          row.food.fdcId,
          into.food.fdcId,
        ])
        .sort((a: number[], b: number[]) => a[0] - b[0])
    ).toEqual([
      [168601, 168602],
      [173736, 173735],
    ]);
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

describe("the arm's collapse census — where a cooked record went", () => {
  const absorbed = [
    {
      fdcId: 173736,
      description: "Beans, black, mature seeds, cooked, boiled, with salt",
      collapsed_into: 173735,
    },
    {
      fdcId: 168601,
      description:
        'Beef, round, eye of round, separable lean only, trimmed to 0" fat, cooked, roasted',
      collapsed_into: 168602,
    },
  ];
  const targets = new Map([
    [173735, "Beans, black, dried, cooked, boiled"],
    [168602, "Beef, round, eye of round, separable lean only, cooked, roasted"],
  ]);

  it("names the row each record went into, resolved to the name that ships", () => {
    // The survivor's name here is the STRIPPED one, which is the name a reader
    // asking "where did this go?" will find in the Pairing index. The collapse
    // map carries it pre-strip, so answering from there would name a row the
    // artifact does not hold — the drop census learned this first.
    expect(assertArmCollapseIsClosed(absorbed, targets).get(173735)).toBe(
      "Beans, black, dried, cooked, boiled"
    );
  });

  it("refuses a census whose survivor is not a target row", () => {
    // The claim the second table rests on: no cooked record was absorbed into a
    // row the Search index ships, so the arm can be accounted for on its own.
    // A survivor outside the Pairing index is that claim failing.
    expect(() =>
      assertArmCollapseIsClosed(
        [{ ...absorbed[0], collapsed_into: 4242 }],
        targets
      )
    ).toThrow(/4242/);
  });

  it("serialises one absorbed row per line, sorted by fdcId", () => {
    const census = pairingCollapseCensus(
      absorbed,
      assertArmCollapseIsClosed(absorbed, targets),
      {
        schema_version: 10,
        generated_from: [{ dataset: "SR Legacy" }],
        targets: targets.size,
      }
    );
    expect(census.targets).toBe(2);
    expect(census.collapsed.map((row: { fdcId: number }) => row.fdcId)).toEqual(
      [168601, 173736]
    );
    const text = serialisePairingCollapse(census);
    expect(text.endsWith("\n")).toBe(true);
    expect(
      text.split("\n").filter((line) => line.startsWith('{"fdcId"'))
    ).toHaveLength(2);
    expect(JSON.parse(text).artifact).toBe("usda-pairing-collapse");
  });
});

describe("assertArmFiguresAddUp — the arm's second counter", () => {
  // The arm counts nothing as it merges it, so the account's figures for it are
  // derived from its census on both sides of the byte comparison. What catches a
  // wrong derivation is the subtraction: the lifted corpus's own tallies, less
  // the shipped arm's, are the arm's.
  const lifted = {
    groups_merged: 10,
    groups_shipped_whole: 3,
    names_refused: 1,
  };
  const shipped = {
    groups_merged: 4,
    groups_shipped_whole: 1,
    names_refused: 1,
  };

  it("passes when the remainder is what the arm's census says", () => {
    expect(
      assertArmFiguresAddUp(lifted, shipped, {
        groups_merged: 6,
        groups_shipped_whole: 2,
        names_refused: 0,
      })
    ).toBe(6);
  });

  it("names the figure that does not add up", () => {
    expect(() =>
      assertArmFiguresAddUp(lifted, shipped, {
        groups_merged: 6,
        groups_shipped_whole: 5,
        names_refused: 0,
      })
    ).toThrow(/groups_shipped_whole.*leaving 2 .*says 5/s);
  });
});
