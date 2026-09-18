/**
 * The frozen pairing (ADR-0113 §§6-7): what a logged occasion keeps of a **Pack
 * pairing**, and what makes that account honest to somebody reading a raw
 * exported ledger.
 *
 * `marked-panel.test.ts` holds the live reading — which silences a reference
 * food may fill, and which it may never. Nothing here re-states that. These are
 * statements about the FREEZE: that the numbers and the account of them are
 * minted together, that an account of nothing is not written at all, and that
 * the name travels because the row it names may not.
 */
import { describe, expect, it } from "vitest";
import {
  borrowedKeys,
  freezePairing,
  loadReferenceFoods,
  pairedSource,
  referenceFoodsFrom,
  type ReferenceFoods,
} from "../../src/lib/food/frozen-pairing";
import {
  PER_100G,
  PER_100ML,
  type NutritionInfo,
} from "../../src/lib/food/nutrition";
import type {
  SearchCorpus,
  UsdaCorpusNutrientStore,
} from "../../src/lib/food/usda-corpus";
import type { PairingTargetSet } from "../../src/lib/food/pairing-targets";

/** An EU pack's mandatory declaration and nothing else. */
const label = (extra: Partial<NutritionInfo> = {}): NutritionInfo => ({
  serving_size: PER_100G,
  calories: 116,
  protein_content: 8.7,
  fat_content: 0.5,
  carbohydrate_content: 15.6,
  sugar_content: 0.6,
  saturated_fat_content: 0.1,
  sodium_content: 0.24,
  ...extra,
});

/** `fdc:173740` as a nutrient store hands it back: per 100 g, and carrying what
 *  no European label prints. */
const reference = (extra: Partial<NutritionInfo> = {}): NutritionInfo => ({
  serving_size: PER_100G,
  calories: 127,
  fiber_content: 6.4,
  iron: 0.00222,
  potassium: 0.403,
  folate: 0.00013,
  magnesium: 0.045,
  ...extra,
});

const BEANS =
  "Beans, kidney, all types, mature seeds, cooked, boiled, without salt";

/** The two artifacts as one lookup, stated rather than loaded. */
function references(overrides: Partial<ReferenceFoods> = {}): ReferenceFoods {
  return {
    panel: (ref) => (ref === "fdc:173740" ? reference() : undefined),
    name: (ref) => (ref === "fdc:173740" ? BEANS : undefined),
    ...overrides,
  };
}

/** A `gtin:` twin's attributes, paired unless told otherwise. */
const twin = (attrs: Record<string, unknown> = {}) => ({
  "nutrition/info": label(),
  "food/pairing": "fdc:173740",
  ...attrs,
});

describe("the envelope a freeze writes (§6)", () => {
  it("names the reference food, its URI and exactly the keys it supplied", () => {
    const { panel, pairing } = pairedSource(twin(), references());

    expect(pairing).toEqual({
      ref: "fdc:173740",
      name: BEANS,
      source_uri: "https://api.nal.usda.gov/fdc/v1/food/173740",
      filled_fields: [
        "fiber_content",
        "iron",
        "potassium",
        "folate",
        "magnesium",
      ],
    });
    // The intersection of the two is the answer, and the difference is the
    // label's: every key named above is in the panel that will be frozen, and
    // the label's own figures are untouched beside them.
    for (const key of pairing!.filled_fields) expect(panel).toHaveProperty(key);
    expect(panel?.calories).toBe(116);
  });

  it("carries none of the reference food's own per-100 figures", () => {
    const { pairing } = pairedSource(twin(), references());

    // They would duplicate numbers `event/metrics` already holds, and their only
    // use would be a re-derivation ADR-0045's #147 amendment forbids.
    expect(Object.keys(pairing!).sort()).toEqual([
      "filled_fields",
      "name",
      "ref",
      "source_uri",
    ]);
  });

  it("freezes the name rather than the id alone, so it survives the row leaving the corpus", () => {
    expect(pairedSource(twin(), references()).pairing?.name).toBe(BEANS);
  });

  it("stands the id in for a name the corpus can no longer answer", () => {
    // §7 keeps such a pairing standing: an unresolvable id is an unnamed
    // pairing, never an absent one, and the raw-export reader this is written
    // for has no live lookup to do better with.
    const { pairing } = pairedSource(
      twin(),
      references({ name: () => undefined })
    );

    expect(pairing?.name).toBe("fdc:173740");
    expect(pairing?.filled_fields.length).toBeGreaterThan(0);
  });
});

describe("omitted, never emitted empty (§6)", () => {
  it("writes no envelope where the pairing supplied nothing", () => {
    // A label complete for everything a reference food may lawfully fill.
    const complete = label({
      fiber_content: 6.4,
      iron: 0.002,
      potassium: 0.4,
      folate: 0.0001,
      magnesium: 0.04,
    });

    const source = pairedSource(
      twin({ "nutrition/info": complete }),
      references()
    );

    expect(source.pairing).toBeUndefined();
    // And the panel is the very one it was given, so nothing downstream can
    // tell a no-fill reading from an unpaired one by identity either.
    expect(source.panel).toBe(complete);
  });

  it("writes no envelope where the reference food has left the corpus", () => {
    const source = pairedSource(twin(), references({ panel: () => undefined }));

    expect(source.pairing).toBeUndefined();
    expect(source.panel).toEqual(label());
  });

  it("writes no envelope for an unpaired food", () => {
    const source = pairedSource({ "nutrition/info": label() }, references());

    expect(source.pairing).toBeUndefined();
  });

  it("refuses an envelope with an empty field list outright", () => {
    expect(freezePairing("fdc:173740", BEANS, [])).toBeUndefined();
  });

  it("refuses an envelope naming something that is not a reference food", () => {
    expect(freezePairing("gtin:5000", "A jar", ["iron"])).toBeUndefined();
  });
});

describe("the numbers and the account are minted together", () => {
  it("hands back a widened panel only where it also hands back the envelope", () => {
    const unpaired = pairedSource({ "nutrition/info": label() }, references());
    const paired = pairedSource(twin(), references());

    // The one shape §6 refuses is borrowed numbers with nothing naming them, so
    // the two travel as one return value and never as two lookups.
    expect(unpaired.pairing).toBeUndefined();
    expect(unpaired.panel).toEqual(label());
    expect(paired.pairing).toBeDefined();
    expect(paired.panel).not.toEqual(label());
  });

  it("carries the twin's density through, since the freeze scales against it", () => {
    const source = pairedSource(
      twin({ "food/density": { class: "milk-like" } }),
      references()
    );

    expect(source.density).toEqual({ class: "milk-like" });
  });

  it("hands back no panel at all for a twin that carries none", () => {
    expect(
      pairedSource({ "food/pairing": "fdc:173740" }, references()).panel
    ).toBeUndefined();
  });
});

describe("the est set a dish's figures are marked against (§5)", () => {
  it("unions the keys every row borrowed", () => {
    const one = pairedSource(twin(), references());
    const two = pairedSource(
      twin({
        "nutrition/info": label({
          iron: 0.003,
          potassium: 0.3,
          folate: 0.0002,
        }),
      }),
      references()
    );

    // One row lends five keys, the other lends the two the first did not
    // already cover, and the mark is the union: *not every figure in this row
    // was printed on a label*, said once per key.
    expect([...borrowedKeys([one, two])].sort()).toEqual([
      "fiber_content",
      "folate",
      "iron",
      "magnesium",
      "potassium",
    ]);
  });

  it("is empty where no row borrowed anything", () => {
    expect(
      borrowedKeys([pairedSource({ "nutrition/info": label() }, references())])
    ).toEqual(new Set());
    expect(borrowedKeys([undefined])).toEqual(new Set());
  });
});

describe("what the two bundled artifacts are read through", () => {
  const store: UsdaCorpusNutrientStore = {
    schema_version: 1,
    generated_from: [],
    nutrients: {
      "1008": { name: "Energy", unit: "KCAL" },
      "1089": { name: "Iron, Fe", unit: "MG" },
    },
    foods: { "173740": { "1008": 127, "1089": 2.22 } },
  };
  const corpus = {
    foods: [{ row: { fdcId: 173740, description: BEANS } }],
  } as unknown as SearchCorpus;

  it("reads a reference food's panel and name out of the pair", () => {
    const read = referenceFoodsFrom(store, corpus);

    expect(read.name("fdc:173740")).toBe(BEANS);
    expect(read.panel("fdc:173740")?.calories).toBe(127);
  });

  it("keeps answering for the figures when the corpus is the half that is missing", () => {
    // The two are separate artifacts and either can fail alone. The figures are
    // what a fill needs; the name has a documented fallback, and an occasion
    // frozen under the id is honest.
    const read = referenceFoodsFrom(store, undefined);

    expect(read.name("fdc:173740")).toBeUndefined();
    expect(read.panel("fdc:173740")?.calories).toBe(127);
  });
});

describe("which set a paired id is resolved out of (§11)", () => {
  // A Declared state records nothing, so the target's own `fdc:` id **is** the
  // state — and resolution reads that back the only way it can: the shipped
  // Nutrient store answers for a Reference food, and one it cannot answer for is
  // a Pairing target. The chain is shipped-first in both halves, so a row in
  // both sets is always the shipped one's.
  const shippedStore: UsdaCorpusNutrientStore = {
    schema_version: 1,
    generated_from: [],
    nutrients: { "1008": { name: "Energy", unit: "KCAL" } },
    foods: { "168409": { "1008": 333 } },
  };
  const shippedCorpus = {
    foods: [{ row: { fdcId: 168409, description: "Beans, kidney, raw" } }],
  } as unknown as SearchCorpus;
  const cooked: PairingTargetSet = {
    store: {
      artifact: "usda-pairing-nutrient-store",
      schema_version: 1,
      generated_from: [],
      nutrients: { "1008": { name: "Energy", unit: "KCAL" } },
      foods: { "173740": { "1008": 127 } },
    },
    index: {
      artifact: "usda-pairing-index",
      schema_version: 1,
      generated_from: [],
      foods: [
        {
          fdcId: 173740,
          description: BEANS,
          dataType: "SR Legacy",
          macros: { calories: 127 },
        },
      ],
    },
  };

  it("reads a Pairing target's figures and name out of the cooked set", () => {
    // The whole of what declaring a pack cooked buys: `fdcId 173740` left the
    // Search index when ADR-0104 shipped, so a pairing onto it resolves here or
    // resolves nowhere.
    const read = referenceFoodsFrom(shippedStore, shippedCorpus, cooked);

    expect(read.panel("fdc:173740")?.calories).toBe(127);
    expect(read.name("fdc:173740")).toBe(BEANS);
  });

  it("keeps answering for a Reference food out of the shipped pair", () => {
    const read = referenceFoodsFrom(shippedStore, shippedCorpus, cooked);

    expect(read.panel("fdc:168409")?.calories).toBe(333);
    expect(read.name("fdc:168409")).toBe("Beans, kidney, raw");
  });

  it("fetches neither cooked artifact for a pairing the shipped store answers", async () => {
    // ADR-0113 §11's promise, and the one a person pays for on every ordinary
    // log: the second artifact's fetch stays off the common path.
    const unreachable = () => {
      throw new Error("the cooked set was fetched");
    };
    const read = await loadReferenceFoods(
      [{ "nutrition/info": label(), "food/pairing": "fdc:168409" }],
      async () => shippedStore,
      async () => shippedCorpus,
      unreachable
    );

    expect(read?.panel("fdc:168409")?.calories).toBe(333);
  });

  it("fetches them once for a dish where one row names a target", async () => {
    let loads = 0;
    const read = await loadReferenceFoods(
      [
        { "nutrition/info": label(), "food/pairing": "fdc:168409" },
        twin(),
        twin(),
      ],
      async () => shippedStore,
      async () => shippedCorpus,
      async () => {
        loads += 1;
        return cooked;
      }
    );

    expect(loads).toBe(1);
    expect(read?.panel("fdc:173740")?.calories).toBe(127);
    expect(read?.panel("fdc:168409")?.calories).toBe(333);
  });

  it("never rejects, whichever of the three loaders fails", async () => {
    // `FoodCard` reads through here with a bare `.then`, so a rejection would be
    // an unhandled one inside a Svelte effect. The guarantee has to hold for the
    // cooked loader too: one that held only for the loader that happens to be
    // the default is not a guarantee.
    const refuses = () => Promise.reject(new Error("offline"));

    await expect(
      loadReferenceFoods([twin()], async () => shippedStore, refuses, refuses)
    ).resolves.toBeDefined();
    await expect(
      loadReferenceFoods([twin()], refuses, refuses, refuses)
    ).resolves.toBeUndefined();
  });

  it("keeps naming a pairing when the figures are the half that would not load", async () => {
    // The corpus alone still says something true, and it is what a paired pack's
    // card showed before it read through here: the reference food named beside
    // the pack, with nothing borrowed from it. Losing that would be a
    // regression, so either artifact alone builds a lookup.
    const read = await loadReferenceFoods(
      [{ "nutrition/info": label(), "food/pairing": "fdc:168409" }],
      () => Promise.reject(new Error("offline")),
      async () => shippedCorpus,
      async () => ({})
    );

    expect(read?.name("fdc:168409")).toBe("Beans, kidney, raw");
    expect(read?.panel("fdc:168409")).toBeUndefined();
  });

  it("does not guess at the cooked set when the shipped store never loaded", async () => {
    // An unanswerable id and an unread store look alike from here, and only the
    // first is evidence of anything. Fetching on the second would spend a
    // thousand rows on a device that has just failed to fetch four.
    const unreachable = () => {
      throw new Error("the cooked set was fetched");
    };
    const read = await loadReferenceFoods(
      [twin()],
      () => Promise.reject(new Error("offline")),
      async () => shippedCorpus,
      unreachable
    );

    expect(read?.panel("fdc:173740")).toBeUndefined();
  });
});

describe("what a log pays for a food nobody paired", () => {
  const unreachable = () => {
    throw new Error("the artifact was fetched");
  };

  it("loads neither artifact when nothing in hand is paired", async () => {
    // The nutrient store is the megabyte ADR-0047 §2 keeps off the act of
    // looking at a food, and every log in this app now asks this question.
    await expect(
      loadReferenceFoods(
        [{ "nutrition/info": label() }, undefined],
        unreachable,
        unreachable
      )
    ).resolves.toBeUndefined();
  });

  it("loads them once for a whole dish where one row is paired", async () => {
    let loads = 0;
    const store: UsdaCorpusNutrientStore = {
      schema_version: 1,
      generated_from: [],
      nutrients: {},
      foods: {},
    };

    const read = await loadReferenceFoods(
      [{ "nutrition/info": label() }, twin(), twin()],
      async () => {
        loads += 1;
        return store;
      },
      async () => ({ foods: [] }) as unknown as SearchCorpus,
      // This store carries no row at all, so the paired id reads as a Pairing
      // target and the cooked set is asked for. Stated rather than left to the
      // real loader, which would put a fetch in a unit test.
      async () => ({})
    );

    expect(read).toBeDefined();
    expect(loads).toBe(1);
  });

  it("degrades to no pairing rather than throwing when an artifact will not load", async () => {
    // Logging a food is not something to lose because a fetch failed, and the
    // honest result is the panel the label already carried.
    await expect(
      loadReferenceFoods(
        [twin()],
        () => Promise.reject(new Error("offline")),
        () => Promise.reject(new Error("offline"))
      )
    ).resolves.toBeUndefined();
  });
});

describe("the freeze is a value, not a view onto the twin (§7)", () => {
  /**
   * What §7's two consequences rest on, one level below them: the envelope is
   * read once and holds nothing that re-resolves, so re-pairing or unpairing the
   * jar cannot reach one already taken.
   *
   * The consequences themselves are asserted where they are actually true, on
   * the ledger, in `calorie-store.test.ts` — a later `food/pairing` datom on the
   * twin leaves the logged occasion's own datoms exactly as they were.
   */
  it("keeps an account already taken when the jar is re-paired", () => {
    const attributes = twin();
    const yesterday = pairedSource(attributes, references()).pairing;

    attributes["food/pairing"] = "fdc:999999";
    const tomorrow = pairedSource(attributes, references()).pairing;

    expect(yesterday).toEqual({
      ref: "fdc:173740",
      name: BEANS,
      source_uri: "https://api.nal.usda.gov/fdc/v1/food/173740",
      filled_fields: [
        "fiber_content",
        "iron",
        "potassium",
        "folate",
        "magnesium",
      ],
    });
    // The jar now names a row this corpus cannot answer for, which fills
    // nothing — and yesterday's frozen account is untouched by that.
    expect(tomorrow).toBeUndefined();
  });

  it("keeps an account already taken when the jar is unpaired", () => {
    const attributes = twin();
    const yesterday = pairedSource(attributes, references()).pairing;

    attributes["food/pairing"] = "";

    expect(pairedSource(attributes, references()).pairing).toBeUndefined();
    expect(yesterday?.ref).toBe("fdc:173740");
  });

  it("freezes against the label's own basis, never against a guess at one", () => {
    // A per-100 ml pack on a food nobody has classified reaches grams only
    // through a density (ADR-0108 §1), and a factor of 1 would be the ratio-1
    // pretence ADR-0060 §2 refuses. No fill, so no account of one.
    const source = pairedSource(
      twin({ "nutrition/info": label({ serving_size: PER_100ML }) }),
      references()
    );

    expect(source.pairing).toBeUndefined();
  });
});
