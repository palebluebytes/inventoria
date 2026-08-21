// ---------------------------------------------------------------------------
// The derived search vocabulary (ADR-0049)
// ---------------------------------------------------------------------------
//
// `aubergine` returns nothing. So do `courgette`, `swede`, `rocket`,
// `cornflour`, `flax seed`, `ginger powder` and `wombok` — every one of them
// naming a food the corpus holds, under a name the corpus does not use. #130
// measured 236 such misses, and 17 of 20 everyday British queries returning
// nothing at all.
//
// The remedy is a map from a phrase that retrieves nothing to the phrases that
// do, DERIVED from Open Food Facts' ingredients taxonomy rather than written by
// hand: a hand list would need 236 entries to match a file that already exists,
// and nobody would have written the right 236 (ADR-0049 Context).
//
// This module holds the one input to that derivation a machine cannot supply.
// Everything else — the groups, the effect filter, the inversion, the stopword
// guard — is mechanical and lives in `scripts/usda-bundle.mjs`, which runs it
// once per generation and commits the result inside `search-index.json`.
//
// NOTHING IN THE APP IMPORTS THIS FILE. The generator reaches it through the
// same esbuild seam it reaches the reference-food filters through, so the list
// below never enters a bundle a user downloads — the arrangement
// `curated-stand-ins.ts` uses for its own generator-side reader.
// ---------------------------------------------------------------------------

/**
 * The OFF taxonomy tags whose synonym groups name nothing a person would type
 * into a food search, and which the derivation therefore builds no keys from.
 *
 * OFF's is an INGREDIENT-LABEL vocabulary. Beside the food names it carries
 * `milk lactose`, `anti-foaming agent`, `acidity regulator` and forty-odd
 * E-numbers, and roughly two-fifths of the groups that reach this corpus are
 * label jargon of that kind. Left in, `folic acid` would answer with margarine
 * (through the member `vitamin m`), `selenium` with snail (through `sn`), and
 * `sal tree oil` with soybean oil.
 *
 * The rest are groups about a real food whose one non-retrieving member is not a
 * name in use: a binomial (`gadus morhua`, `crassostrea gigas`), a packaging
 * phrase (`asparagus spears`), or a misspelling in OFF's own data (`beeechnuts`).
 * A key built from those costs bytes to answer a query nobody types.
 *
 * It is SEEDED MECHANICALLY, not authored: every tag below is one #130 adjudicated
 * `implausible-query` in `docs/research/130-ranking-audit.json`, extracted rather
 * than re-judged, which is why a list this long costs nothing to keep. ADR-0049 §3
 * records that the vocabulary's admission rests on that adjudication, and the
 * verdicts are committed one case at a time so they can be disagreed with
 * individually.
 *
 * It is a DENY-list rather than an allow-list (ADR-0049 §3): a group OFF adds
 * later is admitted by default, and only a new harm needs a human. The cheaper
 * automatic filter — keep only groups carrying a `usda_ndb_code` or
 * `ciqual_food_code` — was measured and rejected, because over the same 549
 * groups it keeps just 151 of the 238 real misses while still admitting 50 of
 * the implausible ones.
 *
 * ADR-0049 counts 163 of these. This file carries the 160 the audit still
 * emits: #136's tokeniser fix retired `en:java-plum`, `en:pumpkin-leaves` and
 * `en:grape-leaf` by making every member of each retrieve, so the effect filter
 * now drops all three before the deny-list is consulted and the shorter list
 * admits nothing the longer one refused.
 */
export const DENIED_VOCABULARY_TAGS: readonly string[] = [
  "en:acid",
  "en:acidity-regulator",
  "en:added-sugar",
  "en:alaska-pollock",
  "en:alcohol",
  "en:anti-foaming-agent",
  "en:asparagus",
  "en:atlantic-cod",
  "en:atlantic-salmon",
  "en:bamboo-shoot",
  "en:beechnut",
  "en:beef",
  "en:beef-meat",
  "en:blanches-almonds",
  "en:bosc-pear",
  "en:boston-butt",
  "en:broccoli",
  "en:burdock",
  "en:burdock-root",
  "en:cardoon",
  "en:clementine",
  "en:coating",
  "en:cocoa-powder-processed-with-alkali",
  "en:cocoa-processed-with-alkali",
  "en:common-octopus",
  "en:cooked-beef-meat",
  "en:cottonseed-oil",
  "en:crust",
  "en:dairy",
  "en:duck-wing",
  "en:dulce-de-leche",
  "en:e101",
  "en:e123",
  "en:e142",
  "en:e160b",
  "en:e164",
  "en:e174",
  "en:e175",
  "en:e270",
  "en:e282",
  "en:e322",
  "en:e322i",
  "en:e406",
  "en:e509",
  "en:e511",
  "en:e516",
  "en:e518",
  "en:e570",
  "en:e949",
  "en:e951",
  "en:e954",
  "en:e955",
  "en:edam",
  "en:egg-white",
  "en:einkorn-wheat",
  "en:ergocalciferol",
  "en:farmed-tilapia",
  "en:filling",
  "en:flavouring",
  "en:flour-blend",
  "en:folic-acid",
  "en:garlic",
  "en:ginger",
  "en:gouda",
  "en:grape-seed",
  "en:grilled-pistachio-nut",
  "en:herb",
  "en:high-fructose-corn-syrup",
  "en:hops",
  "en:horseradish",
  "en:hydrogenated-coconut-oil",
  "en:hydrolysed",
  "en:hydrolysed-soy-protein",
  "en:inosine-monophosphate",
  "en:jam",
  "en:jerusalem-artichoke",
  "en:lactose",
  "en:lard",
  "en:lemon-powder",
  "en:macadamia-nut",
  "en:mandarin-peel",
  "en:microbial-culture",
  "en:milkfat",
  "en:miso",
  "en:mixed-cheese",
  "en:mixed-condiments",
  "en:mung-bean-sprout",
  "en:n",
  "en:nigari",
  "en:no1",
  "en:no10",
  "en:no11",
  "en:no12",
  "en:no2",
  "en:no3",
  "en:no4",
  "en:no5",
  "en:no6",
  "en:no7",
  "en:no8",
  "en:no9",
  "en:non-hydrogenated-palm-fat",
  "en:oat-bran",
  "en:oat-flour",
  "en:okara",
  "en:pacific-oyster",
  "en:palm-or-palm-kernel-oil",
  "en:partially-hydrogenated-vegetable-fat",
  "en:pasteurised",
  "en:pastry",
  "en:pineapple",
  "en:pistachio-nuts",
  "en:plant-protein",
  "en:pork",
  "en:pork-skin",
  "en:port",
  "en:pouting",
  "en:prepared-meat",
  "en:pumpkin-seed",
  "en:raw-almonds",
  "en:rice-flour",
  "en:roasted-lamb-leg",
  "en:roasted-lamb-shoulders",
  "en:roasted-lean-lamb-shoulder",
  "en:roe",
  "en:roquefort",
  "en:safflower",
  "en:sake",
  "en:salad",
  "en:seed",
  "en:selenium",
  "en:shorea-robusta-seed-oil",
  "en:sodium",
  "en:soft-wheat-flour",
  "en:soy-base",
  "en:soya",
  "en:spelt-flour",
  "en:spot",
  "en:sprouted-alfalfa-seeds",
  "en:starch",
  "en:sugared",
  "en:sulfates",
  "en:sweetener",
  "en:tomato-powder",
  "en:tuber",
  "en:turkey-breast",
  "en:unrefined-sugar",
  "en:vegetable-blend",
  "en:vegetable-fat",
  "en:vegetable-margarine",
  "en:vermicelli",
  "en:vitamin-d",
  "en:vitamin-e",
  "en:vitamins",
  "en:water",
  "en:wheat-flour",
  "en:wheat-germ",
  "en:whiting",
  "en:wine",
  "en:ōhelo-berry",
];

// ---------------------------------------------------------------------------
// The hand-written vocabulary (ADR-0049's #141 Amendment)
// ---------------------------------------------------------------------------
//
// `gammon` returns nothing, and so do `mange tout`, `porridge oats`,
// `double cream`, `natural yoghurt`, `plain flour`, `caster sugar` and
// `jacket potato`. Every one of them names a food the corpus holds, under a name
// neither the corpus nor OFF's taxonomy uses — #130 measured them among the
// twenty everyday British queries, and #139/#140's derived map answered nine of
// the seventeen that failed, leaving these eight.
//
// A hand list is the WRONG shape at the scale of the 236 misses ADR-0049 rejects
// it for, and the reason there is not length: nobody would have written the right
// 236, because the derived classes (spacing, word order, possessives, diacritics,
// loanwords) are ones a hand list would not have thought to enumerate. Eight
// regional synonyms, each individually verified, is the shape a hand list IS
// right for — and OFF's file, having been asked, does not know them.
//
// It is a second SECTION rather than eight more keys in the derived one, because
// the derived map is a substantial extraction from OFF and therefore an ODbL
// derivative database (ADR-0049 §4). These words are nobody's extraction, and
// keeping them in a section of their own is what leaves them outside it.
// ---------------------------------------------------------------------------

/**
 * One hand-written vocabulary entry: a phrase this corpus answers nothing for,
 * the phrases it does answer, and the row a search for the key is expected to
 * lead with.
 *
 * Four admissions govern an entry, and THREE OF THEM ARE ENFORCED AT GENERATION
 * (`assertLocalVocabularyHolds`), so a corpus refresh that moves an answer fails
 * the build rather than silently redirecting `caster sugar`:
 *
 *  1. The key retrieves nothing on its own.
 *  2. The key's targets retrieve, and lead with {@link landsOn}.
 *  3. No OFF group already covers the key — a derived answer is preferred to a
 *     written one wherever the taxonomy has an opinion.
 *  4. The key is a name in everyday use, not a brand and not a dish. That one no
 *     machine can check, so {@link why} is where a human asserts it.
 */
export interface LocalVocabularyEntry {
  /** The phrase that retrieves nothing. Lower-case, as the map's keys are. */
  key: string;
  /**
   * The phrases the corpus DOES use, ranked against in the key's place. Phrases
   * rather than `fdcId`s, for ADR-0049 §3's reason: freezing rows would pin the
   * ranking, and a refresh would silently redirect the key.
   */
  targets: readonly string[];
  /**
   * The description a search for {@link key} is expected to lead with, once the
   * entry is in the map. Admission 2's whole point: this is a claim about the
   * finished corpus AND the shipped ranking, re-measured every generation.
   */
  landsOn: string;
  /** Admission 4, asserted by a human: why this is a name people type. */
  why: string;
}

/**
 * The ceiling on the hand list, in the ADR-0046 §6 style.
 *
 * **Twenty.** Not a cap to raise: reaching it says the vocabulary problem is
 * bigger than a hand list and wants re-deriving — a second taxonomy, a wider
 * source, a different derivation — which is a decision no generation-time check
 * can make. Enforced at generation anyway, because unlike ADR-0046's list this
 * one is read by a machine before it is read by a reviewer.
 */
export const LOCAL_VOCABULARY_CEILING = 20;

/**
 * The eight everyday British food names OFF's taxonomy does not carry (#141).
 *
 * Ordered by key, as the derived map is, so an addition diffs as one entry.
 */
export const LOCAL_VOCABULARY: readonly LocalVocabularyEntry[] = [
  {
    key: "caster sugar",
    targets: ["sugars granulated"],
    landsOn: "Sugars, granulated",
    why: "The British shelf name for the fine-ground white sugar sold as granulated sugar; the grind differs, the composition does not.",
  },
  {
    key: "double cream",
    targets: ["cream heavy"],
    landsOn: "Cream, heavy",
    why: "The British grade name for the thickest pouring cream. `Cream, heavy` is the nearest grade USDA carries and the panel is its own, not double cream's — US heavy cream is legally ~36% fat where double cream is ~48%.",
  },
  {
    key: "gammon",
    targets: ["pork cured ham"],
    landsOn:
      "Pork, cured, ham, center slice, country-style, separable lean only, raw",
    why: "The British name for cured leg of pork sold raw, to be cooked at home; the American register calls the same cut ham.",
  },
  {
    key: "jacket potato",
    targets: ["potatoes baked"],
    landsOn: "Potatoes, baked, flesh, without salt",
    why: "The British name for a whole baked potato, on every pub menu and freezer aisle in the country.",
  },
  {
    key: "mange tout",
    targets: ["peas edible podded"],
    landsOn: "Peas, edible-podded, raw",
    why: "The British name, borrowed from French, for the flat pea eaten pod and all; USDA files it under the description rather than a name.",
  },
  {
    key: "natural yoghurt",
    targets: ["yogurt plain whole milk"],
    landsOn: "Yogurt, plain, whole milk",
    why: "The British shelf name for unsweetened, unflavoured yoghurt — `natural` where the American spelling says `plain`, and the British spelling of the word besides.",
  },
  {
    key: "plain flour",
    targets: ["all purpose flour"],
    landsOn: "Flour, wheat, all-purpose, enriched, bleached",
    why: "The British name for wheat flour with no raising agent, which is what all-purpose flour is. The target is deliberately not `wheat flour white all purpose`, which leads with the SELF-RISING row — #130 §6's case, still open.",
  },
  {
    key: "porridge oats",
    targets: ["oats rolled"],
    landsOn: "Oats, whole grain, rolled, old fashioned",
    why: "The British name for the rolled oats porridge is made from; `oatmeal` names the cooked dish here and the raw grain there.",
  },
];
