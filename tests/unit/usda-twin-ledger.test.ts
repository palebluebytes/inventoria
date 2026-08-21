import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { importersOf } from "./support/importers";
import {
  TWIN_LEDGER,
  SPLIT_TWINS,
  MERGED_TWINS,
  SPLIT_TWIN_NDB_NUMBERS,
  twinVerdictOf,
  type TwinReasonCode,
} from "../../src/lib/food/usda-twin-ledger";
import { fdcIdentityKey, resolveFdcGroup } from "../../src/lib/food/usda-fdc";
import {
  assertTwinLedgerCovers,
  groupByIdentity,
} from "../../scripts/usda-bundle.mjs";
import { TWIN_LEDGER_EXPORTS } from "../../scripts/usda-app-module.mjs";

// The adjudication behind every verdict here is `docs/research/145-twin-ledger.json`,
// and the criterion it was reached by is `145-twin-fusion-adjudication.md` §6.
// These tests lock the three together: the code ledger against the evidence, the
// key against the ledger, and the generator against both.

const research = JSON.parse(
  readFileSync("docs/research/145-twin-ledger.json", "utf8")
) as {
  pairs: {
    ndbNumber: number;
    foundation: { description: string };
    sr_legacy: { description: string };
    verdict: string;
    reason_code: string;
  }[];
};

const food = (fdcId: number, description: string, ndbNumber?: number) => ({
  fdcId,
  description,
  dataType: ndbNumber === undefined ? "SR Legacy" : "Foundation",
  foodNutrients: [],
  ...(ndbNumber === undefined ? {} : { ndbNumber }),
});

/** A group in the shape `groupByIdentity` builds, for the census check. */
const pair = (
  ndbNumber: number,
  foundation: string,
  sr_legacy: string
): Map<string | number, { food: ReturnType<typeof food> }[]> =>
  new Map([
    [
      ndbNumber,
      [
        { food: { ...food(1, foundation, ndbNumber), dataType: "Foundation" } },
        { food: { ...food(2, sr_legacy, ndbNumber), dataType: "SR Legacy" } },
      ],
    ],
  ]);

const app = {
  TWIN_LEDGER,
  SPLIT_TWIN_NDB_NUMBERS,
  stripArchiveBoilerplate: (d: string) => d,
};

describe("the twin ledger is the adjudication, not a second opinion of it", () => {
  it("carries exactly what docs/research/145-twin-ledger.json adjudicated", () => {
    // The research JSON is the evidence — it holds the reasoning and the fdcIds.
    // This file holds what the rule and the check need. Two artifacts is the
    // price of keeping 190 prose notes out of a user's bundle, and this is what
    // stops them drifting.
    expect(TWIN_LEDGER).toHaveLength(research.pairs.length);
    const mine = new Map(
      TWIN_LEDGER.map((e) => [e[0], [twinVerdictOf(e[1]), e[1], e[2], e[3]]])
    );
    for (const p of research.pairs)
      expect([p.ndbNumber, mine.get(p.ndbNumber)]).toEqual([
        p.ndbNumber,
        [
          p.verdict,
          p.reason_code,
          p.foundation.description,
          p.sr_legacy.description,
        ],
      ]);
  });

  it("splits eight pairs and no others", () => {
    // Named rather than counted, because the whole change is these eight and a
    // ninth arriving unannounced is exactly what a reviewer needs to see.
    expect([...SPLIT_TWIN_NDB_NUMBERS].sort((a, b) => a - b)).toEqual([
      2047, 5332, 9206, 9501, 11243, 12220, 16222, 20140,
    ]);
    expect(SPLIT_TWINS).toHaveLength(8);
    expect(MERGED_TWINS).toHaveLength(182);
  });

  it("never gives one reason code opposite verdicts", () => {
    // §7.3 of the pre-registration. Two pairs judged the same way and decided
    // differently is a contradiction in the adjudication, and it is greppable
    // only if the codes stay disjoint.
    const verdicts = new Map<TwinReasonCode, Set<string>>();
    for (const [, reason] of TWIN_LEDGER)
      (
        verdicts.get(reason) ?? verdicts.set(reason, new Set()).get(reason)!
      ).add(twinVerdictOf(reason));
    for (const [reason, seen] of verdicts)
      expect([reason, seen.size]).toEqual([reason, 1]);
  });

  it("stays out of the app's bundle", () => {
    // The arrangement `food-vocabulary.ts` documents: the generator reaches this
    // module through the esbuild seam, and nothing a user downloads imports it.
    // 190 rows of adjudication in the app bundle would be dead weight on every
    // page load.
    expect(TWIN_LEDGER_EXPORTS).toEqual([
      "TWIN_LEDGER",
      "SPLIT_TWIN_NDB_NUMBERS",
    ]);
    expect(importersOf("usda-twin-ledger")).toEqual([]);
  });
});

describe("fdcIdentityKey — a refused pair never meets", () => {
  it("keys a split pair's records apart, and a merged pair's together", () => {
    const honeycrisp = food(
      1750343,
      "Apples, honeycrisp, with skin, raw",
      9501
    );
    const golden = food(
      168202,
      "Apples, raw, golden delicious, with skin",
      9501
    );
    expect(fdcIdentityKey(honeycrisp, SPLIT_TWIN_NDB_NUMBERS)).not.toBe(
      fdcIdentityKey(golden, SPLIT_TWIN_NDB_NUMBERS)
    );

    // 9500 is the red delicious pair, adjudicated `rename`. The two cultivars
    // above and the one rename below differ only in the ledger's verdict, which
    // is the point: nothing about the records themselves says split.
    const a = food(1, "Apples, red delicious, with skin, raw", 9500);
    const b = food(2, "Apples, raw, red delicious, with skin", 9500);
    expect(fdcIdentityKey(a, SPLIT_TWIN_NDB_NUMBERS)).toBe(
      fdcIdentityKey(b, SPLIT_TWIN_NDB_NUMBERS)
    );
  });

  it("cannot collide a split key with a plain one or a description key", () => {
    // `9501:1750343` has to be unreachable by any other record: a number alone
    // is what an unsplit twin keys as, and `desc:` is what a record with no
    // ndbNumber keys as.
    const split = fdcIdentityKey(
      food(1750343, "Apples, honeycrisp, with skin, raw", 9501),
      SPLIT_TWIN_NDB_NUMBERS
    );
    expect(split).toBe("9501:1750343");
    expect(
      fdcIdentityKey(food(7, "Grapes", 9132), SPLIT_TWIN_NDB_NUMBERS)
    ).toBe(9132);
    expect(fdcIdentityKey(food(8, "Cocoa nibs"), SPLIT_TWIN_NDB_NUMBERS)).toBe(
      "desc:cocoa nibs"
    );
  });

  it("keeps an ndbNumber of 0, which a falsy test would discard", () => {
    // `??` and `||` disagree here, and `||` would send the record to the
    // description key and merge it with every other record USDA numbered 0.
    expect(
      fdcIdentityKey(food(9, "Something", 0), SPLIT_TWIN_NDB_NUMBERS)
    ).toBe(0);
  });

  it("leaves the merge itself alone — a split pair is simply never grouped", () => {
    // `resolveFdcGroup` is untouched by this record. Handed the pair anyway it
    // still fills, which is why the refusal has to happen at the key.
    const honeycrisp = food(
      1750343,
      "Apples, honeycrisp, with skin, raw",
      9501
    );
    const golden = food(
      168202,
      "Apples, raw, golden delicious, with skin",
      9501
    );
    expect(resolveFdcGroup([honeycrisp, golden]).food.fdcId).toBe(1750343);
  });
});

describe("assertTwinLedgerCovers — the census fails in both directions", () => {
  it("is asked what USDA numbered alike, not what the adjudication left", () => {
    // The bug this pins cost a generation run. A split pair's two records key
    // APART, so a census asked after the splits are applied sees no pair at all
    // and reports every split entry as one the archives no longer produce —
    // the ledger's eight true findings arriving as eight false alarms.
    const entries = [
      { food: food(1750343, "Apples, honeycrisp, with skin, raw", 9501) },
      {
        food: {
          ...food(168202, "Apples, raw, golden delicious, with skin", 9501),
          dataType: "SR Legacy",
        },
      },
    ];
    const stub = { ...app, fdcIdentityKey };

    expect(groupByIdentity(entries, stub, new Set()).size).toBe(1);
    expect(groupByIdentity(entries, stub, SPLIT_TWIN_NDB_NUMBERS).size).toBe(2);
  });

  it("passes when every pair the archives make is adjudicated", () => {
    expect(
      assertTwinLedgerCovers(pair(9501, SPLIT_TWINS[3][2], SPLIT_TWINS[3][3]), {
        ...app,
        TWIN_LEDGER: [SPLIT_TWINS[3]],
      })
    ).toBe(1);
  });

  it("refuses a twin pair nobody has adjudicated", () => {
    expect(() =>
      assertTwinLedgerCovers(pair(9132, "Grapes, red", "Grapes, green"), {
        ...app,
        TWIN_LEDGER: [],
      })
    ).toThrow(/no twin-ledger verdict for ndbNumber 9132/);
  });

  it("refuses a verdict about words the archives no longer hold", () => {
    // A Foundation rename under a ledgered number lands here rather than
    // silently reusing a judgement about a different name.
    expect(() =>
      assertTwinLedgerCovers(
        pair(9501, "Apples, honeycrisp, raw", SPLIT_TWINS[3][3]),
        { ...app, TWIN_LEDGER: [SPLIT_TWINS[3]] }
      )
    ).toThrow(/no twin-ledger verdict for ndbNumber 9501/);
  });

  it("refuses a ledger entry the archives never produce", () => {
    expect(() =>
      assertTwinLedgerCovers(new Map(), {
        ...app,
        TWIN_LEDGER: [SPLIT_TWINS[3]],
      })
    ).toThrow(/1 entry the archives no longer produce/);
  });

  it("refuses a group that is not one Foundation and one SR Legacy record", () => {
    // Measured over both archives, all 190 twin groups hold exactly two records
    // of one type each. A third would be a change in USDA's data this ledger has
    // never been asked about, and defaulting would hide it.
    const three = new Map([
      [
        9501,
        [
          { food: { ...food(1, "a", 9501), dataType: "Foundation" } },
          { food: { ...food(2, "b", 9501), dataType: "SR Legacy" } },
          { food: { ...food(3, "c", 9501), dataType: "SR Legacy" } },
        ],
      ],
    ]);
    expect(() =>
      assertTwinLedgerCovers(three, { ...app, TWIN_LEDGER: [] })
    ).toThrow(/3 records share the identity/);
  });
});
