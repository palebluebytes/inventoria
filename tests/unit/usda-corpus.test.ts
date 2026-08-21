import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  SEARCH_RESULT_LIMIT,
  buildSearchCorpus,
  mapIndexRowToPayload,
  searchIndexRows,
  searchUsdaCorpus,
  storedPanelFor,
  completeStagedPanel,
  type NutrientStore,
  type SearchIndex,
  type UsdaIndexRow,
} from "../../src/lib/food/usda-corpus";
import {
  PER_100G,
  FOOD_PORTIONS_ATTR,
  NUTRITION_INFO_ATTR,
  reportsNoEnergy,
  type NutritionInfo,
} from "../../src/lib/food/nutrition";
import {
  BRAND_CAPS,
  isBrandSpecific,
  isDryBasisRecord,
  isManufacturingInput,
  isPreparedProduct,
  isProcessedProduct,
} from "../../src/lib/food/usda-fdc";
import {
  compareRelevance,
  compileReferenceFoodQuery,
  readReferenceFoodName,
  stemOf,
  type RelevanceKey,
} from "../../src/lib/food/reference-food-ranking";
import type { RawProvenance } from "../../src/lib/food/provenance";
import type { EntityPayload } from "../../src/lib/ingestion/ingest";

// The committed artifact itself is the fixture (ADR-0047 §3). Search is only
// keyless and offline if it answers from THIS file, so the ADR-0042 ordering
// cases are asserted over the 4,360 rows the app actually ships rather than
// over a hand-built stand-in that could agree with the code and not the data.
const index: SearchIndex = JSON.parse(
  readFileSync("public/usda/search-index.json", "utf8")
);
const corpus = buildSearchCorpus(index);
const descriptionsFor = (query: string): string[] =>
  searchIndexRows(corpus, query).hits.map(({ row }) => row.description);

describe("the bundled search index", () => {
  it("is the surviving reference foods, and says which archives it came from", () => {
    expect(index.foods.length).toBe(4360);
    expect(index.generated_from.map((a) => a.dataset)).toEqual([
      "Foundation Foods",
      "SR Legacy",
    ]);
  });

  // ── ADR-0048's invariant, over the artifact itself ────────────────────────
  // Locked here rather than in the generator because a mirror refresh is the
  // way it would come back: the filters run at generation, and a refresh that
  // reintroduced a calorie-less record would otherwise ship it silently — which
  // is exactly how `Oil, olive, extra virgin` reached the corpus in the first
  // place (#126).

  it("carries an energy value on every row — an absent measurement is not a zero", () => {
    // PRESENCE, not non-zero (ADR-0048 §1). Eight rows report a measured 0 and
    // are correct: tap water, iodised salt, decaffeinated coffee and tea.
    const silent = index.foods.filter((row) =>
      reportsNoEnergy({ serving_size: PER_100G, ...row.macros })
    );
    expect(silent.map((row) => row.description)).toEqual([]);

    // Not vacuous, and the distinction is the whole point: the measured zeros
    // are still here.
    const measuredZero = index.foods.filter((row) => row.macros.calories === 0);
    expect(measuredZero.map((row) => row.description)).toContain(
      "Beverages, water, tap, drinking"
    );
    // Eight, not the nine ADR-0048 counted: the ninth was "Beverages, Powerade
    // Zero Ion4", which really is calorie-free and passed this filter honestly.
    // It left the corpus as a brand instead (#131), which is how the leak was
    // noticed in the first place.
    expect(measuredZero).toHaveLength(8);
  });

  // ── ADR-0042 §3's brand invariant, over the artifact itself ───────────────
  // Locked here for the same reason as the energy invariant above: the brand
  // filter runs at generation, so a mirror refresh is how a brand comes back,
  // and it would ship silently. #131 is the proof — sixteen "Vitasoy USA …"
  // rows sat in the corpus as generic foods until somebody read the data for an
  // unrelated ticket.

  it("shouts no brand: the surviving all-caps vocabulary is three known words", () => {
    // USDA's editorial convention renders brands in ALL CAPS, so the set of
    // all-caps tokens that survive the filter IS the audit. It is small enough
    // to read, and every member has to earn its place:
    //   USDA — "Includes Foods for USDA's Food Distribution Program"
    //   BBQ  — "Chicken, broiler, rotisserie, BBQ, …"
    //   NY   — "Beef, short loin (NY strip steak), raw"
    // A fourth member appearing is not necessarily a bug, but it is always
    // worth a human deciding — which is the point of pinning the whole set
    // rather than asserting a blocklist.
    const capsTokens = new Set(
      index.foods.flatMap((row) => row.description.match(BRAND_CAPS) ?? [])
    );
    expect([...capsTokens].sort()).toEqual(["BBQ", "NY", "USDA"]);
  });

  it("carries none of the brands that have leaked past the filter before", () => {
    // A tripwire, NOT a proof the class is empty — it can only catch a brand
    // somebody thought to list, which is exactly the weakness that let #131 sit
    // undiscovered. The real guard against a shouted brand is the caps pin
    // above; a Title-Case brand arriving on a refresh is a known, accepted gap
    // (ADR-0042 §3 as amended), and this roster is the only thing watching for
    // it. Add to it whenever a leak is found.
    const KNOWN_BRANDS = [
      "vitasoy",
      "nasoya",
      "azumaya",
      "powerade",
      "gatorade",
      "creamsicle",
      "reddi wip",
      "natreon",
      "coca-cola",
      "pepsi",
      "kellogg",
      "nestle",
      "quaker",
      "kraft",
      "campbell",
      "heinz",
      "cheerios",
      "oreo",
      "hershey",
      "mcdonald",
      "subway",
      "applebee",
      "gerber",
      "ocean spray",
      "bimbo",
      "zespri",
      "cream of wheat",
      "cream of rice",
      "post",
      "almond joy",
    ];
    const leaked = index.foods.filter((row) =>
      KNOWN_BRANDS.some((brand) =>
        row.description.toLowerCase().includes(brand)
      )
    );
    expect(leaked.map((row) => row.description)).toEqual([]);
  });

  it("holds nothing its own filters would reject", () => {
    // The artifact and the predicates have to agree, and asking the predicates
    // is the only way to keep them agreeing: a test that restated a rule would
    // still pass after the rule moved, which is how a filter and its corpus
    // drift apart (ADR-0047 §4, and the reason `usda-bundle.mjs` imports these
    // rather than reimplementing them).
    //
    // This is what catches a mirror refresh reintroducing a dropped kind, and
    // it subsumes the particular cases #131 and #133 were about.
    const rejected = index.foods.filter(
      (row) =>
        isBrandSpecific(row.description) ||
        isProcessedProduct(row.description) ||
        isPreparedProduct(row.foodCategory, row.description) ||
        isDryBasisRecord(row.description) ||
        isManufacturingInput(row.description)
    );
    expect(rejected.map((row) => row.description)).toEqual([]);
  });

  it("still offers the base foods the dropped rows were standing in front of", () => {
    // The other half of #131 and #133: a drop is only correct because a generic
    // equivalent stayed. Assert the survivors by name, so a future tightening
    // that cannot tell a brand from a base food, or a wafer from a tub, fails
    // here rather than quietly emptying an aisle.
    const descriptions = index.foods.map((row) => row.description);
    for (const kept of [
      // #131's brand leaks
      "Tofu, raw, firm, prepared with calcium sulfate",
      "Soymilk, original and vanilla, unfortified",
      "Oil, canola",
      "Cream, whipped, cream topping, pressurized",
      // the Beverages rows a "drop every beverage" rule would have cost
      "Beverages, water, tap, drinking",
      "Beverages, coffee, brewed, prepared with tap water",
      "Beverages, tea, black, brewed, prepared with tap water",
      // #133's plain tubs, and the three base foods a bare "sandwich" marker
      // would have taken with the novelties
      "Ice cream, soft serve, chocolate",
      "Fat free ice cream, no sugar added, flavors other than chocolate",
      "Sandwich spread, meatless",
      "Beef, sandwich steaks, flaked, chopped, formed and thinly sliced, raw",
      "Tortilla, includes plain and from mutton sandwich (Navajo)",
      // #144: what each of its four new rules had to leave standing
      "Bread, whole-wheat, commercially prepared",
      "Syrups, maple",
      "Bread, cornbread, prepared from recipe, made with low fat (2%) milk",
      "Beef, chuck for stew, separable lean and fat, select, raw",
      "Flour, wheat, all-purpose, enriched, bleached",
      "Shortening, vegetable, household, composite",
      "Wheat flour, white, cake, enriched",
      "Sweet potato, raw, unprepared (Includes foods for USDA's Food Distribution Program)",
    ]) {
      expect(descriptions).toContain(kept);
    }
  });

  it("offers no confection its head word used to keep, and no factory input", () => {
    // #144's four escapes, pinned by name over the shipped artifact. The
    // predicates already agree with the corpus above; what these add is that the
    // particular rows the ticket adjudicated are the ones that left, so a
    // retune that merely moved the counts around still fails here.
    const descriptions = index.foods.map((row) => row.description);
    for (const gone of [
      // a pound cake and a sweet bread kept by `bread`
      "Bread, pound cake type, pan de torta salvadoran",
      "Bread, salvadoran sweet cheese (quesadilla salvadorena)",
      // a table blend and a fudge sauce kept by `syrups`
      "Syrups, table blends, pancake",
      "Syrups, chocolate, fudge-type",
      // boxed mixes, which are §4's line rather than §5's
      "Bread, cornbread, dry mix, enriched (includes corn muffin mix)",
      "Bread, stuffing, dry mix",
      // composite dishes with no marker and no prepared category
      "Stew, mutton, corn, squash (Navajo)",
      "Stew/soup, caribou (Alaska Native)",
      // packaged whipped toppings beside the cream they imitate
      "Dessert topping, powdered",
      // the manufacturing inputs: #144 named one, the corpus held 45
      "Oil, industrial, coconut, principal uses candy coatings, oil sprays, roasting nuts",
      "Wheat flour, white (industrial), 11.5% protein, bleached, enriched",
    ]) {
      expect(descriptions).not.toContain(gone);
    }
    expect(
      index.foods.filter((row) => isManufacturingInput(row.description))
    ).toEqual([]);
  });

  it("keeps #144's markers to the reach they were measured at", () => {
    // #131's rule, which #144 restates: an unmeasured precision guard is a hole.
    // The reach of a drop rule cannot be read off the shipped corpus — every row
    // it takes is gone — so what is pinned is the population it had to leave
    // behind. A marker that widened would empty one of these; one that narrowed
    // would refill it.
    const inCategory = (category: string) =>
      index.foods.filter((row) => row.foodCategory === category).length;
    // 127 and 31 before the escape hatches took four treats and seven confections.
    expect(inCategory("Baked Products")).toBe(114);
    expect(inCategory("Sweets")).toBe(24);
    // Eleven of the nineteen rows naming a stew are raw retail cuts sold for one,
    // and the exemption has to keep every one of them.
    const stews = index.foods.filter((row) =>
      /\bstew\b/i.test(row.description)
    );
    expect(stews.length).toBe(11);
    expect(stews.every((row) => /\bfor stew\b/i.test(row.description))).toBe(
      true
    );
    // All nine boxed-mix rows are gone, and no dry seasoning went with them.
    expect(
      index.foods.filter((row) => /\bdry mix\b/i.test(row.description))
    ).toEqual([]);
    expect(
      index.foods.some(
        (row) =>
          row.description === "Seasoning mix, dry, sazon, coriander & annatto"
      )
    ).toBe(true);
  });

  it("keeps the five twinned oils, on their twin's energy and their twin's fat", () => {
    // ADR-0048 §5's ordering, verified against the shipped artifact rather than
    // a fixture: each of these reports no energy of its own and borrows it from
    // an SR Legacy twin, so a filter placed before `resolveFdcGroup` would have
    // dropped all five. `fat 100` is the twin's `1004` — §2 declined to read the
    // `1085` these records carry, which would have shipped 884 kcal beside 94.5 g.
    const oils = ["canola", "corn", "soybean", "peanut", "safflower"].map(
      (kind) => index.foods.find((row) => row.description === `Oil, ${kind}`)
    );
    expect(oils.map((row) => row?.macros.fat_content)).toEqual([
      100, 100, 100, 100, 100,
    ]);
    expect(oils.map((row) => row?.macros.calories)).toEqual([
      884, 900, 884, 884, 884,
    ]);
    for (const oil of oils)
      expect(oil?.merged_from?.[0].filled_fields).toContain("calories");
  });

  it("offers no dry-basis assay as a food", () => {
    // The seventeen `Beans, Dry, … (0% moisture)` records: per 100 g of dry
    // matter, published to compare cultivars, and not a food anyone eats
    // (ADR-0048 §5). The dried beans as sold stay.
    expect(
      index.foods.filter((row) => isDryBasisRecord(row.description))
    ).toEqual([]);
    expect(
      index.foods.filter((row) => /mature seeds, raw$/.test(row.description))
        .length
    ).toBeGreaterThan(30);
  });
});

// ── ADR-0042's ranking, over the corpus rather than over one FDC page ────────
// The ordering functions are unchanged and already unit-tested; what these
// assert is that ranking the whole local corpus reaches the same answers the
// API's boosted, paged query used to — the claim ADR-0047 makes when it retires
// the Lucene boost.

describe("searchIndexRows", () => {
  it("puts Grapes above Grapefruit", () => {
    const found = descriptionsFor("grape");
    const grapes = found.findIndex((d) => d.startsWith("Grapes,"));
    const grapefruit = found.findIndex((d) => d.startsWith("Grapefruit"));
    expect(grapes).toBeGreaterThanOrEqual(0);
    expect(grapefruit).toBeGreaterThan(grapes);
  });

  it("reaches Grapes from a three-character 'gra', with no boost to help it", () => {
    // The head-completeness tiebreak is what does this now; ADR-0042 §2's
    // `lowercaseDescription.keyword^500` existed only to win one FDC page.
    expect(descriptionsFor("gra")[0]).toMatch(/^Grapes,/);
  });

  it("reaches balsamic vinegar, which FDC's stemmed index could not", () => {
    // "balsamic" indexes as "balsam" at FDC, so `balsamic*` matched nothing and
    // a bare token had to ride alongside the wildcard (385d5df). A local index
    // is not stemmed, so the word is simply there.
    expect(descriptionsFor("balsamic")).toContain("Vinegar, balsamic");
  });

  it("leads with the base ingredient, not the food that merely mentions it", () => {
    // The corpus holds "Bread, banana, …" and "Pepper, banana, raw" alongside
    // the fruit; the head-phrase tier is what puts the bananas themselves first.
    expect(descriptionsFor("banana")[0]).toMatch(/^Bananas,/);
  });

  it("reaches the food a partial query is naming, not a qualifier it lands on", () => {
    // "pot" used to return "Beef, chuck, arm pot roast, …" first, with the first
    // "Potatoes," row at position 40 — the retired ADR-0042 §2 boost had been
    // doing this job, and ranking the whole corpus had no equivalent.
    expect(descriptionsFor("pot")[0]).toMatch(/^Potatoes,/);
    expect(descriptionsFor("potato")[0]).toMatch(/^Potatoes,/);
    expect(descriptionsFor("tomato")[0]).toMatch(/^Tomatoes,/);
  });

  it("leads with the food the whole query names, not one word of it", () => {
    expect(descriptionsFor("soy milk")[0]).toMatch(/^Soy milk,/);
  });

  it("matches every token, not just one of them", () => {
    // A rice milk answers "milk" but not "soy milk"; an OR-of-prefixes query
    // returned it and the ranking had to bury it. Locally it never matches.
    expect(descriptionsFor("soy milk")).not.toContain("Beverages, rice milk");
  });

  it("returns nothing for a query no reference food answers", () => {
    expect(descriptionsFor("gorgonzola nibs of the sea")).toEqual([]);
  });

  it("returns nothing for an empty query rather than the whole corpus", () => {
    expect(searchIndexRows(corpus, "   ").hits).toEqual([]);
  });

  it("caps a broad query at one page rather than handing over the corpus", () => {
    // A bare "b" matches thousands of rows. The list is rendered one option per
    // row, so the cap is what the FDC page size used to be.
    const broad = searchIndexRows(corpus, "b").hits;
    expect(broad.length).toBe(SEARCH_RESULT_LIMIT);
  });

  it("reaches a food whose own name carries a hyphen or a bracket", () => {
    // #136: the query used to split on whitespace alone while a description
    // split on every non-alphanumeric run, so a typed hyphen, apostrophe or
    // bracket made a token no name word could equal, and the search collapsed.
    // These are the rows the corpus actually ships under those names.
    expect(descriptionsFor("mahi-mahi")[0]).toBe("Fish, mahimahi, raw");
    expect(descriptionsFor("hyacinth-beans")[0]).toBe(
      "Hyacinth-beans, immature seeds, raw"
    );
    expect(descriptionsFor("yambean (jicama)")[0]).toBe(
      "Yambean (jicama), raw"
    );
    expect(descriptionsFor("pak-choi")).not.toEqual([]);
    expect(descriptionsFor("freeze-dried chives")).toContain(
      "Chives, freeze-dried"
    );
  });

  it("answers a typed punctuation mark exactly as it answers a space", () => {
    for (const [typed, spaced] of [
      ["yambean (jicama)", "yambean jicama"],
      ["margarine-like", "margarine like"],
      ["whole-wheat pasta", "whole wheat pasta"],
      ["cabbage, chinese", "cabbage chinese"],
    ]) {
      expect(descriptionsFor(typed)).toEqual(descriptionsFor(spaced));
    }
  });

  it("answers nothing to a query that is punctuation and no word", () => {
    // "-" is not blank, so the caller's own emptiness guard passes it through.
    expect(descriptionsFor("-")).toEqual([]);
    expect(descriptionsFor("...")).toEqual([]);
  });

  it("reaches a leaf by its singular, and a radish past its seeds", () => {
    // #138's complete acceptance table: the twelve answers the two new stemmer
    // rules change, measured over 1,978 probes — every distinct corpus word,
    // its de-pluralised form, every head phrase and its singularised form. Nine
    // of these retrieved NOTHING before, because "leaf" stemmed to "leaf" and
    // "leaves" to "leave", so no name word could ever answer a typed singular.
    for (const [query, expected] of [
      ["grape leaf", "Grape leaves, raw"],
      ["taro leaf", "Taro leaves, raw"],
      ["pumpkin leaf", "Pumpkin leaves, raw"],
      ["sweet potato leaf", "Sweet potato leaves, raw"],
      ["amaranth leaf", "Amaranth leaves, raw"],
      ["chrysanthemum leaf", "Chrysanthemum leaves, raw"],
      ["drumstick leaf", "Drumstick leaves, raw"],
      ["winged bean leaf", "Winged bean leaves, raw"],
      ["coriander (cilantro) leaf", "Coriander (cilantro) leaves, raw"],
      // …and three that answered, but with the wrong food. The first is
      // #130 §8's third known case: a dried spice for a fresh herb.
      ["coriander leaf", "Coriander (cilantro) leaves, raw"],
      ["radish", "Radishes, raw"],
      ["leaf", "Amaranth leaves, raw"],
    ] as const) {
      expect([query, descriptionsFor(query)[0]]).toEqual([query, expected]);
    }
  });

  it("merges exactly two pairs of corpus words, and no others", () => {
    // ADR-0042 §1 warns that a more aggressive stemmer "starts merging words
    // that name different foods". #138 discharges the warning rather than
    // repeating it: a query stem is only ever tested against corpus stems, so a
    // false positive needs two CORPUS words to collide. These are all six words
    // the two new rules touch, and what each of them now shares a stem with.
    //
    // This is the check to run before proposing a fifth rule, and it is why a
    // blanket "-ves" rule was rejected: it would stem "chives" to "chif",
    // "cloves" to "clof" and "olives" to "olif", breaking each away from the
    // singular a user types, which works today.
    const words = [
      ...new Set(
        index.foods.flatMap(
          (row) => readReferenceFoodName(row.description).words
        )
      ),
    ];
    const sharing = (word: string) =>
      words.filter((w) => w !== word && stemOf(w) === stemOf(word)).sort();
    const touched = words
      .filter((w) => /(ch|sh|x|ss|z)es$/.test(w) || /ves$/.test(w))
      .sort();
    // Two nets, because neither catches what the other does. This total counts
    // every merge the stemmer makes over the whole corpus, however it made it,
    // so a fifth rule reaching endings the table below does not enumerate still
    // fails here — it was 120 before the two #138 rules added their pair each,
    // and 122 before #144's filters took 76 rows and the words only they carried.
    // It cannot see a rule that BREAKS a merge while adding one, which is
    // exactly the blanket "-ves" shape; the table below is what catches that,
    // by pinning "olives" to the singular it still has to answer.
    const merged = new Set(words.map(stemOf));
    expect(words.length - merged.size).toBe(112);

    expect(touched.map((w) => [w, stemOf(w), sharing(w)])).toEqual([
      ["additives", "additive", []],
      ["chives", "chive", []],
      ["classes", "class", []],
      ["cloves", "clove", []],
      ["halves", "halve", []],
      // The two intended merges, and the only two.
      ["leaves", "leaf", ["leaf"]],
      ["molasses", "molass", []],
      // Not a new merge — the bare "s" rule has always made "olives" answer
      // "olive", and this is the pair a blanket "-ves" rule would break by
      // stemming the plural to "olif" instead. Same for a typed "chive" or
      // "clove", whose singulars this corpus happens not to carry as words.
      ["olives", "olive", ["olive"]],
      ["peaches", "peach", []],
      ["radishes", "radish", ["radish"]],
    ]);
  });

  it("leads with the oil a query names, not the blend that mentions it", () => {
    // #124: USDA writes a food "Noun, adjective, …" while everyday English says
    // "adjective noun", so the discriminating word lands in a qualifier — and
    // nothing in the key looked past the head at WHERE a match fell. All three
    // of these tied on every key, and `Array.sort`'s stability handed the answer
    // to whichever fdcId was lower.
    expect(descriptionsFor("olive oil")[0]).toBe(
      "Oil, olive, salad or cooking"
    );
    expect(descriptionsFor("coconut oil")[0]).toBe("Oil, coconut");
    expect(descriptionsFor("cheddar cheese")[0]).toBe(
      "Cheese, cheddar, sharp, sliced"
    );
  });

  it("still leads with the same food on every query the key must not disturb", () => {
    // #124's must-not-regress set, measured true under every placement tried
    // for the new key — so this is a guard rather than a hope. It is the same
    // roster the cases above this one assert one at a time, gathered here as the
    // thing a fifth key has to clear before it lands.
    for (const [query, expected] of [
      ["pot", "Potatoes, flesh and skin, raw"],
      ["pota", "Potatoes, flesh and skin, raw"],
      ["potato", "Potatoes, flesh and skin, raw"],
      ["potatoes", "Potatoes, flesh and skin, raw"],
      ["tomato", "Tomatoes, yellow, raw"],
      ["grape", "Grapes, muscadine, raw"],
      ["gra", "Grapes, muscadine, raw"],
      ["balsamic", "Vinegar, balsamic"],
      ["soy milk", "Soy milk, unsweetened, plain, shelf stable"],
    ] as const) {
      expect([query, descriptionsFor(query)[0]]).toEqual([query, expected]);
    }
  });

  it("leads with the plain form of a food, not a cooked or imitated one", () => {
    // #143. When the query IS a food's head phrase, every candidate matches at
    // word index 0 and ties on all five keys before this one, so `Array.sort`'s
    // stability handed the answer to whichever fdcId was lowest. These six are
    // the cases the sixth key decides, measured against the gold set in
    // `docs/research/143-gold-set.json`.
    for (const [query, expected] of [
      ["millet", "Millet, whole grain"],
      ["rice noodles", "Rice noodles, dry"],
      ["teff", "Teff, uncooked"],
      ["tempeh", "Tempeh"],
      ["vanilla extract", "Vanilla extract"],
      // Not spinach: #130 §8's claim that neither copy of `Spinach, raw` ships
      // was an artifact of a broken absence tool, and #137 found the row all
      // along — SR Legacy's `Spinach, raw` shares ndb 11457 with Foundation's
      // `Spinach, mature` and merges into it. With the discarded name carried as
      // an alias the `raw` key decides this two rungs above the plain one, which
      // is what the pin was written to catch.
    ] as const) {
      expect([query, descriptionsFor(query)[0]]).toEqual([query, expected]);
    }
  });

  it("does not demote a prepared or modified food the query asked for", () => {
    // #143's reason for having no query-aware branch: retrieval admits a row
    // only when EVERY typed token matches it, so a typed marker word is present
    // in every retrieved row and the key ties across all of them. If that ever
    // stops holding, someone searching "boiled egg" starts being handed a row
    // that is not boiled, and this is where it shows up.
    for (const [query, marker] of [
      ["boiled egg", "boil"],
      ["cooked rice", "cook"],
      ["low fat milk", "low"],
      ["imitation cheese", "imitation"],
      ["roasted chicken", "roast"],
    ] as const) {
      const found = descriptionsFor(query);
      expect(found.length).toBeGreaterThan(0);
      expect(found.filter((d) => !d.toLowerCase().includes(marker))).toEqual(
        []
      );
    }
  });

  it("keeps leading with the generic animal row, which USDA names by its parts", () => {
    // #143 measured a companion key preferring a WHOLE food over a part of it
    // and rejected it: USDA names its most GENERIC animal rows with part
    // vocabulary, so part markers select FOR the canonical row. These four are
    // the leads that key broke. They are pinned as the reason it is not here.
    for (const [query, expected] of [
      [
        "chicken",
        "Chicken, broilers or fryers, meat and skin and giblets and neck, raw",
      ],
      ["turkey", "Turkey, whole, meat and skin, raw"],
      [
        "lamb",
        'Lamb, composite of trimmed retail cuts, separable lean and fat, trimmed to 1/4" fat, choice, raw',
      ],
    ] as const) {
      expect([query, descriptionsFor(query)[0]]).toEqual([query, expected]);
    }
  });

  it("still needs raw simplicity, which the reserved slot was to have absorbed", () => {
    // ADR-0042's #124 Amendment reserved this slot for a key that would absorb
    // `simplicity` "without loss". #143 measured that and it is false: deleting
    // `simplicity` breaks five cases measured as already correct. This pins one
    // of them, so the claim cannot be quietly re-adopted.
    //
    // The row moved with #137 and the key did not: the merge discarded SR
    // Legacy's `Bananas, raw`, and carrying it as an alias gives the surviving
    // row a name that ends in ", raw" — simplicity 3, against the 2 that had
    // been winning this. Plain bananas over overripe ones.
    expect(descriptionsFor("bananas")[0]).toBe(
      "Bananas, ripe and slightly ripe, raw"
    );
  });

  it("changes only the order a query returns, never the set", () => {
    // #124's hard invariant, and what decouples it from the vocabulary work in
    // #139/#140, which fires on whether a query retrieves anything at all. The
    // new key is consulted only after retrieval has already admitted a row, so
    // the retrieved SET is a function of `tier > 0` alone — asserted here by
    // scoring every row against a spread of queries and checking that the
    // admitted set is exactly the set the tiers admit, independent of order.
    for (const query of [
      "olive oil",
      "cheddar cheese",
      "pot",
      "soy milk",
      "grape",
      "raw beef",
      "b",
    ]) {
      const rank = compileReferenceFoodQuery(query);
      const admitted = corpus.foods.filter((food) => rank(food.name).tier > 0);
      const returned = new Set(
        searchIndexRows(corpus, query).hits.map(({ row }) => row.description)
      );
      // Every returned row was admitted, and the cap is the only thing that
      // ever removes one.
      for (const description of returned)
        expect(admitted.some((f) => f.row.description === description)).toBe(
          true
        );
      expect(returned.size).toBe(
        Math.min(admitted.length, SEARCH_RESULT_LIMIT)
      );
    }
  });

  it("gives every retrieved row a position, so the key needs no sentinel", () => {
    // The invariant the key rests on: a row is admitted when every token
    // prefix-matches some word OR every token stem-matches some word, so under
    // either branch each token has a first answering word. If this ever fails,
    // a sentinel is not the fix — retrieval has broken.
    for (const query of ["olive oil", "grap", "raw", "soy milk", "b"]) {
      const rank = compileReferenceFoodQuery(query);
      const admitted = corpus.foods
        .map((food) => rank(food.name))
        .filter((key) => key.tier > 0);
      expect(admitted.length).toBeGreaterThan(0);
      for (const key of admitted)
        expect(Number.isFinite(key.position)).toBe(true);
    }
  });

  it("puts 186 more rows first by their own name, and takes none away", () => {
    // ADR-0042's #136 Amendment measured 356 rows that are not first when
    // searched by their own full description, 337 of them tied on every key.
    // #124's amendment predicted its key would break none of those, and that
    // prediction is wrong: a self-name query is a row's WHOLE description, not
    // its head phrase, so "Cheese, cheddar" places "cheddar" at word 1 in the
    // row itself and at word 3 in "Cheese, pasteurized process, cheddar or
    // American, low sodium". The key reads that, and 356 falls to 172.
    //
    // Pinned as the two counts rather than the one, because a later key could
    // improve the total while quietly costing a row that leads today. Nothing
    // regressed here: 184 rows gained the lead and none lost it.
    // 4,360 queries over 4,360 rows, so the winner is taken in one pass rather
    // than by sorting each result list — the sort costs seconds, the scan does
    // not, and only the leading row is being asked about. Each query is ordered
    // twice: once under the shipped keys, and once under the four that preceded
    // the position key, which is the only way to say which DIRECTION a row moved.
    const leaderUnder = (
      compare: (a: RelevanceKey, b: RelevanceKey) => number,
      rank: ReturnType<typeof compileReferenceFoodQuery>
    ) => {
      let best = "";
      let bestKey: RelevanceKey | null = null;
      for (const other of corpus.foods) {
        const key = rank(other.name);
        if (key.tier === 0) continue;
        if (bestKey === null || compare(key, bestKey) < 0) {
          best = other.row.description;
          bestKey = key;
        }
      }
      return best;
    };
    const withoutPosition = (a: RelevanceKey, b: RelevanceKey) =>
      b.tier - a.tier ||
      b.raw - a.raw ||
      b.head - a.head ||
      b.simplicity - a.simplicity;

    let notFirst = 0;
    let gained = 0;
    let lost = 0;
    for (const food of corpus.foods) {
      const rank = compileReferenceFoodQuery(food.row.description);
      const before = leaderUnder(withoutPosition, rank);
      const after = leaderUnder(compareRelevance, rank);
      if (after !== food.row.description) notFirst++;
      if (before !== food.row.description && after === food.row.description)
        gained++;
      if (before === food.row.description && after !== food.row.description)
        lost++;
    }
    // The total AND the split. A later key could reach 163 while quietly costing
    // a row that leads today, and the total alone would not notice.
    //
    // Re-measured for #143's `plain` key, which #143 §8.8 required: 184 gained
    // and 172 not-first became 192 and 164. #144's filters then took 76 rows out
    // of the corpus, and with them six of the rows that had gained a lead and one
    // that was not first — 186 and 163. `lost` is the invariant and is still
    // zero: neither the sixth key nor the smaller corpus took the lead from a row
    // that already held it. The baseline this diffs against is the pre-#124
    // order, so both keys are being measured here at once.
    expect({ notFirst, gained, lost }).toEqual({
      notFirst: 163,
      gained: 186,
      lost: 0,
    });
  }, 30_000);

  it("names every shipped row by its own full description", () => {
    // The blunt statement of the same defect: 4,394 of the then-4,429 rows scored
    // NO_MATCH against their OWN description, because the commas in it survived
    // tokenisation. Every row now reaches its own top rung — the query IS the
    // head phrase — and a row that does not is one whose own name has stopped
    // naming it.
    const misnamed = corpus.foods.filter(
      (food) =>
        compileReferenceFoodQuery(food.row.description)(food.name).tier < 50
    );
    expect(misnamed.map((food) => food.row.description)).toEqual([]);
  });
});

// ── One index row -> the food twin payload the app ingests ──────────────────

// The Foundation banana, whose SR Legacy twin (173944, "Bananas, raw") filled
// the fields Foundation is silent about — so one row exercises every optional
// the mapper reads: category, scientific name, portions and `merged_from`.
const BANANA = "Bananas, ripe and slightly ripe, raw";

const rowFor = (description: string): UsdaIndexRow => {
  const row = index.foods.find((f) => f.description === description);
  if (!row) throw new Error(`no index row for “${description}”`);
  return row;
};

describe("the twin merge's discarded names, as search aliases", () => {
  /** A corpus of hand-built rows, so the cases are the ones being reasoned about. */
  const corpusOf = (foods: UsdaIndexRow[]) =>
    buildSearchCorpus({
      artifact: "usda-search-index",
      schema_version: 3,
      generated_from: [],
      vocabulary_off: {
        licence: "ODbL",
        source: "Open Food Facts",
        url: "https://example.invalid/x.json",
        sha256: "abc",
        expansions: {},
      },
      foods,
    });
  const row = (
    fdcId: number,
    description: string,
    also?: string[]
  ): UsdaIndexRow => ({
    fdcId,
    description,
    dataType: "Foundation",
    macros: { calories: 1 },
    ...(also ? { also } : {}),
  });

  it("reaches a food by the name the merge discarded", () => {
    const corpus = corpusOf([
      row(1, "Spinach, mature", ["Spinach, raw"]),
      row(2, "Spinach, cooked, boiled, drained, without salt"),
    ]);

    expect(
      searchIndexRows(corpus, "spinach raw").hits.map((h) => h.row.description)
    ).toEqual(["Spinach, mature"]);
  });

  it("lets the discarded name win the ordering when it is the better one", () => {
    // `Bananas, raw` retrieved the row before this change and still lost, because
    // the surviving name buries "raw" behind two qualifiers. The alias is read as
    // a name in its own right, so its `simplicity` is the one that counts.
    const corpus = corpusOf([
      row(1, "Bananas, dehydrated, or banana powder"),
      row(2, "Bananas, ripe and slightly ripe, raw", ["Bananas, raw"]),
    ]);

    expect(searchIndexRows(corpus, "bananas raw").hits[0].row.fdcId).toBe(2);
  });

  it("keeps the food's own name the one it is shown and staged under", () => {
    // Search-only: an alias says the row answers to that name, never that the
    // row IS it. Nothing is appended the way a vocabulary key is (ADR-0049).
    const corpus = corpusOf([row(1, "Spinach, mature", ["Spinach, raw"])]);
    const [hit] = searchIndexRows(corpus, "spinach raw").hits;

    expect(hit.row.description).toBe("Spinach, mature");
    expect(hit.alias).toBeUndefined();
    expect(mapIndexRowToPayload(hit.row).attributes["food/name"]).toBe(
      "Spinach, mature"
    );
  });

  it("never lets an alias demote the name the row ships under", () => {
    // The best key of ALL the row's names wins, so carrying a worse-matching
    // alias cannot cost a row a place it holds on its own name.
    const withAlias = corpusOf([
      row(1, "Peppers, bell, green, raw", ["Peppers, sweet, green, raw"]),
      row(2, "Peppers, hot chili, green, raw"),
    ]);
    const without = corpusOf([
      row(1, "Peppers, bell, green, raw"),
      row(2, "Peppers, hot chili, green, raw"),
    ]);

    expect(searchIndexRows(withAlias, "bell peppers").hits[0].row.fdcId).toBe(
      searchIndexRows(without, "bell peppers").hits[0].row.fdcId
    );
  });

  it("answers a row with no alias exactly as it did before", () => {
    const corpus = corpusOf([row(1, "Kale, raw")]);

    expect(searchIndexRows(corpus, "kale").hits).toHaveLength(1);
  });

  // ── over the committed artifact ───────────────────────────────────────────
  // The cases #137 was filed on, against the rows the app actually ships. Every
  // one of these retrieved NOTHING before the aliases, and each is a food whose
  // record was in the corpus the whole time under USDA's other name for it.

  it("reaches the foods whose archived names the merge discarded", () => {
    for (const [query, description] of [
      ["spinach raw", "Spinach, mature"],
      ["millet raw", "Millet, whole grain"],
      ["shiitake mushrooms raw", "Mushrooms, shiitake"],
      ["egg whole raw fresh", "Eggs, Grade A, Large, egg whole"],
      ["heavy whipping cream", "Cream, heavy"],
      ["sweet peppers green", "Peppers, bell, green, raw"],
      ["pak-choi", "Cabbage, bok choy, raw"],
      ["butter without salt", "Butter, stick, unsalted"],
    ])
      expect([query, descriptionsFor(query)[0]]).toEqual([query, description]);
  });

  it("leads with the food whose archived name is the better-formed one", () => {
    // Retrieval was never the problem for these three; the ordering was. The
    // surviving name buries "raw" behind qualifiers the archived name does not
    // have, so `simplicity` had nothing to prefer.
    expect(descriptionsFor("bananas raw")[0]).toBe(
      "Bananas, ripe and slightly ripe, raw"
    );
    expect(descriptionsFor("cabbage raw")[0]).toBe("Cabbage, green, raw");
    expect(descriptionsFor("carrots raw")[0]).toBe("Carrots, mature, raw");
  });

  it("carries an alias only where USDA held a second name for the food", () => {
    const aliased = index.foods.filter((food) => food.also);

    // 80, not #137's 87: an alias exists because a merge discarded a name, so
    // the eight pairs ADR-0051 refuses to merge mint none — each ships under its
    // own name instead. Seven of the eight were aliased here before the split;
    // the eighth's merged row never survived the filters (`Orange juice, raw`).
    expect(aliased).toHaveLength(80);
    // Never the row's own name back to it, and never a name it already reads as.
    for (const food of aliased)
      expect(food.also).not.toContain(food.description);
  });
});

describe("mapIndexRowToPayload", () => {
  it("carries identity, the macros a result row renders, and the portions", () => {
    const payload = mapIndexRowToPayload(rowFor(BANANA));
    expect(payload.entity).toBe("fdc:1105314");
    expect(payload.attributes["food/name"]).toBe(BANANA);
    const panel = payload.attributes[NUTRITION_INFO_ATTR] as NutritionInfo;
    expect(panel.serving_size).toBe(PER_100G);
    expect(panel.calories).toBeGreaterThan(0);
    expect(panel.protein_content).toBeGreaterThan(0);
    expect(payload.attributes[FOOD_PORTIONS_ATTR]).toBeInstanceOf(Array);
  });

  it("keeps the food-identity scalars the source carried, and omits the rest", () => {
    const banana = mapIndexRowToPayload(rowFor(BANANA));
    expect(banana.attributes["food/category"]).toBe("Fruits and Fruit Juices");
    expect(banana.attributes["food/scientific_name"]).toBe(
      "Musa acuminata Colla"
    );
    // SR Legacy usually has no scientific name; absent stays absent, never "".
    const noScientificName = index.foods.find((f) => !f.scientificName);
    expect(noScientificName).toBeDefined();
    expect(
      mapIndexRowToPayload(noScientificName!).attributes
    ).not.toHaveProperty("food/scientific_name");
  });

  it("keeps twin/raw_provenance present, naming the canonical USDA URI", () => {
    // Its presence is load-bearing: the origin badge reads the envelope's
    // adapter and FoodCard reads that the blob is there (ADR-0047 §7).
    const provenance = mapIndexRowToPayload(rowFor(BANANA)).attributes[
      "twin/raw_provenance"
    ] as RawProvenance<UsdaIndexRow>;
    expect(provenance.adapter).toBe("fdc");
    expect(provenance.source_uri).toBe(
      "https://api.nal.usda.gov/fdc/v1/food/1105314"
    );
    expect(provenance.raw_data.fdcId).toBe(1105314);
  });

  it("still names the SR Legacy twin whose values the panel borrowed", () => {
    // ADR-0045 §4: a merged panel must never read as one record USDA served,
    // and with hydration retired the generated row is the only carrier.
    const merged = index.foods.find((f) => f.merged_from);
    expect(merged).toBeDefined();
    const provenance = mapIndexRowToPayload(merged!).attributes[
      "twin/raw_provenance"
    ] as RawProvenance<UsdaIndexRow>;
    expect(provenance.merged_from?.[0].filled_fields.length).toBeGreaterThan(0);
  });

  it("omits merged_from entirely for a food that merged nothing", () => {
    const unmerged = index.foods.find((f) => !f.merged_from);
    const provenance = mapIndexRowToPayload(unmerged!).attributes[
      "twin/raw_provenance"
    ] as RawProvenance<UsdaIndexRow>;
    expect(provenance).not.toHaveProperty("merged_from");
  });
});

// ── The search a keystroke actually runs ─────────────────────────────────────

describe("searchUsdaCorpus", () => {
  const loadFixture = async () => corpus;

  it("answers from the bundled index, with no key and no network", async () => {
    // No fetch is stubbed and no key is configured: if either were reached the
    // call would throw rather than return foods.
    const { foods } = await searchUsdaCorpus("banana", loadFixture);
    expect(foods[0].attributes["food/name"]).toMatch(/^Bananas,/);
    expect(foods[0].attributes["nutrition/info"].calories).toBeGreaterThan(0);
  });

  it("returns nothing for an empty query", async () => {
    expect(await searchUsdaCorpus("  ", loadFixture)).toEqual({
      phrases: [],
      foods: [],
    });
  });
});

// ── Staging: the full panel, read out of the Nutrient store (#114) ───────────
// A search row renders four macros (ADR-0047 §2), so the other nineteen panel
// fields are read from the Nutrient store when the food is staged. These assert
// the store answers with the SAME panel the mapper builds from a live record —
// the drift the two artifacts could otherwise develop is invisible in the app
// and permanent in the ledger, because a log freezes its own macros (ADR-0022).

const store: NutrientStore = JSON.parse(
  readFileSync("public/usda/nutrient-store.json", "utf8")
);

/** A Nutrient store holding one food, for the normalisation cases. */
const storeOf = (
  amounts: Record<string, number>,
  nutrients: NutrientStore["nutrients"]
): NutrientStore => ({
  artifact: "usda-nutrient-store",
  schema_version: 2,
  generated_from: [],
  nutrients,
  foods: { "1": amounts },
});

describe("storedPanelFor", () => {
  it("fills the nineteen panel fields a search row does not carry", () => {
    const panel = storedPanelFor(store, 1105314);
    expect(panel?.serving_size).toBe(PER_100G);
    // The row carries these four; the store has to reproduce them exactly, or a
    // staged food's panel would disagree with the list it was chosen from.
    expect(panel).toMatchObject(rowFor(BANANA).macros);
    // And these nineteen are what staging is for.
    expect(panel?.fiber_content).toBe(1.7);
    expect(panel?.sugar_content).toBe(15.8);
    expect(panel?.saturated_fat_content).toBe(0.112);
    expect(panel?.potassium).toBeCloseTo(0.326, 6);
    expect(panel?.vitamin_c).toBeCloseTo(0.0123, 6);
  });

  it("rebuilds every row's macros exactly, across the whole corpus", () => {
    // The two artifacts are generated from one merged record, so a row's macros
    // and the store's amounts are the same numbers twice. Assert it over all
    // 4,360 rather than on one food: a generator change that filled one artifact
    // and not the other would otherwise ship silently.
    const disagreeing = index.foods.filter((row) => {
      const panel = storedPanelFor(store, row.fdcId);
      return (
        !panel ||
        Object.entries(row.macros).some(
          ([key, value]) => panel[key as keyof NutritionInfo] !== value
        )
      );
    });
    expect(disagreeing).toEqual([]);
  });

  it("carries the fields a merged food borrowed from its SR Legacy twin", () => {
    // ADR-0045 §2 merges at panel-field granularity and the store holds the
    // merged record's nutrients, so a borrowed field has to survive into the
    // staged panel — `merged_from` naming a field the panel then lacks would be
    // a provenance claim about a value nobody can see.
    const merged = index.foods.find((f) => f.merged_from);
    const panel = storedPanelFor(store, merged!.fdcId);
    for (const field of merged!.merged_from![0].filled_fields)
      expect(panel?.[field as keyof NutritionInfo]).toBeDefined();
  });

  it("normalises USDA's published units to the panel's grams", () => {
    // The archives write micrograms as "µg" where the API wrote "UG", and the
    // panel's fixed unit is grams (ADR-0021).
    const panel = storedPanelFor(
      storeOf(
        { "1087": 5, "1106": 1 },
        {
          "1087": { name: "Calcium, Ca", unit: "mg" },
          "1106": { name: "Vitamin A, RAE", unit: "µg" },
        }
      ),
      1
    );
    expect(panel?.calcium).toBeCloseTo(0.005, 9);
    expect(panel?.vitamin_a).toBeCloseTo(0.000001, 12);
  });

  it("reads energy through the Atwater fallback a Foundation food needs", () => {
    // Foundation records omit 1008 and publish Atwater factors instead, so a
    // stored panel that only looked at 1008 would stage them at no calories.
    const panel = storedPanelFor(
      storeOf(
        { "2047": 88 },
        { "2047": { name: "Energy (Atwater General Factors)", unit: "kcal" } }
      ),
      1
    );
    expect(panel?.calories).toBe(88);
  });

  it("sums mono and poly into the one unsaturated fat the panel has", () => {
    const panel = storedPanelFor(
      storeOf(
        { "1292": 0.032, "1293": 0.073 },
        {
          "1292": { name: "Fatty acids, total monounsaturated", unit: "g" },
          "1293": { name: "Fatty acids, total polyunsaturated", unit: "g" },
        }
      ),
      1
    );
    expect(panel?.unsaturated_fat_content).toBeCloseTo(0.105, 6);
  });

  it("has no panel for a food the store does not carry", () => {
    expect(storedPanelFor(store, 4242424242)).toBeUndefined();
  });
});

describe("completeStagedPanel", () => {
  const loadStore = async () => store;

  it("stages a searched food on its full panel, with no key and no network", async () => {
    // No fetch is stubbed: the panel comes out of the committed artifact or the
    // call fails. This is the ADR-0047 §6 claim — staging needs no second
    // request now that the archives ship with the app.
    const staged = await completeStagedPanel(
      mapIndexRowToPayload(rowFor(BANANA)),
      loadStore
    );
    const panel = staged.attributes[NUTRITION_INFO_ATTR] as NutritionInfo;
    expect(panel.potassium).toBeCloseTo(0.326, 6);
    expect(panel.calories).toBe(rowFor(BANANA).macros.calories);
  });

  it("leaves identity, portions and provenance exactly as the row wrote them", async () => {
    // Only the panel deepens. `twin/raw_provenance` stays present and stays the
    // generated row (ADR-0047 §7) — the origin badge reads its adapter and
    // FoodCard reads that it is there.
    const before = mapIndexRowToPayload(rowFor(BANANA));
    const after = await completeStagedPanel(before, loadStore);
    expect(after.entity).toBe(before.entity);
    expect(after.attributes["food/name"]).toBe(before.attributes["food/name"]);
    expect(after.attributes[FOOD_PORTIONS_ATTR]).toEqual(
      before.attributes[FOOD_PORTIONS_ATTR]
    );
    const provenance = after.attributes[
      "twin/raw_provenance"
    ] as RawProvenance<UsdaIndexRow>;
    expect(provenance.raw_data.fdcId).toBe(1105314);
    expect(provenance.merged_from?.[0].source_uri).toContain("173944");
  });

  it("does not read the store for a food that did not come from the corpus", async () => {
    // A scanned OFF product or a manual entry carries its own panel and has no
    // row in the store; loading a 4 MB artifact to learn that would be a cost
    // paid on every scan.
    const off: EntityPayload = {
      entity: "off:5000112637922",
      attributes: { "food/name": "Cola" },
    };
    const untouched = await completeStagedPanel(off, () => {
      throw new Error("the Nutrient store was loaded for a non-USDA food");
    });
    expect(untouched).toBe(off);
  });

  it("keeps the row's macros when the store carries no entry for the food", async () => {
    // A row the store has no nutrients for still stages and still logs, on the
    // four macros it carries — a partial artifact degrades the panel, never the
    // food.
    const row: UsdaIndexRow = { ...rowFor(BANANA), fdcId: 4242424242 };
    const staged = await completeStagedPanel(
      mapIndexRowToPayload(row),
      loadStore
    );
    expect(staged.attributes[NUTRITION_INFO_ATTR]).toEqual({
      serving_size: PER_100G,
      ...row.macros,
    });
  });
});

// ── Loading the artifacts ───────────────────────────────────────────────────

describe("loadNutrientStore", () => {
  it("retries after a failed load instead of caching the failure", async () => {
    // The store is warmed at startup, where the likeliest failure is a service
    // worker that has not taken control yet. A cached rejection would then stage
    // every food of the session on four macros — silently, and permanently once
    // logged (ADR-0022).
    vi.resetModules();
    const { loadNutrientStore } =
      await import("../../src/lib/food/usda-corpus");
    const fetches = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValue({ ok: true, json: async () => store } as Response);

    await expect(loadNutrientStore()).rejects.toThrow(/503/);
    await expect(loadNutrientStore()).resolves.toBe(store);
    // ...and the load that succeeded IS memoised: one parse per session.
    await loadNutrientStore();
    expect(fetches).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });
});
