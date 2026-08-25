import { describe, it, expect } from "vitest";
import { importersOf } from "./support/importers";
import {
  ORIGIN_QUALIFIERS,
  carriesOriginQualifier,
  resolveShippedNames,
  stripNonNamingQualifiers,
} from "../../src/lib/food/usda-shipped-name";

// The rename that takes USDA's commercial origin qualifiers out of a reference
// food's name, and the corpus-wide guard that decides where it may not run.
//
// Every description here is a real corpus row, because a naming rule tuned
// against invented descriptions is tuned against nothing. The spinach cases are
// the whole reason the rule is positional rather than lexical — see ADR-0056 §2.

describe("stripNonNamingQualifiers", () => {
  it("removes an origin word that occupies a whole qualifier part", () => {
    expect(
      stripNonNamingQualifiers(
        "Lamb, New Zealand, imported, loin chop, separable lean and fat, raw"
      )
    ).toBe("Lamb, loin chop, separable lean and fat, raw");
  });

  it("preserves USDA's casing in the parts it keeps", () => {
    // `qualifiersOf` lowercases, so a rewrite built by rejoining ITS parts would
    // ship "beef, wagyu, …". The kept text comes off the original string.
    expect(
      stripNonNamingQualifiers(
        "Beef, Australian, imported, Wagyu, external fat, Aust. marble score 4/5, raw"
      )
    ).toBe("Beef, Wagyu, external fat, Aust. marble score 4/5, raw");
  });

  it("strips a country that stands alone, without `imported` beside it", () => {
    expect(
      stripNonNamingQualifiers(
        "Veal, Australian, rib, rib roast, separable lean only, raw"
      )
    ).toBe("Veal, rib, rib roast, separable lean only, raw");
  });

  it("never touches an origin word inside the head phrase", () => {
    // New Zealand spinach is Tetragonia, a different plant from Spinacia. The
    // positional rule is what protects it, and it is the only thing that can:
    // the corpus holds no `Spinach, raw` row, so a collision guard sees nothing
    // to collide with and would let the rename through. ADR-0055 §7 refused a
    // lexical place-word rule for exactly this case.
    for (const description of [
      "New Zealand spinach, raw",
      "New Zealand spinach, cooked, boiled, drained, without salt",
      "New zealand spinach, cooked, boiled, drained, with salt",
    ]) {
      expect([description, stripNonNamingQualifiers(description)]).toEqual([
        description,
        description,
      ]);
    }
  });

  it("leaves an abbreviated origin alone when it is only part of a qualifier", () => {
    // `Aust. marble score 9` is a grade, not an origin part. Reaching it would
    // need a second, lexical rule — the kind that broke the spinach.
    const description =
      "Beef, Wagyu, loin, top loin steak/roast, boneless, separable lean only, Aust. marble score 9, raw";
    expect(stripNonNamingQualifiers(description)).toBe(description);
  });

  it("returns a name with no origin part byte-for-byte unchanged", () => {
    // Not merely equal after renormalising: a row that is not being renamed must
    // not have its whitespace quietly rewritten by passing through the splitter.
    for (const description of [
      "Grapes, red, seedless, raw",
      "Game meat , bison, ground, raw",
      "Spinach, cooked, boiled, drained, without salt",
    ]) {
      expect([description, stripNonNamingQualifiers(description)]).toEqual([
        description,
        description,
      ]);
    }
  });

  it("removes USDA's offal aisle label wherever it is a whole part", () => {
    // Part 1 for beef, veal and lamb; part 2 for pork, which writes `fresh`
    // first. Positional but not fixed-position, which is why the roster is asked
    // of every qualifier rather than of an index.
    expect(
      stripNonNamingQualifiers(
        "Beef, variety meats and by-products, liver, raw"
      )
    ).toBe("Beef, liver, raw");
    expect(
      stripNonNamingQualifiers(
        "Pork, fresh, variety meats and by-products, chitterlings, cooked, simmered"
      )
    ).toBe("Pork, fresh, chitterlings, cooked, simmered");
  });

  it("reads an origin only where it is a qualifier of its own", () => {
    // The predicate the collision tiebreak turns on, asserted against names
    // whose answer is NOT "did the strip change it": the aisle-label row is
    // renamed but names no origin, and the spinach row names one that the
    // positional rule will never remove.
    for (const [description, expected] of [
      ["Beef, variety meats and by-products, liver, raw", false],
      ["Lamb, New Zealand, imported, neck chops, raw", true],
      ["Veal, Australian, separable fat, raw", true],
      ["New Zealand spinach, raw", false],
      ["Grapes, red, seedless, raw", false],
    ] as const) {
      expect([description, carriesOriginQualifier(description)]).toEqual([
        description,
        expected,
      ]);
    }
  });
});

describe("resolveShippedNames", () => {
  // The four organs USDA publishes twice — once plain, once as a New Zealand
  // import — plus the rows that prove where the rule stops.
  const rows = [
    {
      fdcId: 168625,
      description: "Beef, variety meats and by-products, heart, raw",
    },
    {
      fdcId: 174723,
      description:
        "Beef, New Zealand, imported, variety meats and by-products, heart, raw",
    },
    {
      fdcId: 173081,
      description:
        "Beef, New Zealand, imported, variety meats and by-products, heart, cooked, boiled",
    },
    {
      fdcId: 169449,
      description: "Beef, variety meats and by-products, kidneys, raw",
    },
    {
      fdcId: 174727,
      description:
        "Beef, New Zealand, imported, variety meats and by-products, kidney, raw",
    },
    {
      fdcId: 169451,
      description: "Beef, variety meats and by-products, liver, raw",
    },
    {
      fdcId: 174729,
      description:
        "Beef, New Zealand, imported, variety meats and by-products, liver, raw",
    },
    {
      fdcId: 174728,
      description:
        "Beef, New Zealand, imported, variety meats and by-products liver, cooked, boiled",
    },
    {
      fdcId: 173095,
      description:
        "Beef, New Zealand, imported, variety meats and by-products, tripe cooked, boiled",
    },
    // The lamb pair USDA files under two different conventions: the aisle label
    // on one side, the import on the other. BOTH are renamed, and the collision
    // is still decided by which of them named an origin.
    {
      fdcId: 172527,
      description: "Lamb, variety meats and by-products, heart, raw",
    },
    { fdcId: 174444, description: "Lamb, New Zealand, imported, heart, raw" },
    {
      fdcId: 174443,
      description:
        "Lamb, New Zealand, imported, heart, cooked, soaked and simmered",
    },
    {
      fdcId: 172621,
      description: "Lamb, New Zealand, imported, tongue - swiss cut, raw",
    },
    { fdcId: 168440, description: "New Zealand spinach, raw" },
    {
      fdcId: 168463,
      description: "Spinach, cooked, boiled, drained, without salt",
    },
    { fdcId: 167532, description: "Bread, white wheat" },
  ];

  it("drops the import whose stripped name an existing row already carries", () => {
    const { dropped } = resolveShippedNames(rows);
    expect(dropped.get(174723)).toBe("collision");
    expect(dropped.get(169451)).toBeUndefined();
  });

  it("catches a collision that only the stemmer can see", () => {
    // USDA writes the plain row `kidneys` and the import `kidney`. The strings
    // differ, but `stemOf` drops the trailing s, so search already treats them
    // as one word — two rows a letter apart, side by side, is the duplicate the
    // guard exists to prevent.
    const { dropped } = resolveShippedNames(rows);
    expect(dropped.get(174727)).toBe("collision");
  });

  it("drops the other preparations of a food whose import was dropped", () => {
    // Otherwise the corpus keeps a boiled liver from one herd beside a raw liver
    // from another, disagreeing several-fold with nothing on screen to say why.
    const { dropped } = resolveShippedNames(rows);
    expect(dropped.get(173081)).toBe("preparation_sibling");
    expect(dropped.get(174728)).toBe("preparation_sibling");
  });

  it("matches preparations across a missing comma in USDA's own text", () => {
    // 174728 is written `…by-products liver, cooked, boiled` — no comma before
    // the organ. A part-wise food key misses it; the key is a stemmed word set
    // for that reason.
    const { dropped } = resolveShippedNames(rows);
    expect(dropped.get(174728)).toBe("preparation_sibling");
  });

  it("keeps an import that no plain row contests", () => {
    // Tripe is New Zealand-only. Dropping it would delete tripe from the app,
    // which is ADR-0055 §1's line and the reason mutton survives.
    const { dropped, renamed } = resolveShippedNames(rows);
    expect(dropped.get(173095)).toBeUndefined();
    expect(renamed.get(173095)).toBe("Beef, tripe cooked, boiled");
  });

  it("neither renames nor drops a head-phrase origin", () => {
    const { dropped, renamed } = resolveShippedNames(rows);
    expect(dropped.get(168440)).toBeUndefined();
    expect(renamed.get(168440)).toBeUndefined();
  });

  it("leaves a row with nothing to strip out of both verdicts", () => {
    const { dropped, renamed } = resolveShippedNames(rows);
    for (const fdcId of [167532, 168463]) {
      expect([fdcId, dropped.get(fdcId), renamed.get(fdcId)]).toEqual([
        fdcId,
        undefined,
        undefined,
      ]);
    }
  });

  it("renames a row that carries only the aisle label, and never drops it", () => {
    const { dropped, renamed } = resolveShippedNames(rows);
    expect(dropped.get(168625)).toBeUndefined();
    expect(renamed.get(168625)).toBe("Beef, heart, raw");
    expect(renamed.get(169449)).toBe("Beef, kidneys, raw");
  });

  it("decides a collision by origin even when both names changed", () => {
    // `Lamb, variety meats and by-products, heart, raw` and
    // `Lamb, New Zealand, imported, heart, raw` both become `Lamb, heart, raw`.
    // Neither kept its name, so "was it renamed" cannot break the tie; the
    // import is the one that goes, because the origin is what it was telling
    // apart.
    const { dropped, renamed } = resolveShippedNames(rows);
    expect(dropped.get(174444)).toBe("collision");
    expect(dropped.get(172527)).toBeUndefined();
    expect(renamed.get(172527)).toBe("Lamb, heart, raw");
  });

  it("follows a dropped import through USDA's `soaked and` preparations", () => {
    // The imported heart is published raw and `cooked, soaked and simmered`.
    // Without `soaked` in the preparation set the cooked one survives its own
    // raw sibling and sits beside three US hearts, sourced differently and
    // unmarked — the exact incoherence the sibling rule exists to prevent.
    const { dropped } = resolveShippedNames(rows);
    expect(dropped.get(174443)).toBe("preparation_sibling");
  });

  it("keeps an imported cut that has no counterpart to collide with", () => {
    // `tongue - swiss cut` is a New Zealand butchery term with no US twin, so
    // nothing contests its stripped name and it stays. A drop here follows a
    // name being taken, never the fact that a row was imported.
    const { dropped, renamed } = resolveShippedNames(rows);
    expect(dropped.get(172621)).toBeUndefined();
    expect(renamed.get(172621)).toBe("Lamb, tongue - swiss cut, raw");
  });

  it("never reports a row as both renamed and dropped", () => {
    const { dropped, renamed } = resolveShippedNames(rows);
    for (const fdcId of renamed.keys())
      expect(dropped.get(fdcId)).toBeUndefined();
  });
});

describe("the roster", () => {
  it("holds only the three commercial origin qualifiers", () => {
    // The six cultural designation tags — (Alaska Native), (Navajo), (Apache),
    // (Northern Plains Indians), (Klamath), (Hopi) — are deliberately absent.
    // ADR-0055 §4 demotes that category on a tie and §1 forbids dropping it;
    // rewriting its names would assert those rows are general-population
    // reference values, which is not what USDA published them as.
    expect([...ORIGIN_QUALIFIERS].sort()).toEqual([
      "australian",
      "imported",
      "new zealand",
    ]);
  });
});

describe("the rename stays out of the app's bundle", () => {
  it("is reached only through the generator's esbuild seam", () => {
    // The same arrangement `usda-food-kind.ts`, `food-vocabulary.ts` and
    // `usda-twin-ledger.ts` use: the corpus is renamed once, ahead of time, and
    // what ships is the finished names (ADR-0047 §4).
    expect(importersOf("usda-shipped-name")).toEqual([]);
  });
});
