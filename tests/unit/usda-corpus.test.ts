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
} from "../../src/lib/food/usda-food-kind";
import { resolveVariantDrops } from "../../src/lib/food/usda-variant-drops";
import {
  compareRelevance,
  compileReferenceFoodQuery,
  isSeparatedFat,
  qualifiersOf,
  readReferenceFoodName,
  readRowRank,
  withoutStrayMentions,
  stemOf,
  type RelevanceKey,
} from "../../src/lib/food/reference-food-ranking";
import type { RawProvenance } from "../../src/lib/food/provenance";
import type { EntityPayload } from "../../src/lib/ingestion/ingest";

// The committed artifact itself is the fixture (ADR-0047 §3). Search is only
// keyless and offline if it answers from THIS file, so the ADR-0042 ordering
// cases are asserted over the 4,238 rows the app actually ships rather than
// over a hand-built stand-in that could agree with the code and not the data.
const index: SearchIndex = JSON.parse(
  readFileSync("public/usda/search-index.json", "utf8")
);

/**
 * The 72 beef rows USDA published as New Zealand imports and #157 left standing,
 * by identity rather than by name.
 *
 * A literal list because ADR-0056 took `New Zealand, imported` out of the
 * descriptions, so the prefix that used to count this population no longer
 * exists in the artifact. A rename that erases the evidence for an older
 * measurement has to leave the measurement askable, or the older decision
 * quietly stops being checked.
 */
const NZ_IMPORT_BEEF_157: readonly number[] = [
  173073, 173074, 173075, 173076, 173077, 173078, 173079, 173080, 173081,
  173082, 173083, 173084, 173085, 173087, 173088, 173089, 173090, 173091,
  173092, 173093, 173094, 173095, 173096, 173097, 173098, 173099, 173100,
  173101, 173102, 173103, 173104, 173105, 173106, 173107, 173108, 173109,
  174715, 174716, 174717, 174718, 174719, 174720, 174721, 174722, 174723,
  174724, 174725, 174726, 174727, 174728, 174729, 174731, 174732, 174733,
  174734, 174735, 174736, 174737, 174738, 174739, 174740, 174741, 174742,
  174743, 174744, 174745, 174746, 174747, 174748, 174749, 174750, 174751,
];
const corpus = buildSearchCorpus(index);
const descriptionsFor = (query: string): string[] =>
  searchIndexRows(corpus, query).hits.map(({ row }) => row.description);

/**
 * Every row a phrase retrieves, keyed the way the search keys it: as the best of
 * ALL the row's names, its own and any the twin merge discarded (#137), with the
 * row's own two keys spread on. A restatement over descriptions alone measures a
 * corpus the app no longer searches.
 */
const scoredFor = (phrase: string) => {
  const rank = compileReferenceFoodQuery(phrase);
  return corpus.foods
    .map((food) => ({
      food,
      key: [food.name, ...food.also]
        .map((name) => ({ ...rank(name), ...food.rank }))
        .reduce((best, key) => (compareRelevance(key, best) < 0 ? key : best)),
    }))
    .filter(({ key }) => key.tier > 0);
};

describe("the bundled search index", () => {
  it("carries no commercial origin qualifier, in a description or an alias", () => {
    // ADR-0056 §3's tripwire. The words leave the artifact entirely and are kept
    // nowhere — the archives are the way back — so a regression that stopped
    // stripping them, or a refresh that produced a twin alias carrying one,
    // fails here rather than quietly making `new zealand` searchable again.
    const origin = /(^|,\s*)(new zealand|australian|imported)\s*(,|$)/i;
    const leaking = index.foods.filter(
      (row) =>
        origin.test(row.description) ||
        (row.also ?? []).some((alias) => origin.test(alias))
    );
    expect(leaking.map((row) => row.description)).toEqual([]);
  });

  it("keeps the designated rows, and no tribal tag on any name", () => {
    // ADR-0056's Amendment takes every parenthesised population tag off the
    // name. The designation is not lost by that — it is on `foodCategory`, which
    // is where ADR-0055 §4's ranking key reads it, "never on the parenthesised
    // name tags".
    const TAG =
      /\((alaska native|navajo|apache|southwest|northern plains indians|klamath|hopi|shoshone bannock)\)/i;
    expect(
      index.foods.filter(
        (row) =>
          TAG.test(row.description) ||
          (row.also ?? []).some((alias) => TAG.test(alias))
      )
    ).toEqual([]);

    // 146 of the original 151 stay. Five leave, and one row that was NOT
    // designated leaves with them — which is the point of settling a collision
    // on panel completeness rather than on whose food it is. The Alaska Native
    // chum salmon carries 112 nutrient fields against the general row's 70, so
    // the general row is the one that goes.
    const designated = index.foods.filter(
      (row) => row.foodCategory === "American Indian/Alaska Native Foods"
    );
    expect(designated.length).toBe(146);
    const descriptions = index.foods.map((row) => row.description);
    expect(descriptions).toContain("Fish, Salmon, Chum, raw");
    expect(
      index.foods.find((row) => row.description === "Fish, Salmon, Chum, raw")
        ?.foodCategory
    ).toBe("American Indian/Alaska Native Foods");

    // Brackets USDA uses for anything else are untouched: a local name, a
    // species, a dish's English gloss.
    expect(descriptions).toContain("Seal, bearded (Oogruk), meat, raw");
    expect(descriptions).toContain(
      "Agutuk, fish with shortening (Alaskan ice cream)"
    );
  });

  it("keeps the origin words where they are the food's own name", () => {
    // The positional rule is the whole safety argument, and this is the case it
    // was built for. New Zealand spinach is Tetragonia, not Spinacia: 12 kcal
    // and 0.66 mg iron against 23 and 3.57. The corpus holds no `Spinach, raw`
    // row, so a collision guard has nothing to notice and would let a lexical
    // rule file this plant under real spinach's name (ADR-0055 §7).
    const descriptions = index.foods.map((row) => row.description);
    for (const kept of [
      "New Zealand spinach, raw",
      "New Zealand spinach, cooked, boiled, drained, without salt",
      "New zealand spinach, cooked, boiled, drained, with salt",
    ])
      expect([kept, descriptions.includes(kept)]).toEqual([kept, true]);
  });

  it("keeps an import that no plain row contests", () => {
    // Tripe is New Zealand-only, so nothing collides with its stripped name and
    // it stays — renamed, not dropped. The same line that leaves mutton in the
    // corpus (ADR-0055 §1): a drop here is caused by a name being taken, never
    // by whose food it is.
    const descriptions = index.foods.map((row) => row.description);
    expect(descriptions).toContain("Beef, tripe cooked, boiled");
    expect(descriptions).toContain("Beef, tripe uncooked, raw");
  });

  it("ships exactly one of each beef organ ADR-0056 collapsed", () => {
    // The cost, pinned where it can be read. Four organs USDA published twice —
    // once plain, once as a New Zealand import — are now published once, and the
    // import's figures are gone with it. For liver that means the corpus keeps
    // 4,970 ugRAE of vitamin A and no longer holds the 28,300 the import
    // measured, on a nutrient this app meters as a LIMIT. ADR-0056's Consequences state
    // that; this makes it fail loudly if a later change reintroduces the twin
    // without revisiting the decision.
    const organs = index.foods
      .map((row) => row.description)
      .filter((d) => /^Beef, (heart|liver|tongue|kidney)/i.test(d))
      .sort();
    expect(organs).toEqual([
      "Beef, heart, cooked, simmered",
      "Beef, heart, raw",
      "Beef, kidneys, cooked, simmered",
      "Beef, kidneys, raw",
      "Beef, liver, cooked, braised",
      "Beef, liver, cooked, pan-fried",
      "Beef, liver, raw",
      "Beef, tongue, cooked, simmered",
      "Beef, tongue, raw",
    ]);
  });

  it("ships the nine fortification renames under the names they were measured at", () => {
    // ADR-0062 §2, pinned BY `fdcId`. A rename erases the evidence for a
    // measurement stated over a description (ADR-0056's Consequences), so the
    // count of "rows that lost the phrase" cannot be re-taken from the artifact
    // afterwards — the phrase is precisely what is gone. Nine, and which nine.
    const byId = new Map(
      index.foods.map((row) => [row.fdcId, row.description])
    );
    expect(
      [
        171039, 171278, 171290, 171291, 171302, 171434, 172205, 173432, 173441,
      ].map((fdcId) => [fdcId, byId.get(fdcId)])
    ).toEqual([
      [
        171039,
        "Margarine-like vegetable-oil spread, stick/tub/bottle, 60% fat",
      ],
      [171278, "Milk, goat, fluid"],
      [171290, "Cheese, pasteurized process, American"],
      [171291, "Cheese food, pasteurized process, American"],
      [171302, "Milk, evaporated, 2% fat"],
      [
        171434,
        "Margarine-like, vegetable oil spread, approximately 37% fat, unspecified oils, with salt",
      ],
      [172205, "Milk, reduced fat, fluid, 2% milkfat"],
      // The parenthetical survives, and it has to: USDA wrote no comma before
      // it, so a part-exact strip would have taken the gloss with the phrase.
      // `skim` is a word ADR-0049's `skimmed milk` key expands to, and this is
      // the only row in the corpus that carries it.
      [173432, "Milk, nonfat, fluid (fat free or skim)"],
      [173441, "Milk, fluid, 1% fat"],
    ]);
  });

  it("still answers `skim milk` with the skimmed milk", () => {
    // What the gloss buys, asked of the search rather than of the string.
    // ADR-0049's `skimmed milk` key expands to `skim milk`, and the only row in
    // the corpus carrying `skim` as a word is the one whose parenthetical the
    // fortification strip had to step around.
    expect(descriptionsFor("skim milk")[0]).toBe(
      "Milk, nonfat, fluid (fat free or skim)"
    );
  });

  it("leaves six margarines wearing a name nobody would choose", () => {
    // The price ADR-0062 §3 pays on purpose. Each of these has a twin USDA
    // published without the phrase, so the strip would file two spreads under
    // one name — and unlike ADR-0056 §4 there is no origin here to say which
    // one should lose, so neither is renamed and neither is dropped.
    const byId = new Map(
      index.foods.map((row) => [row.fdcId, row.description])
    );
    for (const [refused, twin] of [
      [171038, 173582],
      [171040, 173585],
      [171041, 172350],
      [171435, 172346],
      [171436, 172347],
      [171437, 172348],
    ] as const) {
      expect([refused, byId.get(refused)]).toEqual([
        refused,
        `${byId.get(twin)}, with added vitamin D`,
      ]);
    }
  });

  it("keeps `fortified` on the rows whose food it names", () => {
    // ADR-0062 §2 keeps the word off the roster because it names a DIFFERENT
    // food: the two processed cheeses renamed above are 371 and 330 kcal, and
    // the `vitamin D fortified` rows beside them 366 and 330 on a different
    // panel. A roster that reached the word would file each pair under one name.
    const byId = new Map(
      index.foods.map((row) => [row.fdcId, row.description])
    );
    expect([171252, 171289, 325198, 173455].map((id) => byId.get(id))).toEqual([
      "Cheese food, pasteurized process, American, vitamin D fortified",
      "Cheese product, pasteurized process, American, vitamin D fortified",
      "Cheese, pasteurized process, American, vitamin D fortified",
      "Cheese product, pasteurized process, American, reduced fat, fortified with vitamin D",
    ]);
  });

  it("carries the plain-sibling flag the ranking cannot derive at load", () => {
    // ADR-0055 §6. A tripwire on the predicate's reach: the flag is baked, so a
    // change to `plainSiblingsOf` that nobody meant shows up as a count here
    // rather than as a silently reordered search months later.
    //
    // 131 to 134 on ADR-0062 §2, which is a rename rather than a key: shortening
    // a name makes a qualifier-prefix relation that did not exist. `Cheese,
    // pasteurized process, American` and its `food` sibling stop naming a
    // fortification and become the plain form of the `low fat` and
    // `vitamin D fortified` rows filed beneath them.
    expect(index.foods.filter((row) => row.plain_sibling).length).toBe(134);
    // Omitted rather than emitted false, like every other absent field.
    expect(index.foods.filter((row) => row.plain_sibling === false)).toEqual(
      []
    );
  });

  it("holds 720 rows whose head phrase is a shelf label, under 18 labels", () => {
    // ADR-0042's #154 Amendment, tripwired the way ADR-0055 §3 tripwired
    // `plainSibling`: the roster is hand-written, so a head phrase added or
    // misspelled shows up as a count here rather than as a quietly reordered
    // search months later (#131 — an unmeasured guard is a hole).
    const shelved = index.foods.filter(
      (row) => readReferenceFoodName(row.description).shelfLength > 0
    );
    expect(shelved.length).toBe(720);
    const labels = new Set(
      shelved.map((row) => qualifiersOf(row.description)[0])
    );
    expect(labels.size).toBe(18);
    // The membership test in one assertion: a shelf label's qualifiers name
    // DISTINCT FOODS, an ordinary head's name parts of the food it already
    // named. Beef is the whole reason the roster is not "any head many rows
    // share" — 959 rows say `Beef`, and every qualifier after it is a cut.
    expect([...labels]).not.toContain("beef");
    expect([...labels]).toContain("alcoholic beverage");
  });

  it("counts the rows each whole-qualifier modifier reaches, and the ones it must not", () => {
    // Why `light` and `cooking` are read as a whole comma-part rather than as a
    // word: as words they reach 46 and 7 rows, and most of those are not a
    // modified anything.
    const withPart = (part: string) =>
      index.foods.filter((row) => qualifiersOf(row.description).includes(part));
    const withWord = (word: string) =>
      index.foods.filter((row) =>
        new RegExp(`\\b${word}\\b`, "i").test(row.description)
      );
    // Both halves of the argument, because only one of them was pinned at
    // first: the whole-qualifier reach is what ships, and the WORD reach is why
    // a second mechanism exists at all. If the words stopped being dangerous,
    // `MODIFIED_PART` would have no reason to be a separate list.
    expect([withWord("light").length, withPart("light").length]).toEqual([
      46, 12,
    ]);
    expect([withWord("cooking").length, withPart("cooking").length]).toEqual([
      7, 1,
    ]);
    // And `non-alcoholic` is in the regex precisely because it is NOT dangerous
    // as a word: both rows it reaches are a drink with the alcohol taken out.
    expect(withWord("non-alcoholic").length).toBe(2);
    // The 34 rows the word `light` would have taken and the qualifier does not.
    // Three of the fifteen went with ADR-0061's light soymilks.
    // Chicken light meat is not a reduced-fat chicken, and a mushroom exposed
    // to ultraviolet light is not a light mushroom.
    for (const description of [
      "Chicken, broilers or fryers, light meat, meat only, raw",
      "Mushroom, white, exposed to ultraviolet light, raw",
    ] as const) {
      expect([description, readReferenceFoodName(description).plain]).toEqual([
        description,
        1,
      ]);
    }
    expect(readReferenceFoodName("Oil, olive, salad or cooking").plain).toBe(1);
  });

  it("is the surviving reference foods, and says which archives it came from", () => {
    expect(index.foods.length).toBe(4238);
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
      "muscle milk",
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

  it("answers 'protein powder' with the supplements, not the trademark", () => {
    // #152. USDA rendered "Muscle Milk" in Title Case, so it read to the caps
    // rule like any cultivar and led the query over the three generic powders
    // behind it. What makes the drop correct is the second assertion, not the
    // first: the denylist names one trademark, and ADR-0055 §7 refused the
    // powder-or-supplement marker that would have taken the aisle with it.
    const found = descriptionsFor("protein powder");
    expect(
      found.filter((description) => /muscle milk/i.test(description))
    ).toEqual([]);
    expect(found.slice(0, 3)).toEqual([
      "Beverages, Protein powder whey based",
      "Beverages, Protein powder soy based",
      "Beverages, Whey protein powder isolate",
    ]);
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

  it("holds no variant of a food it already keeps", () => {
    // The same tripwire for ADR-0061's three rules, which cannot join the five
    // above because they read a row's SIBLINGS rather than its own words. Asked
    // of the finished corpus the answer must be empty: a head phrase that still
    // keeps a plain row beside a flavoured one, a fluid beside a powder, or an
    // unfortified milk beside four fortifications is a regeneration that did not
    // run — or a mirror refresh that put one back.
    expect([
      ...resolveVariantDrops(
        index.foods.map((row) => ({
          fdcId: row.fdcId,
          description: row.description,
        }))
      ),
    ]).toEqual([]);
  });

  it("still offers the base foods the dropped rows were standing in front of", () => {
    // The other half of #131 and #133: a drop is only correct because a generic
    // equivalent stayed. Assert the survivors by name, so a future tightening
    // that cannot tell a brand from a base food, or a wafer from a tub, fails
    // here rather than quietly emptying an aisle.
    const descriptions = index.foods.map((row) => row.description);
    for (const kept of [
      // #131's brand leaks. `Soymilk, original and vanilla, unfortified` stood
      // here as the generic soymilk that had to outlive sixteen "Vitasoy USA …"
      // rows, and ADR-0061 §5 has since taken it — a DIFFERENT rule with a
      // different claim, that USDA's twelve soymilks are variants of one soy
      // milk the corpus keeps under the Foundation row below. The pin moves to
      // that row rather than being deleted, because #131's half of the argument
      // still has to hold: the brand rule is only correct because a generic soy
      // milk stayed.
      "Tofu, raw, firm, prepared with calcium sulfate",
      "Soy milk, unsweetened, plain, shelf stable",
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
      "Tortilla, includes plain and from mutton sandwich",
      // #144: what each of its four new rules had to leave standing.
      // `Bread, cornbread, prepared from recipe, made with low fat (2%) milk`
      // stood here until #161, which is a DIFFERENT rule with a different claim:
      // #144's escape hatches had to leave a staple loaf alone, and they still
      // do (the whole-wheat row below), while #161 drops what USDA computed from
      // a recipe rather than assayed. A pin moving between rules is not a pin
      // being deleted, so it is named here rather than removed silently.
      "Bread, whole-wheat, commercially prepared",
      "Syrups, maple",
      "Beef, chuck for stew, separable lean and fat, select, raw",
      "Flour, wheat, all-purpose, enriched, bleached",
      "Shortening, vegetable, household, composite",
      "Wheat flour, white, cake, enriched",
      // #157: the retail equivalents its three clauses had to leave standing,
      // and the rows the WIDER reading it refused would have deleted. Not one
      // of the last five has a plain twin — `crude` is USDA's word for
      // UNPROCESSED, so these are the only wheat germ, wheat bran, rice bran
      // and corn bran the corpus has, and the only gluten row that is not a
      // gluten-free bread.
      "Oil, soybean",
      "Beef, ground, 80% lean meat / 20% fat, raw",
      "Agutuk, fish with shortening (Alaskan ice cream)",
      "Wheat germ, crude",
      "Wheat bran, crude",
      "Rice bran, crude",
      "Corn bran, crude",
      "Vital wheat gluten",
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
      // #157's thirteen, one per clause. `manufacturing beef` is the trade
      // grade for boneless beef sold to be ground; a confectionery fat names
      // the line it is sold onto; and the lecithin is the emulsifier that stood
      // in `Fats and Oils` in front of the oil.
      "Beef, New Zealand, imported, manufacturing beef, raw",
      "Shortening confectionery, coconut (hydrogenated) and or palm kernel (hydrogenated)",
      "Shortening, special purpose for baking, soybean (hydrogenated) palm and cottonseed",
      "Oil, soybean lecithin",
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
    // 127 and 31 before the escape hatches took four treats and seven
    // confections; 114 until #161 took nine more Baked Products rows that USDA
    // computed from a recipe.
    expect(inCategory("Baked Products")).toBe(105);
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

  it("keeps #157's clauses to the reach they were measured at", () => {
    // #131's rule again: the reach of a drop rule cannot be read off the corpus
    // it emptied, so what is pinned is the population each clause LEFT. A
    // widened clause empties one of these; a narrowed one refills it.
    //
    // That the corpus holds nothing these clauses reject is asserted by asking
    // the predicate, once, in `holds nothing its own filters would reject`
    // above. Restating a marker here would only agree with itself.
    const descriptions = index.foods.map((row) => row.description);
    // Every surviving row that says `shortening` at all: USDA's four `household`
    // spellings, including the one with no comma after the head word, and the
    // one row that says the word somewhere other than the head word. That last
    // row is the whole reason the clause reads the head word rather than the
    // description, because it is a dish and a description-wide marker would
    // have taken it.
    expect(descriptions.filter((d) => /shortening/i.test(d)).sort()).toEqual([
      "Agutuk, fish with shortening (Alaskan ice cream)",
      "Shortening household soybean (hydrogenated) and palm",
      "Shortening, household, lard and vegetable oil",
      "Shortening, household, soybean (partially hydrogenated)-cottonseed (partially hydrogenated)",
      "Shortening, vegetable, household, composite",
    ]);
    // `manufacturing` took two beef rows out of 74 New Zealand imports, leaving
    // 72. That number is the one ADR-0055 §1 protects: it barred a PREVALENCE
    // argument against these rows, and a trade grade is a claim about the
    // specification instead, so the clause takes two and leaves the rest.
    //
    // It can no longer be counted by that prefix, because ADR-0056 took the
    // origin out of the name — which is worth stating rather than quietly
    // rewriting: the rename DESTROYED the evidence this assertion used to read,
    // so the population is pinned by identity instead. Eight of the 72 then left
    // as well, all of them beef offal whose stripped name a plain row already
    // held, leaving 64. Those eight are the whole of what ADR-0056 §4 drops, and
    // they are listed rather than counted so a ninth cannot join them silently.
    const shipped = new Set(index.foods.map((row) => row.fdcId));
    expect(NZ_IMPORT_BEEF_157.filter((id) => shipped.has(id)).length).toBe(64);
    expect(NZ_IMPORT_BEEF_157.filter((id) => !shipped.has(id))).toEqual([
      173081, 173084, 174723, 174727, 174728, 174729, 174737, 174738,
    ]);
    // The row the one-row clause was standing in front of.
    expect(descriptions).toContain("Oil, soybean");
  });

  it("still ships the two candidates #157 refused, as rows", () => {
    // The refusals asserted where they are claimed: `usda-food-kind.test.ts`
    // pins that the PREDICATE does not reach these, which is a fact about a
    // regex. This pins that they are still in the shipped index, which is what
    // "refused" means and what a later generator or filter change could undo
    // without either the predicate or its own test noticing.
    const descriptions = index.foods.map((row) => row.description);
    for (const kept of [
      // A process spec, not a channel: `glucose reduced` says how the food was
      // made. Their plain twins ship too, which is why the retail-twin test
      // could not decide this one.
      "Egg, white, dried, stabilized, glucose reduced",
      "Egg, whole, dried, stabilized, glucose reduced",
      "Egg, white, dried, flakes, stabilized, glucose reduced",
      "Egg, white, dried, powder, stabilized, glucose reduced",
      "Egg, white, dried",
      "Egg, whole, dried",
      // Both a factory input and a tub in a shop, and ADR-0055 §7's refusal of a
      // powder-or-supplement marker is what keeps them.
      "Soy protein isolate",
      "Soy protein isolate, potassium type",
      "Beverages, Whey protein powder isolate",
    ]) {
      expect(descriptions).toContain(kept);
    }
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

  it("still stops the cream ladder a rung below double cream", () => {
    // ADR-0046's #116 Amendment admits a curated stand-in for double cream on
    // the strength of this absence: the UK standard is not less than 48% milk
    // fat, and the fattiest cream any table carries is 35.6 g. The failure this
    // guards is the quiet one — a mirror refresh that adds a 48% cream would
    // leave a branded record standing in front of a real reference food, and
    // nothing else in the suite would notice.

    // The naming-independent half. Whatever USDA were to call such a row, it
    // has to answer these words before it can displace anything.
    expect(descriptionsFor("double cream")).toEqual([]);

    // And the compositional half, for a row arriving under a name the query
    // misses. Dairy creams only: the nut butters and the clarified butters
    // above 48 g are not what a recipe means by cream.
    const creams = index.foods.filter(
      (row) =>
        row.foodCategory === "Dairy and Egg Products" &&
        /\bcream\b/i.test(row.description)
    );
    const fats = creams
      .map((row) => row.macros.fat_content)
      .filter((fat): fat is number => typeof fat === "number");
    // Never `?? 0`: reading an absent fat as a zero would let exactly the row
    // this guards against through it (ADR-0048 §1).
    expect(fats).toHaveLength(creams.length);
    expect(Math.max(...fats)).toBe(35.6);
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
    // 122 before #144's filters took 76 rows and the words only they carried,
    // 112 before #157 took thirteen more, and 108 before ADR-0056's rename took
    // "classes" out of every name that carried it, and 105 before ADR-0061's
    // seventy-four drops took six more with the milks, yogurts and soymilks
    // that carried them. The one merge #144 cost is
    // "cakes"/"cake": the corpus carried "cakes" in exactly one description,
    // `Shortening, special purpose for cakes and frostings`, and a filter drop
    // takes a merge with it the same way it takes a word.
    // It cannot see a rule that BREAKS a merge while adding one, which is
    // exactly the blanket "-ves" shape; the table below is what catches that,
    // by pinning "olives" to the singular it still has to answer.
    const merged = new Set(words.map(stemOf));
    expect(words.length - merged.size).toBe(99);

    expect(touched.map((w) => [w, stemOf(w), sharing(w)])).toEqual([
      ["additives", "additive", []],
      ["chives", "chive", []],
      // "classes" left the corpus with ADR-0056: the word appeared only inside
      // `all classes`, so removing the phrase removed the word, and a merge goes
      // with a word the same way a filter drop takes one.
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
    // `cheddar cheese` used to answer "Cheese, cheddar, sharp, sliced" — this
    // key ties every cheddar and #124's did not separate them either, so the
    // lead was whichever fdcId was lower. ADR-0055 §3 decides it: a sharp sliced
    // cheddar is a qualified form of `Cheese, cheddar`, which is a row.
    expect(descriptionsFor("cheddar cheese")[0]).toBe("Cheese, cheddar");
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

  it("never shrinks the set of gold-set cases that lead correctly", () => {
    // ADR-0055 §2's bar, as a guard rather than a claim. `143-gold-set.json` is
    // the 50 head-phrase ties #143 adjudicated by hand; 29 carry a `should_lead`
    // and most are still misses, because #143's key was measured to reach only
    // the three shapes with a name-structural tell. So the invariant is not
    // "they all pass" — it is that the ones that DO pass keep passing, which is
    // exactly what "break no lead already measured correct" means.
    const gold: { cases: { head: string; should_lead?: string }[] } =
      JSON.parse(readFileSync("docs/research/143-gold-set.json", "utf8"));
    const leading = gold.cases
      .filter((c) => c.should_lead)
      .filter((c) => descriptionsFor(c.head)[0] === c.should_lead)
      .map((c) => c.head);
    // Eight: #143's own five, plus `almond milk`, whose two rows its note calls
    // peers, plus `veal`, which #162's `wholeness` key reached. ADR-0055's keys
    // neither added to this nor took from it — they reach a different class,
    // which is the measurement that amendment reports.
    //
    // `yogurt` is ADR-0061's, and it is a GAIN rather than a key: #143 recorded
    // a 26-way tie led by `Yogurt, fruit variety, nonfat`, and dropping the
    // nineteen flavoured tubs leaves the plain whole-milk one the gold set
    // designated. `milk` is still a miss and cannot stop being one — the row
    // #143 designated for it, `Milk, whole, 3.25% milkfat, with added vitamin
    // D`, is one of the two 3.25% rows ADR-0061 §5 drops in favour of the 3.7%
    // one. That is a disagreement with a pre-registration, recorded the way
    // #162's was (ADR-0062 §4) rather than edited out of the artifact.
    //
    // `beef` is NOT here and is not expected to be. #143 designated
    // `Beef, grass-fed, ground, raw` for it, unratified, and #162 lands on the
    // composite row instead — deliberately, because `pork` and `lamb` are both
    // pinned as composites and because #155 measured and rejected the key that
    // takes all four generic animals to a `… ground, raw` row. The gold set is
    // #143's committed pre-registration and is left as it was written; the
    // disagreement is recorded in ADR-0042's #162 Amendment rather than edited
    // out of the artifact.
    expect(leading).toEqual([
      "almond milk",
      "millet",
      "rice noodles",
      "teff",
      "tempeh",
      "vanilla extract",
      "veal",
      "yogurt",
    ]);
  });

  it("leads with the plain twin of a food, not one of its varietals", () => {
    // ADR-0055 §3. #134 proposed dropping the 28 varietal wines; measured, a
    // drop rule takes `wine, table, white, late harvest` with them, which is a
    // dessert wine at 112 kcal against a plain white's 82. Demoting instead
    // leaves it in the corpus with its own panel, one place further down.
    for (const [query, expected] of [
      ["white wine", "Alcoholic beverage, wine, table, white"],
      ["table wine", "Alcoholic beverage, wine, table, all"],
      ["cheddar cheese", "Cheese, cheddar"],
      ["safflower oil", "Oil, safflower"],
      ["wheat bread", "Bread, wheat"],
    ] as const) {
      expect([query, descriptionsFor(query)[0]]).toEqual([query, expected]);
    }
    // `red wine` was pinned here as a defect — this key moved the plain red row
    // from 4th to 2nd and `Vinegar, red wine` still led it. #154 took the lead
    // itself; the case moved with it, to the test below.
  });

  it("leads with the drink, not the aisle USDA filed it under", () => {
    // ADR-0042's #154 Amendment. USDA writes a shelf label where a food's name
    // belongs — `Alcoholic beverage, wine, …`, `Beverages, tea, …` — so the
    // #124 position key charged every drink for the walk down the aisle and
    // handed `red wine` to the row named in one word: a vinegar MADE from wine.
    for (const [query, expected] of [
      ["red wine", "Alcoholic beverage, wine, table, red"],
      // Not the powdered mix, which `accounted` reached once the label stopped
      // counting as two words of the name left over.
      ["whiskey sour", "Alcoholic beverage, whiskey sour"],
      // The same label on a different aisle: an oyster rather than an OSTRICH
      // oyster, and a scallop rather than a summer SQUASH cut into scallops.
      ["raw oyster", "Mollusks, oyster, Pacific, raw"],
      ["raw scallop", "Mollusks, scallop, mixed species, raw"],
    ] as const) {
      expect([query, descriptionsFor(query)[0]]).toEqual([query, expected]);
    }

    // And the vinegar still answers the query that names it. The key did not
    // learn that wine beats vinegar — it stopped mis-measuring which row the
    // words were about.
    expect(descriptionsFor("red wine vinegar")[0]).toBe("Vinegar, red wine");
  });

  it("pins what the shelf-label discount costs, as itself", () => {
    // #155's precedent: a key's collateral is pinned rather than left for
    // somebody to rediscover and read as a fresh bug. Twenty leads moved in a
    // 4,005-query sweep: twelve are wins on queries a person types, five are
    // washes on ones nobody does (`fluid`, `reduced`, `american`,
    // `with chocolate`, `dried meat`), and these three are what it costs.
    //
    // `caraway` is the cost, and the shape is the same one that pays: a spice
    // and a cheese both name it at word 1 of their own name, so the tie falls
    // to `fdcId` and the cheese has the lower one. The word means the seed.
    expect(descriptionsFor("caraway")[0]).toBe("Cheese, caraway");
    // The two washes. `dried meat` is two rows nobody typing it means. `sour
    // cream` trades a light one for an imitation — 208 kcal against real sour
    // cream's 196, where the light row read 136 — and the gold set's own note
    // already calls that modifier list incomplete rather than wrong, so this
    // ticket does not widen it.
    expect(descriptionsFor("dried meat")[0]).toBe(
      "Nuts, coconut meat, dried (desiccated), creamed"
    );
    expect(descriptionsFor("sour cream")[0]).toBe(
      "Sour cream, imitation, cultured"
    );
    // And the one this roster nearly cost. With `cheese` and `milk` left out —
    // which the membership test does not license, since a cheddar is a
    // different cheese exactly as a salmon is a different fish — every
    // `Beverages, chocolate …` powder outranked `Milk, chocolate, fluid,
    // commercial, whole, with added vitamin A and vitamin D`, because only the
    // powder's shelf label was discounted. Pinned as the reason the roster
    // follows its own rule rather than stopping where the wins were.
    //
    // ADR-0061 §5 has since dropped every chocolate milk, so the row that made
    // the case is gone and a powder leads `chocolate` after all. The pin moves
    // to what leads now rather than being deleted: a drop erases the evidence
    // for a measurement stated over a description exactly as a rename does
    // (ADR-0056's Consequences), and the roster rule it was defending has not
    // changed.
    expect(descriptionsFor("chocolate")[0]).toBe(
      "Beverages, chocolate powder, no sugar added"
    );
  });

  it("answers a bare `milk` with milks, and with nothing a milk went into", () => {
    // ADR-0062 §1. Twelve cheeses, seven yogurts, a mashed potato and a coffee
    // substitute answered `milk` on a qualifier naming what they are MADE OF,
    // and ADR-0061's drops promoted every one of them onto the first screen —
    // the corpus got smaller and the answer got worse. The food's own name is
    // the part the shelf label leads to, so `Nuts, coconut milk` is a milk and
    // `Cheese, mozzarella, whole milk` is a cheese.
    const milk = descriptionsFor("milk");
    expect(milk).toHaveLength(17);
    expect(milk.filter((d) => /^(Cheese|Yogurt|Potatoes)/.test(d))).toEqual([]);
    // The two the rule must not touch, and the reason it reads the part rather
    // than the head: both are filed under a shelf label, exactly as the cheeses
    // are, and both name a milk in the part that label leads to.
    expect(milk).toContain(
      "Nuts, coconut milk, raw (liquid expressed from grated meat and water)"
    );
    expect(milk).toContain("Beverages, rice milk, unsweetened");
    // The two milkfish stay, which is ADR-0062 §4 declining to stop `milk`
    // prefix-matching `milkfish` — the branch that also serves `grape` to
    // grapefruit. They are NAMED milkfish, so this rule never looked at them.
    expect(milk).toContain("Fish, milkfish, raw");
    // And every row it drops still answers the word that names IT.
    expect(descriptionsFor("mozzarella")[0]).toBe(
      "Cheese, mozzarella, whole milk"
    );
    // A typed `whole milk` is the same rule over two tokens, and the reach is
    // stated rather than assumed: eleven of the thirteen rows it used to return
    // were a food some whole milk went into, and both survivors are milk.
    expect(descriptionsFor("whole milk")).toEqual([
      "Milk, whole, 3.7% milkfat",
      "Milk, buttermilk, fluid, whole",
    ]);
  });

  it("keeps a word past a name where no row answers it better", () => {
    // ADR-0062 §1's gate, and the three foods it is the difference between
    // keeping and losing. Ungated, the rule takes every chili pepper out of
    // `chili`, every butternut squash out of `butternut` and every swiss chard
    // out of `swiss`, because in each the typed word is one food's qualifier and
    // another food's own name — at the SAME rung, so neither answers better.
    expect(descriptionsFor("chili")[0]).toBe("Peppers, hot chili, red, raw");
    expect(descriptionsFor("chili")).toContain("Spices, chili powder");
    expect(descriptionsFor("butternut")[0]).toBe(
      "Squash, winter, butternut, raw"
    );
    expect(descriptionsFor("butternut")).toContain("Nuts, butternuts, dried");
    expect(descriptionsFor("swiss")[0]).toBe("Chard, swiss, raw");
    expect(descriptionsFor("swiss")).toContain("Cheese, swiss");
    // The lead is safe by construction rather than by measurement: it holds the
    // best rung in the set, so it clears any bar the set can produce. `ancho`
    // is the case that shows it — the pepper is a qualifier match, and the
    // anchovy that survives every gate is a bare prefix one, a rung below.
    expect(descriptionsFor("ancho")[0]).toBe("Peppers, ancho, dried");
  });

  it("counts what the name-part rule reaches, and what it must not", () => {
    // ADR-0062 §1's table, re-measured over today's corpus — the record states
    // 25 rows for `milk` against the 18 that ship and 1,432 for `raw` against
    // 1,444 — and the tripwire on what the rule touches (#131: an unmeasured
    // guard is a hole). Retrieved before the rule, then after it.
    //
    // `raw` and `cooked` are the pair that needs the gate: no food is NAMED raw,
    // so the bar stays at 0, every row clears it, and an ungated cut would empty
    // both queries outright.
    const retrieved = (query: string) => {
      const scored = scoredFor(query);
      return [scored.length, withoutStrayMentions(scored).length];
    };
    expect(
      Object.fromEntries(
        ["milk", "raw", "cooked", "salt", "water", "oil"].map((query) => [
          query,
          retrieved(query),
        ])
      )
    ).toEqual({
      milk: [35, 17],
      raw: [1444, 1444],
      cooked: [1578, 1578],
      salt: [427, 1],
      water: [62, 12],
      oil: [112, 70],
    });
  });

  it("answers a bare drink name with something drinkable", () => {
    // The second half of #154, and a different shape from the first: seven wine
    // rows tie on every key here, so this is not a ranking win but the removal
    // of three rows that were winning the tie wrongly. Today's lead was
    // `Beverages, Wine, non-alcoholic` at 6 kcal against a table wine's 83 — a
    // 175 ml glass logged 135 kcal short, which is #126's silent miscount with
    // a plausible number on it.
    //
    // The invariant is the assertion; the exact row is the record. `fdcId`
    // order picks among what is left, and rosé is 83 kcal — the same figure as
    // `Alcoholic beverage, wine, table, all`, which is what makes this an
    // answer rather than an accident.
    const lead = descriptionsFor("wine")[0];
    expect(lead).not.toMatch(/non-alcoholic|cooking|light/);
    expect(lead).toBe("Alcoholic beverages, wine, rose");
  });

  it("says out loud that no key picks a tea, rather than pretending one does", () => {
    // #158, measured and NOT fixed. Every ordinary tea is `Beverages, tea, …`,
    // so the query is a qualifier match at rung 20 and no key below `tier` can
    // see past the two `Tea, …` rows above them — that gap is #153's, refused
    // at three scopes, and #159 owns what is left of it. This test is about the
    // rung below: given the tea rows alone, which one is the tea?
    //
    // None of them, by any key this ranking has. Eight produce ONE key and the
    // ninth is separated only because ADR-0055 §3 caught it — the decaffeinated
    // tap-water row's name is a strict extension of the plain tap-water row's,
    // so `plainSibling` demotes it. That is the whole of what the ranking
    // decides here. The other eight fall to `Array.prototype.sort`'s stability,
    // which is to say to `fdcId`.
    //
    // The ticket, ADR-0055's Consequences and #153's proposed tripwire all said
    // "identical on all nine keys". Two counts, both wrong, and a tripwire
    // written to that claim would have failed the day it landed.
    const rank = compileReferenceFoodQuery("tea");
    const teas = index.foods.filter((row) =>
      row.description.startsWith("Beverages, tea,")
    );
    const keyed = teas.map((row) => ({
      description: row.description,
      key: {
        ...rank(readReferenceFoodName(row.description)),
        ...readRowRank(row),
      },
    }));
    expect(keyed).toHaveLength(9);

    const distinct = new Set(keyed.map(({ key }) => JSON.stringify(key)));
    expect(distinct.size).toBe(2);
    expect(
      keyed
        .filter(({ key }) => key.plainSibling === 0)
        .map(({ description }) => description)
    ).toEqual([
      "Beverages, tea, black, brewed, prepared with tap water, decaffeinated",
    ]);

    // And `designated` is not the key that decides among the rest, though the
    // record used to say so: none of the nine is an American Indian/Alaska
    // Native record, so the key ties at 1 across all of them.
    expect(new Set(keyed.map(({ key }) => key.designated))).toEqual(
      new Set([1])
    );

    // The record, not a win. Ordered among themselves the eight lead with a
    // DECAFFEINATED GREEN tea, on nothing but the lowest `fdcId` — so there is
    // no invariant of the `wine` test's shape available here, because the row
    // an invariant would exclude is the row that leads. Nothing was shipped for
    // the reason this line makes plain: every one of the nine is 0–1 kcal with
    // near-identical panels, so the accident costs a user at most 1 kcal, and
    // the black tea they meant is four rows down a list of twelve.
    const ordered = [...keyed].sort((a, b) => compareRelevance(a.key, b.key));
    expect(ordered[0].description).toBe(
      "Beverages, tea, green, brewed, decaffeinated"
    );

    // What the user actually meets today, pinned so that #159 landing shows up
    // here as a failure rather than as a silent change of subject. When the
    // tier gap closes, this becomes the decaffeinated green tea above — which
    // is the watch item #159 carries.
    expect(descriptionsFor("tea")[0]).toBe(
      "Tea, tundra, herb and laborador combination"
    );
  });

  it("leads with the oil, not the emulsifier or the blend", () => {
    // ADR-0042's #155 Amendment, and the three leads ADR-0055 §3 was adopted
    // knowing it cost. Demoting `Oil, soybean, salad or cooking, (partially
    // hydrogenated)` beneath its plain parent uncovered a tie no key separated:
    // `Oil, soybean` and `Oil, soybean lecithin` agreed on all eight, so corpus
    // order decided and an emulsifier led a query for an oil. `corn oil` was the
    // same defect a shade milder, leading with a blend while `Oil, corn` — §3's
    // own worked example of a parent — sat second.
    //
    // `accounted` separates them by asking what `head` asks of the head phrase
    // of the whole name: "soybean oil" accounts for every word of `Oil, soybean`
    // and leaves `lecithin` over in the other.
    //
    // #157 then took the emulsifier out of the corpus altogether, on the
    // separate question of whether it was ever a reference food. So `soybean
    // oil` and `soy oil` now have only one soybean oil to find, and this pin
    // guards `corn oil` — a blend, still shipped, still contesting `Oil, corn`
    // — where the key is doing work no filter does. Kept whole rather than
    // trimmed to the surviving case: a key that stops separating a tie is worth
    // failing on even when a drop happens to hide it.
    for (const [query, expected] of [
      ["soybean oil", "Oil, soybean"],
      ["soy oil", "Oil, soybean"],
      ["corn oil", "Oil, corn"],
    ] as const) {
      expect([query, descriptionsFor(query)[0]]).toEqual([query, expected]);
    }
    // The key's whole collateral in a 3,376-query sweep, pinned as itself rather
    // than folded into a total. Oat bran bread is the higher-fibre loaf made
    // with the bran fraction; oatmeal bread is what "oat bread" ordinarily
    // names, so this was adjudicated an improvement, and it is here so a future
    // reading of it as a regression has something to argue with.
    expect(descriptionsFor("oat bread")[0]).toBe("Bread, oatmeal");
  });

  it("ranks a search the vocabulary rescued by the same keys as a literal one", () => {
    // The first guard on that path. Every other ranking pin here types a query
    // the corpus answers literally, so `rankAgainst`'s other job — score each
    // row against ALL of the expanded phrases and keep its best key — has never
    // been asserted against. A new key can behave differently there, because it
    // is scored per phrase and the best one wins.
    //
    // These three are the British names for the two oils above, and the reason
    // the defect was worth fixing rather than pinning: it reached the everyday
    // vocabulary ADR-0049 and #141 exist to serve, not only the USDA spelling.
    for (const [query, expected] of [
      ["maize oil", "Oil, corn"],
      ["soya oil", "Oil, soybean"],
      ["soyabean oil", "Oil, soybean"],
    ] as const) {
      const { hits, phrases } = searchIndexRows(corpus, query);
      expect([query, phrases[0]]).toEqual([query, query]);
      expect([query, phrases.length]).not.toEqual([query, 1]);
      expect([query, hits[0]?.row.description]).toEqual([query, expected]);
    }
  });

  it("asks the name-part rule of each expanded phrase, not of the union", () => {
    // ADR-0062 §1 over the one path that scores a query as several phrases. A
    // phrase is a query, so the rung ANOTHER phrase reached is not evidence
    // about this one — and one bar over the union says otherwise. `cacao butter`
    // expands to `cocoa butter` and `cocoa fat`; the second names a cocoa powder
    // outright, which under a shared bar would take the cocoa butter the first
    // phrase reaches out of the answer, since USDA files it under `Oil`.
    expect(descriptionsFor("cacao butter")).toContain("Oil, cocoa butter");
    // And the lead it costs: `mandarine` expands to phrases that reach both a
    // tangerine and a mandarin, and the mandarin is the row a shared bar drops.
    expect(descriptionsFor("mandarine")[0]).toBe(
      "Mandarin, seedless, peeled, raw"
    );
  });

  it("lets an alias account for a row, where a sibling flag must not", () => {
    // The two keys read aliases in opposite directions, and both are right.
    //
    // ADR-0055 §3 builds its sibling set from descriptions ALONE, because
    // `Oil, corn` is the prefix of its own alias and would otherwise demote
    // itself — fourteen canonical rows would. `accounted` has the opposite
    // rule: a row is scored as the best of its names (ADR-0050 §4), and an
    // alias IS one of the food's names, so a query that accounts for the alias
    // has named the food. `Oats, whole grain, rolled, old fashioned` carries the
    // alias `Oats`, which a typed "oats" accounts for completely, while its
    // steel-cut sibling has no alias and four words left over.
    //
    // The questions differ, which is why the rules do: one asks whether a
    // plainer row exists, and an alias there is a row talking about itself; the
    // other asks whether the user named this food, and an alias there is one of
    // the names they could have used.
    expect(descriptionsFor("oats")[0]).toBe(
      "Oats, whole grain, rolled, old fashioned"
    );
    expect(
      index.foods.find(
        (row) => row.description === "Oats, whole grain, rolled, old fashioned"
      )?.also
    ).toEqual(["Oats"]);
  });

  it("leads with the undesignated row where a designated one merely ties", () => {
    // ADR-0055 §4. USDA publishes these as composition for a documented
    // population, so on an exact tie the row published for no particular
    // population is the better default answer. Both leads were a designated row
    // decided by fdcId order alone.
    for (const [query, expected] of [
      ["oil", "Oil, flaxseed, cold pressed"],
      ["cornmeal", "Cornmeal, degermed, enriched, yellow"],
    ] as const) {
      expect([query, descriptionsFor(query)[0]]).toEqual([query, expected]);
    }
  });

  it("moves nothing on a head phrase only designated rows occupy", () => {
    // The key fires only on a tie, so where every candidate carries the
    // designation it ties uniformly and the order is unchanged. Twelve of the
    // fifteen tie-leads #134 counted are these, which is why the 10.7%
    // over-representation it recorded is arithmetic rather than harm.
    for (const query of [
      "seal",
      "walrus",
      "whale",
      "caribou",
      "elk",
      "chokecherries",
    ] as const) {
      const found = searchIndexRows(corpus, query).hits;
      expect(found.length).toBeGreaterThan(0);
      // Asked of the CATEGORY, not of a bracket in the name. ADR-0056's
      // Amendment took the tags off, and §4's key never read them anyway.
      expect(found[0]?.row.foodCategory).toBe(
        "American Indian/Alaska Native Foods"
      );
    }
    // And the foods that only exist here are still reachable by name: ADR-0055
    // §1 is what keeps a demotion from becoming a deletion.
    expect(descriptionsFor("mutton")[0]).toBe("Mutton, cooked, roasted");
    expect(descriptionsFor("agave").length).toBeGreaterThan(0);
  });

  it("never lets a row's own alias make it a qualified form of itself", () => {
    // Fourteen rows are a row AND the prefix of a name the twin merge discarded,
    // so an `also` alias in the sibling set would demote every one of them.
    // `plainSiblingsOf` takes descriptions only, which is what forbids it — this
    // pins the fourteen the constraint was measured against.
    for (const description of [
      "Oil, corn",
      "Oil, soybean",
      "Oil, peanut",
      "Oil, safflower",
      "Mushrooms, shiitake",
      "Cheese, feta, whole milk, crumbled",
      "Nuts, almonds, whole, raw",
      "Nuts, walnuts, English, halves, raw",
      "Nuts, pecans, halves, raw",
      "Oats, whole grain, rolled, old fashioned",
      "Pineapple, raw",
      "Buckwheat, whole grain",
      "Nuts, hazelnuts or filberts, raw",
      "Bulgur, dry, raw",
    ]) {
      const row = index.foods.find((f) => f.description === description);
      expect([description, row?.plain_sibling]).toEqual([
        description,
        undefined,
      ]);
    }
  });

  it("does not demote a prepared or modified food the query asked for", () => {
    // #143's reason for having no query-aware branch: LITERAL retrieval admits a
    // row only when EVERY typed token matches it, so a typed marker word is
    // present in every retrieved row and the key ties across all of them. If
    // that ever stops holding, someone searching "boiled egg" starts being
    // handed a row that is not boiled, and this is where it shows up.
    //
    // The invariant is about literal retrieval and NOT about the ADR-0049
    // fallback, which answers a query the corpus cannot match at all by
    // substituting a different phrase — see the case below this one, which
    // `low fat milk` used to sit in here and now belongs to.
    for (const [query, marker] of [
      ["boiled egg", "boil"],
      ["cooked rice", "cook"],
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

  it("answers 'low fat milk' with milk, which it could not do before #161", () => {
    // A query the corpus never actually matched, propped up by three rows that
    // were not milk. `low`, `fat` and `milk` appeared as separate words in
    // exactly three descriptions — `Bread, cornbread, …, made with low fat (2%)
    // milk` and two siblings — so someone typing "low fat milk" was handed a
    // cornbread, a white bread and a dinner roll, and the marker invariant above
    // held only because all three carried the word `low`.
    //
    // #161 dropped them as recipe composites, so the query now retrieves NOTHING
    // literally, ADR-0049's fallback fires on its `low-fat milk` entry, and the
    // answer is milk. Pinned because it is the one place in the suite where the
    // fallback is doing the work rather than backing it up.
    const found = descriptionsFor("low fat milk");
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((d) => /milk/i.test(d))).toBe(true);
    expect(found.filter((d) => /^Bread|^Rolls/.test(d))).toEqual([]);
  });

  it("keeps leading with the generic animal row, which USDA names by its parts", () => {
    // #143 measured a companion key preferring a WHOLE food over a part of it
    // and rejected it: USDA names its most GENERIC animal rows with part
    // vocabulary, so part markers select FOR the canonical row. These four are
    // the leads that key broke. They are pinned as the reason it is not here.
    //
    // `pork` was missing from this list until #155, which is the ticket that
    // needed it: the counted form of `accounted` — prefer the name with fewer
    // words left over — is #143's rejected key arriving by another route, and it
    // takes all four of these to `… ground, raw`. The boolean that shipped
    // instead cannot reach them, because no candidate here is ever fully
    // accounted, so it scores 0 across the tie and the order is unchanged.
    for (const [query, expected] of [
      [
        "chicken",
        "Chicken, broilers or fryers, meat and skin and giblets and neck, raw",
      ],
      ["turkey", "Turkey, whole, meat and skin, raw"],
      [
        "pork",
        "Pork, fresh, composite of trimmed leg, loin, shoulder, and spareribs, (includes cuts to be cured), separable lean and fat, raw",
      ],
      [
        "lamb",
        'Lamb, composite of trimmed retail cuts, separable lean and fat, trimmed to 1/4" fat, choice, raw',
      ],
    ] as const) {
      expect([query, descriptionsFor(query)[0]]).toEqual([query, expected]);
    }
  });

  it("answers a bare animal name with the animal, not the fat trimmed off it", () => {
    // #162. `beef` tied 412 rows on every one of the nine keys — the query IS
    // the head phrase of all 412 — so `Array.sort`'s stability handed the lead
    // to the lowest `fdcId`, and what it dealt was `Beef, retail cuts,
    // separable fat, raw` at 674 kcal against a lean cut's 149. The second
    // largest calorie spread in #158's whole tie class, and nothing pinned it:
    // `chicken`, `turkey`, `pork` and `lamb` were pinned above and `beef` was
    // not, which is half of why it sat unnoticed.
    //
    // `wholeness` decides it, and USDA's own word does the deciding. These two
    // are the exact analogue of the `pork` and `lamb` rows pinned above.
    expect(descriptionsFor("beef")[0]).toBe(
      'Beef, composite of trimmed retail cuts, separable lean and fat, trimmed to 1/8" fat, raw'
    );
    expect(descriptionsFor("veal")[0]).toBe(
      "Veal, composite of trimmed retail cuts, separable lean and fat, raw"
    );
  });

  it("answers a query that does not name a fat with a food, not with the fat", () => {
    // The shape behind `beef`, rather than the one query. Eleven of #158's
    // 1,115 complete ties led with a row that is the fat trimmed off a food:
    // `separable fat`, `external fat`, `seam fat`, `intermuscular fat`,
    // `subcutaneous fat`. `wagyu beef` is the one a person types, and it led
    // with 596 kcal of external fat.
    //
    // Those eleven were six distinct rows under eleven sweep spellings, and
    // every one of the six is here, plus `veal`. `aust beef` and `fresh lamb`
    // reach rows this list already names. The predicate is ASKED rather than
    // restated (#131).
    //
    // `australian beef`, `australian lamb`, `new lamb` and `imported lamb` left
    // this list when ADR-0056 took those words out of the corpus — they now
    // retrieve nothing at all, which is the rule working rather than a gap, and
    // is pinned as its own case below.
    for (const query of [
      "beef",
      "veal",
      "wagyu beef",
      "frozen lamb",
      "bowhead whale",
    ] as const) {
      const lead = descriptionsFor(query)[0];
      expect([query, lead && isSeparatedFat(lead)]).toEqual([query, false]);
    }
  });

  it("still hands a query that DOES name a fat the fat it named", () => {
    // The boundary, pinned rather than left implied — the title above is not
    // "never leads with a separated fat", and 24 sweep queries still do.
    //
    // Sixteen of the 24 retrieve no other kind of row at all (`seam beef`,
    // `tallow`, `intermuscular lamb`), which is the same self-gating `plain`
    // relies on: literal retrieval admits a row only when every typed token
    // matches it, so a typed fat word is in every candidate. Of the other
    // eight, six are decided by `position` and two by `tier`, both above
    // `wholeness`. `retail beef` is the sharpest and is the case to read:
    // `retail` is word 1 of `Beef, retail cuts, separable
    // fat, raw` and word 4 of `Beef, composite of trimmed retail cuts, …`, so
    // the fat row wins outright rather than tying, and 23 non-fat rows sit
    // below it.
    //
    // That is #124's key doing its job, not this one failing: `wholeness` sits
    // below `position` precisely so a composite cannot answer a query naming
    // something it mentions in passing. Both rows are on screen.
    expect(descriptionsFor("retail beef")[0]).toBe(
      "Beef, retail cuts, separable fat, raw"
    );
    expect(descriptionsFor("seam beef")[0]).toBe(
      "Beef, Wagyu, seam fat, Aust. marble score 4/5, raw"
    );
  });

  it("pins the one lead ADR-0056 moved onto a separated fat", () => {
    // #151's precedent: collateral is pinned, not left to be rediscovered as a
    // fresh bug. Measured over 3,976 sweep queries, the rename left 3,898 leads
    // alone, emptied 7 that named an origin, and moved 71 — of which this is the
    // only one that went from a food to the fat trimmed off one.
    //
    // `aust` matches `Aust. marble score` in both rows, so the query was always
    // going to answer with Wagyu. Before the rename both candidates carried the
    // same two extra words; after it, the fat row is short enough that the query
    // accounts for more of it, and `accounted` sits above `wholeness`. It is a
    // sweep-generated pair, not a phrase anyone types, and the tenderloin is
    // still on screen.
    expect(descriptionsFor("aust beef")[0]).toBe(
      "Beef, Wagyu, external fat, Aust. marble score 4/5, raw"
    );
  });

  it("answers `napa` with raw pe-tsai, which is the same vegetable", () => {
    // The two are one cabbage under two names. USDA numbered them apart and
    // filed the napa record under Brassica oleracea — green cabbage's species,
    // not this plant's — with 40 nutrient fields against 63 and a fifth of the
    // vitamin C. Dropping it is what lets ADR-0049's fallback answer at all:
    // the fallback fires only on an empty result, so one poor literal hit was
    // suppressing the map entry that reaches the right rows.
    const hits = searchIndexRows(corpus, "napa").hits;
    expect(hits[0]?.row.description).toBe("Cabbage, chinese (pe-tsai), raw");
    expect(hits[0]?.alias).toBe("napa cabbage");
    // And the row it replaced is gone, under either spelling of the query.
    expect(descriptionsFor("napa")).not.toContain("Cabbage, napa, cooked");
    expect(
      index.foods.some((row) => row.description === "Cabbage, napa, cooked")
    ).toBe(false);
  });

  it("returns nothing for the origin words ADR-0056 took out of the corpus", () => {
    // Q11's decision, pinned as behaviour: the words are gone from the artifact
    // entirely — not searched, not ranked, not displayed — so a query naming one
    // finds nothing rather than quietly matching on a leftover alias. `also`
    // aliases are renamed with the descriptions for exactly this reason.
    for (const query of [
      "new zealand lamb",
      "australian beef",
      "australian lamb",
      "imported beef",
      "imported lamb",
      "new lamb",
    ] as const)
      expect([query, descriptionsFor(query)]).toEqual([query, []]);

    // But `new zealand` on its own still answers, because there the words are a
    // plant. This is the positional rule showing its work: New Zealand spinach
    // is Tetragonia, and stripping its head phrase would have filed it under
    // real spinach's name with a fifth of the iron.
    expect(descriptionsFor("new zealand")).toEqual([
      "New Zealand spinach, raw",
      "New Zealand spinach, cooked, boiled, drained, without salt",
      "New zealand spinach, cooked, boiled, drained, with salt",
    ]);
  });

  it("pins what the composite preference costs, as itself", () => {
    // #155's precedent again: a key's collateral is pinned rather than left for
    // somebody to rediscover and read as a fresh bug. Sixteen leads moved in a
    // 3,976-query sweep — eleven leaving a separated fat, three a muskrat, and
    // `veal` an Australian rib roast — and this is the one that goes the other
    // way.
    //
    // `tri` prefix-matches `trimmed`, so the composite answers a query naming
    // the tri-tip. It is a sweep-generated `adjective noun` pair rather than a
    // phrase anyone types, which is why it was accepted rather than designed
    // around — but it is the whole cost, so it is written down.
    // ADR-0056 moved this one: `tripe` also prefix-matches `tri`, and losing
    // `variety meats and by-products` left `Beef, tripe, raw` short enough to
    // win outright. Still a sweep-generated pair rather than a phrase anyone
    // types, and still recorded rather than quietly re-pinned.
    expect(descriptionsFor("tri beef")[0]).toBe("Beef, tripe, raw");
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

  it("returns the rows the keys admit, and no ordering key removes one", () => {
    // #124's hard invariant, as ADR-0062 §1 leaves it. It used to read "the
    // retrieved SET is a function of `tier > 0` alone"; retrieval now asks a
    // second question of the same keys — did the typed words reach the food's
    // own name, where some row answered on a better rung — so the set is a
    // function of `tier` and `named`, and of nothing else. What it still
    // decouples is retrieval from ORDER, which is what the vocabulary work in
    // #139/#140 rests on: no ranking key can add or remove a row.
    for (const query of [
      "olive oil",
      "cheddar cheese",
      "pot",
      "soy milk",
      "grape",
      "raw beef",
      "b",
    ]) {
      const admitted = withoutStrayMentions(scoredFor(query));
      const returned = new Set(
        searchIndexRows(corpus, query).hits.map(({ row }) => row.description)
      );
      // Every returned row was admitted, and the cap is the only thing that
      // ever removes one.
      for (const description of returned)
        expect(
          admitted.some(({ food }) => food.row.description === description)
        ).toBe(true);
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

  it("puts 365 more rows first by their own name, and takes none away", () => {
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
    // 4,238 queries over 4,238 rows, so the winner is taken in one pass rather
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
    // that was not first — 186 and 163. #155's `accounted` key then moved 32 rows
    // from not-first to gained — 218 and 131 — which is the population it is
    // built for: a row searched by its OWN full description is the one name the
    // query accounts for completely, and every rival carries a word it does not.
    // ADR-0056's rename then moved 146 more into gained and one into not-first
    // — 364 and 133 — for the same reason `accounted` reaches them: a row that
    // stops carrying `New Zealand, imported`, `variety meats and by-products`
    // or `all grades` is searched by a shorter name, and the rivals that used to
    // account for it no longer do. Most of that is `all grades`, which alone
    // takes five words off 255 rows. ADR-0061's seventy-four drops then took
    // four of the gained rows and three of the not-first ones out of the corpus
    // with the milks and yogurts that carried them — 365 and 130. ADR-0062 §2's
    // fortification strip then moved two more into gained and none into
    // not-first — 367 and 130. All nine renamed rows still lead their own
    // description; what moved is WHICH keys they need to. `Cheese, pasteurized
    // process, American` and its `food` sibling led under both orderings while
    // they carried `without added vitamin D`, and a shorter name leaves rivals
    // the baseline four keys cannot separate them from, so the position key is
    // now what recovers the lead. The other seven were already in that position.
    // `lost` is the invariant and is still zero: no key and no corpus change has
    // ever taken the lead from a row that already held it. The baseline this
    // diffs against is the pre-#124 order, so all three keys are being measured
    // here at once.
    expect({ notFirst, gained, lost }).toEqual({
      notFirst: 130,
      gained: 367,
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
      schema_version: 4,
      generated_from: [],
      vocabulary_off: {
        licence: "ODbL",
        source: "Open Food Facts",
        url: "https://example.invalid/x.json",
        sha256: "abc",
        expansions: {},
      },
      vocabulary_local: { source: "Inventoria, hand-written", expansions: {} },
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

  it("reaches the foods a reused ndbNumber used to fuse away", () => {
    // ADR-0051's eight refusals, named one at a time rather than counted. Every
    // one of these returned the OTHER food's row before the split, or nothing.
    for (const [query, description] of [
      ["golden delicious", "Apples, raw, golden delicious, with skin"],
      ["spelt uncooked", "Spelt, uncooked"],
      ["table salt", "Salt, table"],
      [
        "orange juice raw",
        "Orange juice, raw (Includes foods for USDA's Food Distribution Program)",
      ],
      ["grilled portabella", "Mushrooms, portabella, grilled"],
      ["ground chicken", "Chicken, ground, raw"],
      ["plain soy milk", "Soy milk, unsweetened, plain, shelf stable"],
    ])
      expect([query, descriptionsFor(query)[0]]).toEqual([query, description]);

    // The survivors keep their own names and their own leads, which is the half
    // of the split that is meant to look like nothing happened.
    expect(descriptionsFor("honeycrisp")[0]).toBe(
      "Apples, honeycrisp, with skin, raw"
    );
    expect(descriptionsFor("portabella")[0]).toBe("Mushrooms, portabella, raw");
  });

  it("has no iodized salt, on purpose", () => {
    // The one row the split deletes. `Salt, table, iodized` is a Foundation
    // record that measured nothing at all and borrowed every one of its
    // seventeen panel fields from plain table salt, so un-merged it reports no
    // energy and ADR-0048 §5 drops it.
    //
    // Asserted rather than left as an absence: a deleted row that is only
    // visible as a missing search result reads as a bug to whoever finds it
    // next, and the corpus is meant to hold plain salt instead.
    expect(index.foods.filter((f) => /iodized/i.test(f.description))).toEqual(
      []
    );
    expect(descriptionsFor("iodized salt")).toEqual([]);
    expect(descriptionsFor("table salt")[0]).toBe("Salt, table");
  });

  it("carries an alias only where USDA held a second name for the food", () => {
    const aliased = index.foods.filter((food) => food.also);

    // 79, not #137's 87: an alias exists because a merge discarded a name, so
    // the eight pairs ADR-0051 refuses to merge mint none — each ships under its
    // own name instead. Seven of the eight were aliased here before the split;
    // the eighth's merged row never survived the filters (`Orange juice, raw`).
    // The eightieth left with ADR-0061's drops: `Buttermilk, low fat` answered
    // to `Milk, buttermilk, fluid, cultured, lowfat`, and both the row and the
    // name it carried are gone.
    expect(aliased).toHaveLength(79);
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
      rescued_by_vocabulary: false,
    });
  });

  // The one thing about a search only the search knows, and #149's log needs it:
  // a query the vocabulary answered never showed the user "No food found", so it
  // is recorded under its own outcome and left out of ADR-0053 §7's denominator.
  it("says when the vocabulary answered in the typed query's place", async () => {
    const literal = await searchUsdaCorpus("banana", loadFixture);
    expect(literal.rescued_by_vocabulary).toBe(false);

    const rescued = await searchUsdaCorpus("aubergine", loadFixture);
    expect(rescued.foods.length).toBeGreaterThan(0);
    expect(rescued.rescued_by_vocabulary).toBe(true);
  });

  it("carries the index schema_version the corpus was read from", () => {
    expect(corpus.schema_version).toBe(index.schema_version);
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
    // 4,238 rather than on one food: a generator change that filled one artifact
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
