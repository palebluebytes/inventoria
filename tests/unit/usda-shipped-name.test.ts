import { describe, it, expect } from "vitest";
import { importersOf } from "./support/importers";
import {
  ADJUDICATED_NAMES,
  FORTIFICATION_QUALIFIERS,
  ORIGIN_QUALIFIERS,
  carriesOriginQualifier,
  resolveShippedNames,
  stripDesignationTag,
  stripFortificationQualifier,
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

  it("removes USDA's averaged-sample qualifiers", () => {
    // `all grades` averages USDA's beef grades; `all classes` averages poultry
    // classes, the bird's market category by age and sex. Neither says which
    // food the row is, and the rows that DO name a single grade or class keep
    // the word that names it, so nothing converges on them.
    expect(
      stripNonNamingQualifiers(
        "Beef, brisket, whole, separable lean only, all grades, raw"
      )
    ).toBe("Beef, brisket, whole, separable lean only, raw");
    expect(
      stripNonNamingQualifiers("Chicken, liver, all classes, cooked, pan-fried")
    ).toBe("Chicken, liver, cooked, pan-fried");
    expect(
      stripNonNamingQualifiers(
        "Turkey, all classes, breast, meat and skin, raw"
      )
    ).toBe("Turkey, breast, meat and skin, raw");
  });

  it("leaves a qualifier that names one grade rather than averaging them", () => {
    // The line between the two. `choice`, `select` and `Aust. marble score 9`
    // each pick a grade, so each still tells two rows apart; `all grades` picks
    // none. Removing a naming grade would fuse rows with different fat.
    for (const description of [
      'Beef, chuck, arm pot roast, separable lean only, trimmed to 0" fat, choice, raw',
      'Beef, rib, small end (ribs 10-12), separable lean only, trimmed to 0" fat, select, cooked, broiled',
      "Beef, Wagyu, seam fat, Aust. marble score 4/5, raw",
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

describe("stripDesignationTag", () => {
  it("removes the trailing population tag", () => {
    expect(stripDesignationTag("Sea cucumber, yane (Alaska Native)")).toBe(
      "Sea cucumber, yane"
    );
    expect(
      stripDesignationTag(
        "Buffalo, free range, top round steak, raw (Shoshone Bannock)"
      )
    ).toBe("Buffalo, free range, top round steak, raw");
  });

  it("keeps brackets USDA uses for anything else", () => {
    // The roster is matched against, never "the last bracketed thing": these
    // names bracket a local name, a species and a synonym, and the first one
    // brackets BOTH kinds at once.
    expect(
      stripDesignationTag("Seal, bearded (Oogruk), meat, raw (Alaska Native)")
    ).toBe("Seal, bearded (Oogruk), meat, raw");
    for (const kept of [
      "Acerola, (west indian cherry), raw",
      "Cabbage, chinese (pe-tsai), raw",
      "Salsify, (vegetable oyster), raw",
    ])
      expect([kept, stripDesignationTag(kept)]).toEqual([kept, kept]);
  });
});

describe("stripFortificationQualifier", () => {
  it("removes a fortification part in either polarity", () => {
    // Both halves say the same thing about the food — that it is milk of that
    // fat level — and stripping only the `with` half would leave the others
    // carrying a phrase whose whole meaning is the contrast with a row that no
    // longer states it.
    expect(
      stripFortificationQualifier("Milk, goat, fluid, with added vitamin D")
    ).toBe("Milk, goat, fluid");
    expect(
      stripFortificationQualifier(
        "Milk, evaporated, 2% fat, with added vitamin A and vitamin D"
      )
    ).toBe("Milk, evaporated, 2% fat");
    expect(
      stripFortificationQualifier(
        "Milk, fluid, 1% fat, without added vitamin A and vitamin D"
      )
    ).toBe("Milk, fluid, 1% fat");
    expect(
      stripFortificationQualifier(
        "Cheese, pasteurized process, American, without added vitamin D"
      )
    ).toBe("Cheese, pasteurized process, American");
  });

  it("keeps a gloss USDA wrote without a comma, on the part before it", () => {
    // The one row whose fortification phrase is not a part of its own: USDA
    // types no comma before the bracket, so the phrase and the gloss are ONE
    // part. Losing the gloss would take `skim` out of the corpus, and
    // ADR-0049's `skimmed milk` key expands to exactly that word.
    expect(
      stripFortificationQualifier(
        "Milk, nonfat, fluid, without added vitamin A and vitamin D (fat free or skim)"
      )
    ).toBe("Milk, nonfat, fluid (fat free or skim)");
  });

  it("never reads `fortified` as a fortification phrase", () => {
    // ADR-0062 §2 keeps the word off the roster in all four spellings USDA
    // uses, because it names a DIFFERENT food. The protein-fortified 2% milk
    // carried 3.95 g of protein against the plain row's 3.30, and the cheese
    // still in the corpus is 371 kcal against the fortified row's 366.
    for (const description of [
      "Cheese, pasteurized process, American, vitamin D fortified",
      "Cheese product, pasteurized process, American, reduced fat, fortified with vitamin D",
      "Milk, reduced fat, fluid, 2% milkfat, protein fortified, with added vitamin A and vitamin D",
      "Wheat flour, white, all-purpose, enriched, calcium-fortified",
      "Peanut butter, smooth, vitamin and mineral fortified",
    ]) {
      expect([
        description,
        stripFortificationQualifier(description).includes("fortified"),
      ]).toEqual([description, true]);
    }
  });

  it("returns a name with nothing to strip byte-for-byte unchanged", () => {
    for (const description of [
      "Milk, whole, 3.7% milkfat",
      "Game meat , bison, ground, raw",
      "Beverages, Cocoa mix, low calorie, powder, with added calcium, phosphorus, aspartame, without added sodium or vitamin A",
      "Applesauce, unsweetened, with added vitamin C",
    ]) {
      expect([description, stripFortificationQualifier(description)]).toEqual([
        description,
        description,
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

  it("settles a designation collision on the fuller panel, not on provenance", () => {
    // Both frybreads are designated, so no fact about who the record was
    // published for can choose between them — which is why the tiebreak reads
    // the panel instead. The untagged row keeps the name; the thinner one goes.
    const pair = [
      {
        fdcId: 1,
        description: "Frybread, made with lard (Navajo)",
        panelFields: 72,
      },
      {
        fdcId: 2,
        description: "Frybread, made with lard (Apache)",
        panelFields: 73,
      },
      {
        fdcId: 3,
        description: "Sea cucumber, yane (Alaska Native)",
        panelFields: 13,
      },
    ];
    const { renamed, dropped } = resolveShippedNames(pair);
    expect(dropped.get(1)).toBe("designation_collision");
    expect(renamed.get(2)).toBe("Frybread, made with lard");
    expect(renamed.get(1)).toBeUndefined();
    expect(renamed.get(3)).toBe("Sea cucumber, yane");
  });

  it("lets a designated row beat an undesignated one on completeness", () => {
    // The rule is not "the general row wins". Measured over the corpus, the
    // Alaska Native chum salmon carries 112 nutrient fields against the general
    // row's 70, and it is the general row that goes.
    const pair = [
      {
        fdcId: 1,
        description: "Fish, Salmon, Chum, raw (Alaska Native)",
        panelFields: 112,
      },
      { fdcId: 2, description: "Fish, salmon, chum, raw", panelFields: 70 },
    ];
    const { renamed, dropped } = resolveShippedNames(pair);
    expect(dropped.get(2)).toBe("designation_collision");
    expect(renamed.get(1)).toBe("Fish, Salmon, Chum, raw");
  });

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

describe("resolveShippedNames — a fortification rename that would collide", () => {
  // The margarine aisle, where USDA publishes the same spread twice: once
  // saying it has added vitamin D, once saying nothing. Plus the two rows the
  // strip reaches cleanly, so the same corpus shows both sides of the rule.
  const rows = [
    {
      fdcId: 171435,
      description:
        "Margarine, regular, 80% fat, composite, stick, with salt, with added vitamin D",
    },
    {
      fdcId: 172346,
      description: "Margarine, regular, 80% fat, composite, stick, with salt",
    },
    {
      fdcId: 171040,
      description:
        "Margarine, regular, 80% fat, composite, stick, without salt, with added vitamin D",
    },
    {
      fdcId: 173585,
      description:
        "Margarine, regular, 80% fat, composite, stick, without salt",
    },
    {
      fdcId: 171434,
      description:
        "Margarine-like, vegetable oil spread, approximately 37% fat, unspecified oils, with salt, with added vitamin D",
    },
    { fdcId: 171278, description: "Milk, goat, fluid, with added vitamin D" },
  ];

  it("leaves both rows of a contested pair exactly as USDA wrote them", () => {
    // An ugly name is the price of not merging two foods, and it is a price
    // ADR-0062 §3 pays deliberately: unlike ADR-0056 §4 there is no origin here
    // to say which row should lose, so neither does.
    const { renamed, dropped } = resolveShippedNames(rows);
    for (const fdcId of [171435, 172346, 171040, 173585]) {
      expect([fdcId, renamed.get(fdcId), dropped.get(fdcId)]).toEqual([
        fdcId,
        undefined,
        undefined,
      ]);
    }
  });

  it("never drops a row on this ground", () => {
    // The whole of how this rule differs from the origin collision above.
    expect([...resolveShippedNames(rows).dropped]).toEqual([]);
  });

  it("still renames a row whose stripped name nothing else claims", () => {
    const { renamed } = resolveShippedNames(rows);
    expect(renamed.get(171278)).toBe("Milk, goat, fluid");
    expect(renamed.get(171434)).toBe(
      "Margarine-like, vegetable oil spread, approximately 37% fat, unspecified oils, with salt"
    );
  });

  it("refuses two candidates that would step aside into each other's name", () => {
    // Neither of these rows exists in the corpus, and the case is here for what
    // it proves about the rule rather than about USDA: a candidate whose own
    // proposal is refused keeps the name it has, so it still holds that name
    // against everyone else. A guard counting only PROPOSED names would let
    // both of these through and collide anyway.
    const { renamed, dropped } = resolveShippedNames([
      { fdcId: 1, description: "Milk, invented, with added vitamin D" },
      {
        fdcId: 2,
        description: "Milk, invented, without added vitamin A and vitamin D",
      },
    ]);
    expect([...renamed]).toEqual([]);
    expect([...dropped]).toEqual([]);
  });

  it("counts an alias as a name the corpus already answers to", () => {
    // `bestNameKey` ranks a query against an alias exactly as against a
    // description, so a rename into a name a twin merge discarded would put two
    // rows under one name just as surely — and ADR-0056 §3 makes the same
    // argument in the other direction when it renames the aliases too. Nothing
    // in the shipped corpus is in this position; the guard is here so the first
    // refresh that produces one is refused rather than shipped.
    const { renamed, dropped } = resolveShippedNames([
      { fdcId: 1, description: "Milk, invented, with added vitamin D" },
      {
        fdcId: 2,
        description: "Milk, something else",
        also: ["Milk, invented"],
      },
    ]);
    expect([...renamed]).toEqual([]);
    expect([...dropped]).toEqual([]);
  });

  it("reads an alias as it will ship, not as the archive wrote it", () => {
    // The alias goes through the origin strip before it reaches the corpus, so
    // comparing against the archived text would compare against a string
    // nothing answers to — and would let this rename through.
    const { renamed } = resolveShippedNames([
      { fdcId: 1, description: "Lamb, invented, with added vitamin D" },
      {
        fdcId: 2,
        description: "Lamb, something else",
        also: ["Lamb, New Zealand, imported, invented"],
      },
    ]);
    expect([...renamed]).toEqual([]);
  });

  it("reads the name the earlier rules left, not the one USDA published", () => {
    // Order is load-bearing (ADR-0062 §3). The aisle label comes off first, and
    // it is the SHORTENED name the freedom check is asked about — here it
    // collides, and would not have if the question had been put to USDA's
    // original text.
    const { renamed, dropped } = resolveShippedNames([
      {
        fdcId: 1,
        description:
          "Beef, variety meats and by-products, liver, with added vitamin D",
      },
      { fdcId: 2, description: "Beef, liver" },
    ]);
    expect(renamed.get(1)).toBe("Beef, liver, with added vitamin D");
    expect([...dropped]).toEqual([]);
  });
});

describe("the roster", () => {
  it("keeps a food's own `all` out of the catalogue roster", () => {
    // `withoutCatalogueText` compares phrases, not words. Filtering the WORDS
    // would drop `all` from a flour whose name contains it.
    const description = "Wheat flour, white, all-purpose, enriched, bleached";
    expect(stripNonNamingQualifiers(description)).toBe(description);
  });

  it("holds only the three commercial origin qualifiers", () => {
    // The eight cultural designation tags — (Alaska Native), (Navajo),
    // (Northern Plains Indians), (Shoshone Bannock), (Hopi), (Apache),
    // (Southwest) and (Klamath), the whole 151-row category — are deliberately
    // absent.
    // ADR-0055 §4 demotes that category on a tie and §1 forbids dropping it;
    // rewriting its names would assert those rows are general-population
    // reference values, which is not what USDA published them as.
    expect([...ORIGIN_QUALIFIERS].sort()).toEqual([
      "australian",
      "imported",
      "new zealand",
    ]);
  });

  it("holds the four fortification phrases and no form of `fortified`", () => {
    // ADR-0062 §2. The four are two claims in both polarities; `fortified` is
    // absent because it names a different food, and the roster is asserted
    // whole so a fifth entry cannot arrive without a record saying why.
    expect([...FORTIFICATION_QUALIFIERS].sort()).toEqual([
      "with added vitamin a and vitamin d",
      "with added vitamin d",
      "without added vitamin a and vitamin d",
      "without added vitamin d",
    ]);
  });
});

describe("ADJUDICATED_NAMES — the names no rule reaches (ADR-0061 §5)", () => {
  it("holds one entry, and states the name it was read against", () => {
    // One, and the count is the assertion: everything else in this module is a
    // positional rule that fires wherever a roster phrase occupies a whole
    // qualifier part. A hand list growing past a handful would mean a rule was
    // missed, which is a measurement rather than another entry.
    expect(ADJUDICATED_NAMES).toEqual([
      [
        171266,
        "Milk, producer, fluid, 3.7% milkfat",
        "Milk, whole, 3.7% milkfat",
        expect.stringContaining("producer"),
      ],
    ]);
  });

  it("renames into a name no other row already answers to", () => {
    // The condition ADR-0062 §3 calls load-bearing, checked here over the two
    // rows that made it matter: under the corpus that preceded ADR-0061 this
    // rename would have collided with `Milk, whole, 3.25% milkfat`, and both of
    // those rows are dropped precisely so it does not.
    const { renamed, dropped } = resolveShippedNames([
      { fdcId: 171266, description: "Milk, whole, 3.7% milkfat" },
      { fdcId: 172225, description: "Milk, buttermilk, fluid, whole" },
    ]);
    expect([...renamed]).toEqual([]);
    expect([...dropped]).toEqual([]);
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
