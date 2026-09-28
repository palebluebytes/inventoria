import { describe, it, expect } from "vitest";
// A plain-Node ops script, deliberately outside the app's tsconfig, like the
// generator it runs inside.
// @ts-ignore
import {
  HEADS_THE_COLLAPSE_MOVES,
  applyCollapsedNames,
  assertCollapseReach,
  assertCollapsedRowsShip,
  assertNamesClaimNoLess,
  assertNoAxisHidesInAGloss,
  collapseCorpus,
  collapseReach,
} from "../../scripts/usda-collapse.mjs";
// @ts-ignore
import type { AppModule, Survivor } from "../../scripts/usda-bundle.mjs";
import {
  claimingAxis,
  collapseGroupKey,
  descriptionSegments,
  mayRepresentGroup,
  residualDescription,
  withoutTrailingGloss,
} from "../../src/lib/food/usda-collapse-roster";
import { resolveCollapsedNames } from "../../src/lib/food/usda-shipped-name";

// ADR-0103 §3, §4, §6 and §9's survivor assertion, as the generator runs them.
// Every description below is a real corpus row: §4's chain is a rule about what
// USDA published, and a chain measured against invented names is measured
// against nothing.

/**
 * The app's own roster, in the shape the pass reads it through.
 *
 * Partial on purpose — the collapse reads these three and nothing else, which is
 * the point of it being mechanical. `satisfies` keeps each one checked against
 * the real export, so a renamed key or a changed signature still fails here.
 */
const app = {
  collapseGroupKey,
  mayRepresentGroup,
  descriptionSegments,
  residualDescription,
  claimingAxis,
  withoutTrailingGloss,
  resolveCollapsedNames,
} satisfies Partial<AppModule> as unknown as AppModule;

/**
 * One survivor, as the collapse receives them: a name and a panel.
 *
 * `panel` is a COUNT of nutrients rather than a list, because §4.2 asks how full
 * the panel is and `projectArchiveFood` has already dropped every nutrient with
 * no numeric amount. Filling the array with nulls would be a fixture pretending
 * to a shape the question never reads.
 */
const survivor = (fdcId: number, description: string, panel = 0): Survivor => ({
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

const ids = (survivors: Survivor[]) => survivors.map((s) => s.food.fdcId);

describe("collapseCorpus — §3's group, §4's representative", () => {
  // One flank steak, as USDA publishes it: the same cut at two trims, two
  // grades and both sides of the butcher's knife. §2 calls all three axes
  // collapsing, so the five rows share one residual description.
  const flank = [
    survivor(
      168627,
      'Beef, flank, steak, separable lean and fat, trimmed to 0" fat, choice',
      40
    ),
    survivor(
      168628,
      'Beef, flank, steak, separable lean and fat, trimmed to 0" fat, select',
      42
    ),
    survivor(168629, "Beef, flank, steak, separable lean only", 60),
    survivor(
      168630,
      'Beef, flank, steak, separable lean and fat, trimmed to 0" fat',
      41
    ),
  ];

  it("keeps one row for a group and names the survivor of every other", () => {
    const { survivors, collapsed, groups_merged, groups_shipped_whole } =
      collapseCorpus(flank, app);
    // 168628 has the fullest panel of the three ELIGIBLE rows. 168629 has a
    // fuller one still and does not win: `separable lean only` is a dissected
    // fraction, so §5 refuses it the group's name.
    expect(ids(survivors)).toEqual([168628]);
    // Whole rows, not a pair of ids: both callers want the taken row's name and
    // the survivor's, and a map of ids makes each of them build a second map
    // back to names they already had.
    expect(
      [...collapsed].map(([fdcId, { row, into }]) => [
        fdcId,
        row.food.fdcId,
        into.food.fdcId,
      ])
    ).toEqual([
      [168627, 168627, 168628],
      [168629, 168629, 168628],
      [168630, 168630, 168628],
    ]);
    expect([groups_merged, groups_shipped_whole]).toEqual([1, 0]);
  });

  it("never lets provenance into §4's chain", () => {
    // `dataType` is not in the chain, and this is the case that would notice:
    // the Foundation row here is poorer and later, so a Foundation-first
    // tiebreak is the only thing that could hand it the group. Preferring
    // Foundation to SR Legacy is provenance rather than a claim about the
    // record, and ADR-0055 §1 admits only the second kind.
    const foundation = survivor(
      2514744,
      'Beef, flank, steak, separable lean and fat, trimmed to 0" fat, prime',
      12
    );
    foundation.food.dataType = "Foundation";
    const { survivors } = collapseCorpus([...flank, foundation], app);
    expect(ids(survivors)).toEqual([168628]);
  });

  it("breaks a tie on the lowest fdcId, so a regeneration answers the same", () => {
    const tied = [
      survivor(
        168627,
        'Beef, flank, steak, separable lean and fat, trimmed to 0" fat, choice',
        40
      ),
      survivor(
        168628,
        'Beef, flank, steak, separable lean and fat, trimmed to 0" fat, select',
        40
      ),
    ];
    expect(ids(collapseCorpus(tied, app).survivors)).toEqual([168627]);
    // The same two rows arriving the other way round answer the same, which is
    // the whole of what the tiebreak buys.
    expect(ids(collapseCorpus([...tied].reverse(), app).survivors)).toEqual([
      168627,
    ]);
  });

  it("leaves a group of one alone, whatever it says about itself", () => {
    // §5 settles this for `Quinoa, cooked`: the only quinoa USDA publishes, so
    // nothing is stripped and it ships — a true name over a true panel. A lone
    // `separable lean only` row is the same case and is not refused out of the
    // corpus, because there is nothing for it to be refused in favour of.
    const lone = [
      survivor(174736, "Beef, tenderloin, separable lean only", 30),
    ];
    const { survivors, collapsed, groups_merged } = collapseCorpus(lone, app);
    expect(ids(survivors)).toEqual([174736]);
    expect(collapsed.size).toBe(0);
    expect(groups_merged).toBe(0);
  });

  it("ships a group with no eligible row whole, rather than blocking its head", () => {
    // ADR-0103's 2026-09-12 Amendment. A group of six cooked-only rib eye rows
    // blocked 950 rows of beef under §5 as written, and the asymmetry with the
    // group-of-one case above had no argument behind it. Here both rows are
    // dissected fractions, so the fuller panel takes it under its own name.
    const fractions = [
      survivor(173078, "Beef, flank, separable lean only", 30),
      survivor(173079, "Beef, flank, separable fat", 44),
    ];
    const { survivors, groups_merged, groups_shipped_whole } = collapseCorpus(
      fractions,
      app
    );
    expect(ids(survivors)).toEqual([173079]);
    expect([groups_merged, groups_shipped_whole]).toEqual([1, 1]);
  });

  it("writes the corpus back in fdcId order, so a regeneration diffs as itself", () => {
    // ADR-0047 §3. A representative is rarely the first row of its group, so
    // without the sort a regeneration would diff as a reshuffle of 2,000 lines.
    const mixed = [
      survivor(9, "Lamb, loin chop, separable lean only", 10),
      survivor(8, "Lamb, loin chop, separable lean and fat", 10),
      survivor(7, "Veal, rib, rib roast", 10),
    ];
    expect(ids(collapseCorpus(mixed, app).survivors)).toEqual([7, 8]);
  });

  it("groups on the shipped name, punctuation and all (§3's normalisation)", () => {
    // USDA spells one cut both ways, and #191 measured the clause as worth 8 of
    // 193 groups on `Beef` — a correctness lever, not a size one.
    const spelled = [
      survivor(168000, "Beef, round, top round, steak", 20),
      survivor(168001, "Beef, round, top round steak", 30),
    ];
    expect(ids(collapseCorpus(spelled, app).survivors)).toEqual([168001]);
  });

  it("leaves a segment the roster cannot read in a group of its own", () => {
    // §5's `with added solution` clause, carried by the group key rather than by
    // the eligibility test: an unclaimed segment survives into the residual
    // description, so a brine-injected row is never a candidate to stand for the
    // plain cut. Without this the corpus hands a reader 108 kcal of brine.
    const brined = [
      survivor(
        168260,
        "Pork, fresh, shoulder, blade (steaks), separable lean and fat",
        20
      ),
      survivor(
        168363,
        "Pork, fresh, shoulder, blade (steaks), separable lean and fat, with added solution",
        90
      ),
    ];
    const { survivors, collapsed } = collapseCorpus(brined, app);
    expect(ids(survivors)).toEqual([168260, 168363]);
    expect(collapsed.size).toBe(0);
  });
});

describe("assertCollapsedRowsShip — ADR-0051 §2's survivor assertion", () => {
  // §9 inherits it whole: a collapse ALWAYS leaves a survivor, which is the
  // entire ground on which §6 lets it fire under head phrases nobody has read.
  // A survivor that is not shipping means the collapse has become a deletion.
  const into = survivor(
    168628,
    'Beef, flank, steak, separable lean and fat, trimmed to 0" fat, select'
  );
  const taken = (fdcId: number, description: string) => ({
    row: survivor(fdcId, description),
    into,
  });
  const collapsed = new Map([
    [
      168627,
      taken(
        168627,
        'Beef, flank, steak, separable lean and fat, trimmed to 0" fat, choice'
      ),
    ],
    [168629, taken(168629, "Beef, flank, steak, separable lean only")],
  ]);

  it("passes when the survivor is in the shipped index", () => {
    expect(
      assertCollapsedRowsShip([{ fdcId: 168628 }, { fdcId: 999 }], collapsed)
    ).toBe(2);
  });

  it("refuses a corpus a later pass has taken the survivor out of", () => {
    // The deliberate break the check exists for, and it cannot be produced by
    // the pipeline as it stands — the collapse runs last and picks its
    // representative out of the group it is collapsing. What the assertion
    // guards is the pipeline nobody has written yet: a filter, a rename or a
    // drop added AFTER the collapse takes 168628 and leaves two rows pointing at
    // nothing. Written here as that pass, so the failure is proved rather than
    // asserted.
    expect(() => assertCollapsedRowsShip([{ fdcId: 999 }], collapsed)).toThrow(
      /collapsed into\s+168628, and that row is not in the shipped index/
    );
  });

  it("names the row that lost its survivor, in the words it shipped under", () => {
    expect(() => assertCollapsedRowsShip([], collapsed)).toThrow(
      /"Beef, flank, steak, separable lean and fat, trimmed to 0" fat, choice" \(168627\)/
    );
  });
});

describe("collapseReach — what the rule lands on, per head phrase", () => {
  const before = [
    survivor(1, "Beef, flank, steak, separable lean and fat", 10),
    survivor(2, "Beef, flank, steak, separable lean and fat, choice", 20),
    survivor(3, "Lamb, loin chop", 10),
  ];

  it("counts only the heads that moved, fullest first", () => {
    const { survivors } = collapseCorpus(before, app);
    expect(collapseReach(before, survivors, app)).toEqual([
      { head: "Beef", rows: 2, after: 1, absorbed: 1 },
    ]);
  });

  it("names the four heads that MOVE, which is not the seven it reaches", () => {
    // ADR-0103's hand-off named six. `Nuts` and `Seeds` moved only under the
    // preparation axis, which left the roster with ADR-0104 (#434): the eight
    // roasted nut and seed rows are ingredients as bought, and collapsing a
    // roasted chestnut onto a raw one would have deleted a row ADR-0104 argued
    // for. Seven heads carry a segment the roster claims and only four hold a
    // group of more than one row, so the roster names moves rather than reach —
    // `Game meat` states a separation on six bison records and no two of them
    // share a residual description.
    expect(HEADS_THE_COLLAPSE_MOVES).toEqual(["Beef", "Lamb", "Pork", "Veal"]);
  });

  it("refuses a generation in which a head arrives or leaves", () => {
    expect(
      assertCollapseReach([
        { head: "Veal" },
        { head: "Beef" },
        { head: "Lamb" },
        { head: "Pork" },
      ])
    ).toBe(4);
    expect(() =>
      assertCollapseReach([
        { head: "Beef" },
        { head: "Lamb" },
        { head: "Pork" },
      ])
    ).toThrow(/moves 3 head phrases \(Beef, Lamb, Pork\)/);
    expect(() =>
      assertCollapseReach([
        { head: "Beef" },
        { head: "Chicken" },
        { head: "Lamb" },
        { head: "Pork" },
        { head: "Veal" },
      ])
    ).toThrow(/Chicken/);
  });
});

describe("applyCollapsedNames — §5's strip, licensed by the collapse", () => {
  // The half #435 deliberately left undone. A survivor shipped under the name
  // USDA published, so `beef` led with `Beef, composite of trimmed retail cuts,
  // separable lean and fat, trimmed to 0" fat, choice` rather than the four
  // words that name it.

  it("ships a merged group's representative under its residual name", () => {
    const flank = [
      survivor(
        168627,
        'Beef, flank, steak, separable lean and fat, trimmed to 0" fat, choice',
        40
      ),
      survivor(
        168628,
        'Beef, flank, steak, separable lean and fat, trimmed to 0" fat, select',
        42
      ),
    ];
    const { survivors, licensed } = collapseCorpus(flank, app);
    const named = applyCollapsedNames(survivors, licensed, app);
    expect(named.survivors.map((row) => row.food.description)).toEqual([
      "Beef, flank, steak",
    ]);
    expect(named.tally).toEqual({ stripped: 1, refused: 0 });
  });

  it("leaves a group of one whole, because nothing licensed the strip", () => {
    // §5's own example, and the reason the licence cannot be read off a name.
    // `Quinoa, cooked` is the only quinoa USDA publishes; strip it and the
    // corpus claims raw quinoa over a cooked panel. A lone trimmed steak is the
    // same case.
    const lone = [
      survivor(168627, 'Beef, flank, steak, trimmed to 0" fat, choice', 40),
    ];
    const { survivors, licensed } = collapseCorpus(lone, app);
    expect(licensed.size).toBe(0);
    const named = applyCollapsedNames(survivors, licensed, app);
    expect(named.survivors.map((row) => row.food.description)).toEqual([
      'Beef, flank, steak, trimmed to 0" fat, choice',
    ]);
    expect(named.tally).toEqual({ stripped: 0, refused: 0 });
  });

  it("leaves a group with no eligible row whole, however many merged", () => {
    // ADR-0103's 2026-09-12 Amendment, and the sentence #435 shipped five
    // instances of: what a coverage hole forbids is the STRIP, never the row.
    // Struck, this would claim a whole flank over a panel that measured the fat
    // trimmed off one.
    const fractions = [
      survivor(173078, "Beef, flank, separable lean only", 30),
      survivor(173079, "Beef, flank, separable fat", 44),
    ];
    const { survivors, licensed, groups_shipped_whole } = collapseCorpus(
      fractions,
      app
    );
    expect([licensed.size, groups_shipped_whole]).toEqual([0, 1]);
    expect(
      applyCollapsedNames(survivors, licensed, app).survivors.map(
        (row) => row.food.description
      )
    ).toEqual(["Beef, flank, separable fat"]);
  });

  it("refuses a strip into a name another row already answers to", () => {
    // ADR-0062 §3, not ADR-0056 §4: there is no origin here to say which of two
    // rows loses, and a collapse that DELETED one would contradict the ground
    // §6 fires it on. So the rename is simply not made and the row keeps the
    // name it has.
    const { survivors, licensed } = collapseCorpus(
      [
        survivor(1, "Beef, flank, steak, separable lean and fat", 40),
        survivor(2, "Beef, flank, steak, separable lean and fat, choice", 42),
      ],
      app
    );
    // The licence is real — that group merged and its representative is
    // eligible — and the third row is a different food that answers to the name
    // the strip would leave. `steaks` rather than `steak` because the collision
    // is judged on STEMS: the search already treats the two as one word, so
    // shipping both would put two rows a letter apart side by side.
    const contested = [...survivors, survivor(3, "Beef, flank, steaks", 10)];
    const named = applyCollapsedNames(contested, licensed, app);
    expect(named.tally).toEqual({ stripped: 0, refused: 1 });
    expect(named.survivors.map((row) => row.food.description)).toEqual([
      "Beef, flank, steak, separable lean and fat, choice",
      "Beef, flank, steaks",
    ]);
  });

  it("counts an alias as a name that can refuse a strip", () => {
    // `bestNameKey` ranks a query against an alias exactly as against a
    // description, so a guard reading only descriptions would call a name free
    // while a second row still answered to it (ADR-0056 §3).
    const rows = [
      survivor(1, "Beef, flank, steak, separable lean and fat", 40),
      {
        ...survivor(2, "Beef, flank, bavette", 10),
        also: ["Beef, flank, steak"],
      },
    ];
    const named = applyCollapsedNames(rows, new Set([1]), app);
    expect(named.tally).toEqual({ stripped: 0, refused: 1 });
  });
});

describe("assertNamesClaimNoLess — §5 asserted, not assumed", () => {
  // A safety rule that is assumed is not one. Each case below is a way the
  // strip could quietly start claiming a food the panel did not measure.

  const published = [
    survivor(
      168627,
      'Beef, flank, steak, separable lean and fat, trimmed to 0" fat, choice',
      40
    ),
  ];

  it("passes the strip it licensed", () => {
    expect(
      assertNamesClaimNoLess(
        published,
        [survivor(168627, "Beef, flank, steak", 40)],
        new Set([168627]),
        app
      )
    ).toBe(1);
  });

  it("counts nothing where no name moved", () => {
    expect(assertNamesClaimNoLess(published, published, new Set(), app)).toBe(
      0
    );
  });

  it("refuses a name shortened without a licence", () => {
    expect(() =>
      assertNamesClaimNoLess(
        published,
        [survivor(168627, "Beef, flank, steak", 40)],
        new Set(),
        app
      )
    ).toThrow(/merged nothing, or held no record eligible/);
  });

  it("refuses a name that lost a non-preferred segment", () => {
    // The `separable lean only` case §5 names: a whole steak claimed over a
    // panel that measured a fraction of one. `residualDescription` strikes the
    // segment out, so only the LICENCE stands between this and shipping — and
    // the assertion is what proves the licence was the thing that stopped it.
    expect(() =>
      assertNamesClaimNoLess(
        [survivor(1, "Beef, flank, steak, separable lean only", 40)],
        [survivor(1, "Beef, flank, steak", 40)],
        new Set([1]),
        app
      )
    ).toThrow(/non-preferred value on the separation axis/);
  });

  it("refuses a name that lost anything but its residual description", () => {
    // Not "fewer segments" — the same segments, spelled the same way. A strip
    // that reached into a kept segment would pass a count and fail here.
    expect(() =>
      assertNamesClaimNoLess(
        published,
        [survivor(168627, "Beef, steak", 40)],
        new Set([168627]),
        app
      )
    ).toThrow(/its residual description is "Beef, flank, steak"/);
  });
});

describe("assertNoAxisHidesInAGloss — the trap that has fired three times", () => {
  // §10 calls the positional rule the whole safety argument and then states its
  // cost: a segment may carry more than one fact. Every one of the three bites
  // on this map was the same shape — a bracket welded to the end of a segment,
  // so a whole-segment pattern walks past a word it was written to take.

  it("reads the corpus's own brackets without complaint", () => {
    // `leg (ham)` and `blade (chops or roasts)` are USDA naming a cut, and
    // `(Boston butt)` is a cut too. Nothing behind these brackets is an axis.
    expect(
      assertNoAxisHidesInAGloss(
        [
          survivor(
            1,
            "Pork, fresh, leg (ham), rump half, separable lean and fat"
          ),
          survivor(2, "Pork, fresh, loin, blade (chops or roasts), bone-in"),
          survivor(3, "Cabbage, chinese (pe-tsai)"),
        ],
        app
      )
    ).toBe(9);
  });

  for (const [what, description] of [
    [
      "a designation tag",
      "Beef, flank, steak, separable lean and fat, choice (Alaska Native)",
    ],
    [
      "the Food Distribution Program gloss",
      "Beef, flank, steak, choice (Includes foods for USDA's Food Distribution Program)",
    ],
    [
      "a handling hedge",
      'Beef, flank, steak, trimmed to 0" fat (may have been previously frozen)',
    ],
  ] as const)
    it(`refuses a generation where ${what} hides a segment`, () => {
      // All three reach the collapse only if an earlier pass has stopped taking
      // them. ADR-0056's strip takes the tag and both glosses today, so the
      // guard fires on none of them over the shipped corpus — which is exactly
      // why it is asked of a fixture here rather than left to be proved by a
      // green generation.
      expect(() =>
        assertNoAxisHidesInAGloss([survivor(1, description)], app)
      ).toThrow(/is how the designation tag/);
    });

  it("named the row that made the separation entry admit a gloss", () => {
    // What it found on the day it was written. USDA welds a provenance gloss to
    // one `separable fat` segment, and an entry reading the bare phrase walked
    // past it — so the roster's pattern admits the bracket, and this passes.
    // Admitting it cannot take the gloss's own fact with it, because the entry
    // is NON-PREFERRED: a record stating it never represents a group, so no
    // strip ever reaches the segment.
    const row = survivor(
      167877,
      "Pork, cured, separable fat (from ham and arm picnic)"
    );
    expect(assertNoAxisHidesInAGloss([row], app)).toBe(2);
    expect(mayRepresentGroup(row.food.description)).toBe(false);
  });
});
