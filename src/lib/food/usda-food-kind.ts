// ---------------------------------------------------------------------------
// The food-kind roster: is this record a reference food at all? (ADR-0042 §3)
// ---------------------------------------------------------------------------
//
// Five predicates and the editorial tables behind them. Each asks one question
// of a USDA description — is it a brand, a package, a dish, a laboratory basis,
// a factory input — and every "yes" drops the record before it reaches the
// corpus.
//
// A sixth judgement lives next door in `usda-variant-drops.ts` and is a
// different shape: ADR-0061 asks not what a record IS but what it is a VARIANT
// of, which is a question about a row's SIBLINGS rather than about its own
// words. The split is #146's, for #146's reason — the two move for different
// reasons, and together they crossed the thousand-line wall.
//
// They live apart from `usda-fdc.ts` because they change for a different reason
// (#146). That module adapts one record of somebody else's serialisation into
// this app's shapes, and moves when USDA's serialisation or the panel does —
// every `ADAPTER_VERSION` bump names one of those. This one moves when somebody
// MEASURES an escape: #131 found the brand leak was 20 rows and not 1, #133 the
// twelve prepared composites, #144 the four filter gaps. None of those numbers
// touched the adapter.
//
// NOTHING IN THE APP IMPORTS THIS FILE. The corpus is filtered once, at
// generation time, and what ships is the survivors; `scripts/usda-bundle.mjs`
// reaches these five through the esbuild seam in `scripts/usda-app-module.mjs`
// rather than keeping a second copy of the answer (ADR-0047 §4). That is the
// arrangement `food-vocabulary.ts`, `curated-stand-ins.ts` and
// `usda-twin-ledger.ts` all use, and `usda-food-kind.test.ts` pins it.
//
// A judgement here is precision-first: never drop a real food. Each block
// comment below carries the guards that keep its predicate precise and the
// corpus tally it reaches, because a filter whose reach nobody measured is a
// hole nobody can see.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Brand exclusion
//
// SR Legacy (a frozen, discontinued USDA dataset) bakes brand names directly
// into otherwise-generic descriptions — "Grapefruit juice, white, bottled,
// unsweetened, OCEAN SPRAY" — with NO structured brand field to filter on
// (brandOwner / brandName / gtinUpc are all null on these records). USDA's
// editorial convention renders those brands in ALL CAPS, so an all-caps token
// is the only available signal. We drop such records so generic whole foods win
// the search.
//
// Brands belong to the OFF barcode path, never to the USDA base-ingredient
// search, so a branded record is ALWAYS dropped — even when the query names the
// brand. (An earlier query-aware rescue leaked lookalikes: "apple" kept
// APPLEBEE'S, "almond" kept ALMOND JOY, because a generic food word capitalised
// inside a brand name matched the query.)
//
// Precision comes first — never drop a real food. The generator reports 924 of
// 7,974 merged identities dropped here, 0 of them generic foods (the sole raw
// casualty is "Kiwifruit, ZESPRI SunGold, raw", and generic kiwi remains).
// Three guards keep it precise:
//   1. a trigger needs >=3 letters, so 2-letter units and state codes never
//      match ("US", "LB", and "Beef, short loin (NY strip steak), raw");
//   2. generic all-caps acronyms are stoplisted (USDA commodity foods; DHA/ARA
//      in infant formula; NFS/BBQ; capitalised stopwords) — the stoplist is for
//      acronyms that describe a FOOD, which is why "USA" is not among them:
//      it earned its place nowhere and cost sixteen "Vitasoy USA …" tofu and
//      soymilk rows, which reached the corpus as generic foods (#131);
//   3. USDA's generic "assorted brands" composites name a brand as an example
//      ("Cereals, farina, enriched, assorted brands including CREAM OF WHEAT")
//      but are themselves generic — a small safelist keeps them. Trademarked
//      products in their own right (Cream of Wheat, Cream of Rice) are dropped.
//
// The convention is not universal, and the residual gap is known and accepted:
// a brand USDA rendered in Title Case is invisible here and reaches the corpus
// unless the denylist below names it. `tests/unit/usda-corpus.test.ts` pins the
// surviving all-caps vocabulary and sweeps a named-brand roster, which is a
// tripwire, not a proof the class is empty (ADR-0042 §3 as amended).
// ---------------------------------------------------------------------------

/**
 * USDA's brand convention as a pattern: an all-caps token of two or more
 * letters. Exported so the corpus test can pin the all-caps vocabulary that
 * survives into the committed artifact against this expression rather than a
 * copy of it — the surviving set IS the audit of whether the convention still
 * holds, and a test that restated the pattern would keep agreeing with itself
 * after the pattern moved.
 */
export const BRAND_CAPS = /\b[A-Z][A-Z&'.\-]*[A-Z]\b/g;

const GENERIC_CAPS_ACRONYMS = new Set([
  "USDA",
  "DHA",
  "ARA",
  "NFS",
  "NFSMI",
  "BBQ",
  "LGG",
  "TLC",
  "NOS",
  "EPA",
  "MSG",
  "UHT",
  "RTE",
  "RTD",
  "GMO",
  "THE",
  "AND",
  "WITH",
  "OVER",
]);

// USDA's generic "assorted brands" composites name a specific brand only as an
// example ("...assorted brands including CREAM OF WHEAT") yet are themselves
// generic, so keep them. Matched as a lowercased substring. Note this does NOT
// safelist the trademarked products in their own right ("Cereals, CREAM OF
// WHEAT, dry"), which are dropped like any other brand.
const GENERIC_FOOD_SAFELIST = ["assorted brands"];

// Trademarks the all-caps token check below cannot see, dropped unconditionally.
// They go invisible two ways: a name built entirely from otherwise-generic words
// ("cream", "wheat"), or a name USDA simply did not shout — SR Legacy's house
// style is ALL CAPS for brands, but a handful arrived in Title Case and read to
// the check like any cultivar (#131). Matched as a lowercased substring, after
// the safelist above (so the generic "assorted brands" farina that merely names
// one is still kept).
//
// Deliberately a roster of named trademarks rather than a Title-Case
// proper-noun rule: 697 corpus rows carry a mid-description Title-Case token and
// nearly all name a cultivar, grade, geography or varietal ("Tommy Atkins",
// "Grade A", "New Zealand", "Pinot Noir"), so widening would cost precision this
// filter is built to protect (ADR-0042 §3). It grows one measured entry at a
// time; "muscle milk" is #152's.
const TRADEMARK_DENYLIST = [
  "cream of wheat",
  "cream of rice",
  "powerade",
  "reddi wip",
  "creamsicle",
  "natreon",
  "muscle milk",
];

/**
 * True when an FDC description names a specific brand — an ALL-CAPS token that is
 * not a generic acronym and not a safelisted generic food. Used to drop
 * brand-specific SR Legacy records so generic whole foods win the search; brands
 * belong to the OFF scan path. See the block comment above for the precision
 * guards and the corpus validation.
 */
export function isBrandSpecific(description: string): boolean {
  const lower = description.toLowerCase();
  if (GENERIC_FOOD_SAFELIST.some((phrase) => lower.includes(phrase)))
    return false;
  if (TRADEMARK_DENYLIST.some((phrase) => lower.includes(phrase))) return true;

  return (description.match(BRAND_CAPS) ?? []).some(
    (token) =>
      token.replace(/[^A-Z]/g, "").length >= 3 &&
      !GENERIC_CAPS_ACRONYMS.has(token)
  );
}

// ---------------------------------------------------------------------------
// Processed-product exclusion
//
// The USDA search is for un-barcoded BASE ingredients; a packaged/processed food
// (canned grapes, grape soda, juice drink, fruit cocktail) carries a barcode and
// belongs to the Open Food Facts scan path instead. Drop those so a food search
// returns raw and minimally-processed base foods.
//
// The markers are packaging/processing states — NOT cooking states — so generic
// cooked/roasted staples survive, and base foods that never carry "raw" (cheese,
// oil, spices, flour) stay findable (that's why this is narrower than a raw-only
// filter, which would drop those entirely). Two guards keep it precise:
//   - a food described "raw" is always a base ingredient and is never dropped,
//     even retail cuts sold frozen ("Lamb, … frozen, … raw");
//   - "carbonated" (not "soda") marks fizzy drinks, so "baking soda" survives.
// ---------------------------------------------------------------------------

const PROCESSED_MARKERS =
  /\b(canned|frozen|bottled|sweetened|syrup|drink|carbonated|concentrate|babyfood|cocktail|dehydrated|instant|ready-to-eat|juice|dry mix)\b/i;

/**
 * True when an FDC description names a packaged/processed product (a barcode-
 * bearing form handled by the OFF scan path) rather than a base ingredient.
 * Foods described as "raw" are always treated as base ingredients. See the block
 * comment above for the marker set and its guards.
 */
export function isProcessedProduct(description: string): boolean {
  if (/\braw\b/.test(description.toLowerCase())) return false;
  return PROCESSED_MARKERS.test(description);
}

// ---------------------------------------------------------------------------
// Prepared-food exclusion
//
// Some prepared/composite foods carry no brand and no packaging marker yet are
// plainly not base ingredients — "Candies, milk chocolate, with almonds",
// "Cookies, …", "Potato salad, home-prepared". Two signals drop them:
//
// 1. foodCategory — USDA files each food under a structured category, so the
//    categories that are wholly prepared are dropped outright. Beverages is NOT
//    among them: generic coffee/tea/water are reference foods worth keeping, and
//    the packaged drinks (soda, juice, ready-to-drink) already fall to the
//    brand/marker filters.
// 2. Composite-dish description markers — home-prepared dishes leak into base
//    categories ("Potato salad" is filed under Vegetables), so catch them by
//    description regardless of category.
//
// Two categories are mixed and split by the food's head word rather than dropped
// wholesale:
//   - "Sweets" holds confections (candies, chocolate, jams) AND single-ingredient
//     pantry sweeteners (honey, sugar, cocoa, molasses, syrup); only the
//     confections are dropped.
//   - "Baked Products" holds bready staples (bread, croissant, bagel, tortilla,
//     English muffin, biscuit) AND sweet treats (cake, cookies, doughnuts, pie);
//     only the treats are dropped, so a reference food like a croissant stays.
// Both keep their staples consistent with keeping oil, flour and spices.
//
// A head word alone cannot tell a staple from a confection USDA happened to name
// after one (#144), so each keep list carries an escape hatch: a marker that
// overrides the head word, scoped to the one category it is safe in.
// ---------------------------------------------------------------------------

const PREPARED_CATEGORIES = new Set([
  "Soups, Sauces, and Gravies",
  "Sausages and Luncheon Meats",
  "Breakfast Cereals",
  "Fast Foods",
  "Restaurant Foods",
  "Meals, Entrees, and Side Dishes",
  "Snacks",
  "Baby Foods",
]);

// Composite/prepared dishes that leak into base categories (e.g. "Potato salad"
// under Vegetables, "Chicken … cooked, fried, flour" under Poultry). Matched by
// description regardless of category. The breaded/battered/deep-fried markers
// catch fried DISHES (breaded fried chicken, french fries, breaded fish) while
// leaving simple cooked preparations alone — a plain fried egg, pan-fried meat
// or stir-fried mushroom is a reference food like a scrambled egg or a roast, so
// bare "fried" is NOT a marker; the flour/batter/breading coating is the signal
// (see the fried+flour rule in isPreparedProduct). No ", raw" food carries any
// of these words.
//
// `prepared from recipe` is USDA's own marker for a record whose composition was
// COMPUTED from a recipe rather than assayed, which is a claim about what the
// record IS and so a drop reason ADR-0055 §1 allows. It was deliberately excluded
// until #161 on the reading that a bread is a staple whatever its provenance.
// Measured, that reading was inconsistent rather than lenient: the phrase reaches
// 49 archive rows and the category rules already took 39 of them — every cake,
// pie, cookie, muffin, pancake, waffle, pie crust and French toast — leaving
// gingerbread, brownies and waffles ABSENT from the corpus as sole records
// nobody objected to losing. The 10 survivors survived only because
// `BAKED_STAPLE_HEADS` holds their head word, so `Bread, banana` stayed while
// `Cake, gingerbread` went for the same reason on the same evidence.
const PREPARED_DISH_MARKERS =
  /\b(home[- ](?:prepared|recipe)|prepared from recipe|au gratin|scalloped|breaded|breading|batter|french[- ]fried|fast food)\b/i;
// An assembled retail dessert, which USDA files under Dairy beside the plain
// tubs: "Ice cream sandwich", "Ice cream bar, … with crunch coating", "Ice
// cream sundae cone". The signal is the wafer, biscuit, stick or coating AROUND
// the ice cream, so the marker needs both halves — plain "Ice cream, soft serve,
// chocolate" is a base dairy food and stays, like cheese and butter.
//
// Anchored to ice cream rather than matched bare because the form words are
// ordinary English: a bare \bsandwich\b marker would take "Sandwich spread,
// meatless", "Beef, sandwich steaks, flaked, chopped, formed and thinly sliced,
// raw" and "Tortilla, includes plain and from mutton sandwich (Navajo)" with it.
const ICE_CREAM = /ice cream/i;
const ASSEMBLED_DESSERT_FORM = /\b(bar|stick|cone|cookie|sandwich|sundae)\b/i;
// "salad" names a dish ("Potato salad") — but also a use for a base cooking oil
// ("Oil, olive, salad or cooking"), which must NOT be dropped.
const SALAD_DISH = /\bsalad\b/i;
const SALAD_AS_OIL_USE =
  /salad (?:or|and) cooking|cooking (?:or|and) salad|salad oil/i;
// The same shape again, for the eight stews USDA files under "American
// Indian/Alaska Native Foods" — a category that is not wholly prepared, so §5's
// category rule never sees them, and no dish marker beside them fires (#144). A
// stew is the composite dish §5 exists to drop; "for stew" names what a raw
// retail cut is SOLD for ("Beef, chuck for stew, … raw"), which is not one.
const STEW_DISH = /\bstew\b/i;
const STEW_AS_CUT_USE = /\bfor stew\b/i;
// A packaged whipped topping, which USDA files under Dairy beside the cream it
// imitates. Named in full rather than by "topping" alone, because real whipped
// cream and grated parmesan are both described as toppings and are base foods.
const DESSERT_TOPPING = /\bdessert topping\b/i;

// Head words of the single-ingredient sweeteners in the mixed "Sweets" category
// that are base pantry staples, kept while the confections around them go.
const SWEETENER_HEADS = new Set([
  "honey",
  "sugar",
  "sugars",
  "syrup",
  "syrups",
  "molasses",
  "cocoa",
  "sweeteners",
]);

// Head words of the bready staples in the mixed "Baked Products" category that
// are reference foods, kept while the sweet treats (cake, cookies, doughnuts,
// pie) are dropped. "english" catches "English muffins"; plain "muffins" (corn,
// blueberry) are treats and stay out.
const BAKED_STAPLE_HEADS = new Set([
  "bread",
  "breads",
  "bagel",
  "bagels",
  "croissant",
  "croissants",
  "tortilla",
  "tortillas",
  "roll",
  "rolls",
  "bun",
  "buns",
  "biscuit",
  "biscuits",
  "pita",
  "naan",
  "english",
]);

// The escape hatches for the two head-word keep lists above (#144). Each is
// consulted ONLY inside its own category, which is what makes these ordinary
// words safe: 37 corpus rows say "sweet" and 34 of them are not baked (sweet
// potatoes, sweetcorn, sweet peppers, sweet cherries), and cake flour is flour,
// but none of those rows is ever asked. Inside the mixed categories the words are
// exactly the ones the block comment uses to say what each drops — "sweet treats
// (cake, cookies, doughnuts, pie)" and "confections" — so the marker states the
// rule the head word could only approximate.
const SWEET_CONFECTION_MARKERS = /\b(table blends?|fudge)\b/i;
const BAKED_TREAT_MARKERS = /\b(cake|sweet)\b/i;

/** The first alphanumeric word of a description, lowercased ("" if none). */
function headWord(description: string): string {
  return (
    description
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)[0] ?? ""
  );
}

/**
 * True when an FDC record is a prepared/composite food rather than a base
 * ingredient — by its foodCategory (wholly-prepared categories) or by a
 * composite-dish marker in its description (a home-prepared dish filed under a
 * base category, like "Potato salad"). The mixed "Sweets" and "Baked Products"
 * categories keep their staples (sweeteners; bready reference foods) and drop
 * the rest, unless the description names a confection the head word cannot see.
 * See the block comment above.
 */
export function isPreparedProduct(
  foodCategory: string | undefined,
  description: string
): boolean {
  if (PREPARED_DISH_MARKERS.test(description)) return true;
  if (ICE_CREAM.test(description) && ASSEMBLED_DESSERT_FORM.test(description))
    return true;
  // Flour-battered deep-fried dishes ("Chicken … cooked, fried, flour"). Needs
  // both words, so a plain fried egg is kept and plain flour is not touched.
  if (
    /\bfried\b/.test(description.toLowerCase()) &&
    /\bflour\b/.test(description.toLowerCase())
  )
    return true;
  if (SALAD_DISH.test(description) && !SALAD_AS_OIL_USE.test(description))
    return true;
  if (STEW_DISH.test(description) && !STEW_AS_CUT_USE.test(description))
    return true;
  if (DESSERT_TOPPING.test(description)) return true;
  if (isReconstitutedDrink(description)) return true;
  if (!foodCategory) return false;
  if (PREPARED_CATEGORIES.has(foodCategory)) return true;
  if (foodCategory === "Sweets")
    return (
      !SWEETENER_HEADS.has(headWord(description)) ||
      SWEET_CONFECTION_MARKERS.test(description)
    );
  if (foodCategory === "Baked Products")
    return (
      !BAKED_STAPLE_HEADS.has(headWord(description)) ||
      BAKED_TREAT_MARKERS.test(description)
    );
  return false;
}

/**
 * The words USDA writes on a record it cooked before it measured it.
 *
 * Whole words, never substrings, and the reason is not hypothetical: fourteen
 * corpus rows say `uncooked`, and a `/cooked/` that reads them as cooked deletes
 * `Quinoa, uncooked`, `Teff, uncooked`, `Spelt, uncooked` and
 * `Apricots, dried, sulfured, uncooked`. That is ADR-0100 §10's standing warning
 * — `Caraway` and `Strawberries` both contain the literal string `raw` — and the
 * measurement that produced this record's predecessor fell into it, which is why
 * the boundary is stated here rather than assumed.
 */
const COOKING_METHOD =
  /\b(cooked|boiled|roasted|baked|fried|broil|broiled|grilled|braised|steamed|stewed|simmered|poached|microwaved|toasted|blanched|sauteed|heated|parboiled)\b/i;

/**
 * The two cooking words that also name a food as it is SOLD, and the category
 * where that is true.
 *
 * The test is the **whole-foods shop**: a food you could scoop out of a bin and
 * carry home in a paper bag, with no label on it, is an ingredient. Roasted
 * peanuts and toasted sunflower seeds are sold exactly that way and nobody
 * roasts their own macadamias; parboiled rice is not, which is why `parboiled`
 * is in the list above and these two words are not. It is the same line that
 * keeps dried apricots — the cooking happened before the purchase and the thing
 * you buy is the roasted nut.
 *
 * Fifty rows of `Nut and Seed Products` say `roasted` or `toasted`:
 * `Peanuts, all types, dry-roasted`, `Seeds, sunflower seed kernels, toasted`,
 * `Nuts, almonds, honey roasted`.
 *
 * Scoped to the category and to those two words together, because neither alone
 * is safe: `roasted` outside this category is 374 rows of meat, and `boiled`
 * inside it is a chestnut somebody cooked. The six nut and seed rows naming any
 * other method — boiled chestnuts, boiled breadfruit seeds — are cooked and go.
 */
const BOUGHT_ROASTED_CATEGORY = "Nut and Seed Products";
const BOUGHT_ROASTED = /\b(roasted|toasted)\b/i;
const OTHER_METHOD =
  /\b(cooked|boiled|braised|fried|grilled|broiled|baked|steamed|stewed|simmered|poached|microwaved|blanched|sauteed)\b/i;

/**
 * True when a record measures a food somebody cooked, rather than the food.
 *
 * The corpus is ingredients as bought, and cooking is the one thing that happens
 * after the purchase and changes the number. A food-kind judgement of the same
 * species as {@link isPreparedProduct} and {@link isDryBasisRecord} beside it,
 * asked in the same place and for the same reason — except that this one is
 * asked AFTER `isPreparedProduct`, so a cooked dish is already gone and what
 * reaches here is an ingredient with a method written on it.
 *
 * **It removes foods the corpus cannot replace, and that is the accepted cost.**
 * Where USDA published only a cooked assay the food leaves entirely — turkey
 * breast, mutton, brown rice among them — and where a food is sold dry and eaten
 * wet the corpus is left holding only the dry figure. Both are recorded rather
 * than hidden: every casualty is in `docs/research/usda-drop-census.json` under
 * this rule, and the foods left with no row at all are listed in the ADR.
 *
 * Exported for the same reason its neighbours are: `scripts/usda-bundle.mjs`
 * applies it at generation time and must not restate it (ADR-0047 §4).
 */
export function isCookedForm(
  foodCategory: string | undefined,
  description: string
): boolean {
  if (!COOKING_METHOD.test(description)) return false;
  if (
    foodCategory === BOUGHT_ROASTED_CATEGORY &&
    BOUGHT_ROASTED.test(description) &&
    !OTHER_METHOD.test(description)
  )
    return false;
  return true;
}

/**
 * A powder made up into a drink, which is a drink and not an ingredient.
 *
 * `Beverages, Eggnog-flavor mix, powder, prepared with whole milk` is a glass of
 * eggnog. Nothing else reached it: `powder` is not a processed marker because
 * the corpus is full of powders that ARE ingredients — cocoa, curry, garlic,
 * tomato, baobab — and ADR-0042 deliberately keeps `Beverages` out of the
 * dropped categories so that generic coffee, tea and water survive.
 *
 * **Both halves are required and each one alone is wrong.** `prepared with`
 * alone reaches 45 rows and most are foods: `Tofu, firm, prepared with calcium
 * sulfate` names its coagulant, `Soy sauce made from soy and wheat` names its
 * grain, and four gluten-free breads name their flours. `powder` alone reaches
 * the spice rack. Together they name a mix reconstituted into a drink, which is
 * eight rows: the eggnog, carob, strawberry and cocoa mixes, a lemonade, a
 * cereal-grain coffee substitute and a whiskey sour.
 *
 * **Brewed coffee and tea are untouched**, which is the point of reading
 * `powder` rather than `prepared with`. `Beverages, coffee, brewed, prepared
 * with tap water` says `brewed`, and it is exactly the row ADR-0042's
 * prepared-food comment protects.
 */
const RECONSTITUTED_DRINK_POWDER = /\b(powder|mix)\b/i;
const RECONSTITUTED_FROM = /\bprepared with\b/i;

/**
 * True when a record is a drink mix made up rather than a food.
 *
 * Read by {@link isPreparedProduct} above the category tests, because it is that
 * judgement: a composite the category signal cannot reach, since `Beverages` is
 * a category the corpus keeps on purpose. Exported so the drop census can name
 * it as a cause in its own right rather than filing eight drinks under a
 * category that did not decide them.
 */
export function isReconstitutedDrink(description: string): boolean {
  return (
    RECONSTITUTED_DRINK_POWDER.test(description) &&
    RECONSTITUTED_FROM.test(description)
  );
}

/**
 * The basis USDA marks on a record measured against zero water — a laboratory
 * assay expressed per 100 g of dry matter, published so cultivars can be
 * compared. Anchored on the parenthesised marker rather than on the word, because
 * seven corpus rows say "moisture" and mean something else entirely (four
 * "(may contain additives to retain moisture)" fish and shrimp, three
 * low-moisture mozzarellas).
 */
const DRY_BASIS_MARKER = /\(\s*0\s*%\s*moisture\s*\)/i;

/**
 * True when an FDC record describes a basis nobody eats rather than a food
 * (ADR-0048 §5) — the seventeen `Beans, Dry, … (0% moisture)` assays.
 *
 * A food-kind judgement of the same species as {@link isPreparedProduct} and
 * {@link isProcessedProduct} beside it, and it holds whether or not the record
 * ever gains an energy value: dried beans as sold are already in the corpus with
 * complete panels, so keeping the dry-basis row would not add a food but a wrong
 * one — logging 100 g against a record that insists it contains no water
 * overstates every nutrient by about twelve per cent.
 *
 * Exported for the same reason its neighbours are: `scripts/usda-bundle.mjs`
 * applies it at generation time and must not restate it (ADR-0047 §4).
 */
export function isDryBasisRecord(description: string): boolean {
  return DRY_BASIS_MARKER.test(description);
}

/**
 * USDA's own words for an ingredient specification sold into a trade rather
 * than a food anyone buys: `Oil, industrial, palm kernel (hydrogenated),
 * confection fat`, `Wheat flour, white (industrial), 11.5% protein, bleached,
 * enriched`, `Beef, New Zealand, imported, manufacturing beef, raw`.
 *
 * Two words, not one, since #157. `manufacturing` is the trade grade for
 * boneless beef sold to be ground, reaches exactly the two rows above, and is
 * the same kind of claim `industrial` makes.
 */
const TRADE_SPECIFICATION_MARKER = /\b(industrial|manufacturing)\b/i;

/**
 * The one keep-word that decides a shortening (#157). USDA files fourteen rows
 * under the head word `Shortening` and writes the contrast itself: four say
 * `household` and are the tub in a cupboard; the other ten name the line they
 * are sold onto — a fryer, a cake mix, a confectionery fat, a bakery.
 */
const HOUSEHOLD_MARKER = /\bhousehold\b/i;

/**
 * The one emulsifier the corpus sells as an oil (#157): `Oil, soybean lecithin`,
 * a soap-and-chocolate ingredient standing in `Fats and Oils` beside the fats
 * people cook with.
 *
 * A marker rather than a denylist entry even though it reaches ONE row, and the
 * distinction from ADR-0055 §7's refused powder marker is that this word has no
 * unsafe form. §7 refused `powder` because widening it far enough to be useful
 * took curry, garlic, onion and chili powder, three cocoa powders, tomato
 * powder, baobab powder and dried egg white — fifteen real foods. `lecithin`
 * names one substance and cannot reach a food by accident, so a marker also
 * catches the next lecithin row USDA publishes, which a name in a list would
 * not.
 */
const LECITHIN_MARKER = /\blecithin\b/i;

/**
 * True when an FDC record describes a food-manufacturing input rather than a
 * food (#144, #157) — the third judgement of the {@link isDryBasisRecord}
 * species, and its own filter for the same reason: it is neither a packaging
 * state ({@link isProcessedProduct}) nor a composite dish
 * ({@link isPreparedProduct}), so folding it into either would make that
 * predicate answer two questions.
 *
 * What it asks is whether the DESCRIPTION names a trade grade, a sales channel
 * or a purchase specification — never whether the food is one this app's users
 * eat, which ADR-0055 §1 forbids as a drop reason. The narrow reading is
 * load-bearing and was measured: the wider "not a base food" deletes
 * `Wheat germ, crude`, `Wheat bran, crude`, `Rice bran, crude`,
 * `Corn bran, crude` and `Vital wheat gluten`, and there is no plain twin for
 * any of them — `crude` is USDA's word for UNPROCESSED, the opposite of a
 * specification. The honesty test is that every drop has a retail equivalent
 * left standing: Foundation carries the all-purpose flours by name, the
 * household shortenings and margarines keep their own rows, `Oil, soybean`
 * outlives its lecithin, and 958 beef rows including every ground form outlive
 * the two grades.
 *
 * The shortening clause reads the HEAD WORD rather than the category, which is
 * what makes an ordinary word safe here: `shortening` appears in exactly one
 * non-head-word corpus row, `Agutuk, fish with shortening (Alaskan ice cream)
 * (Alaska Native)`, and that is a dish. #144 scoped its escape hatches by
 * category because `sweet` and `cake` are unsafe corpus-wide; scoping this one
 * would cost a `foodCategory` parameter and buy nothing measured.
 *
 * It reaches **58 rows**: 45 on `industrial`, all of them USDA's own
 * convention; 2 on `manufacturing`; 10 shortenings the head word takes and
 * `household` does not save; and `Oil, soybean lecithin`, an emulsifier
 * standing in front of the oil.
 *
 * Exported for the same reason its neighbours are: `scripts/usda-bundle.mjs`
 * applies it at generation time and must not restate it (ADR-0047 §4).
 */
export function isManufacturingInput(description: string): boolean {
  if (TRADE_SPECIFICATION_MARKER.test(description)) return true;
  if (LECITHIN_MARKER.test(description)) return true;
  return (
    headWord(description) === "shortening" &&
    !HOUSEHOLD_MARKER.test(description)
  );
}

// ---------------------------------------------------------------------------
// The dishes no category signal reaches
// ---------------------------------------------------------------------------

/**
 * Composite dishes USDA filed under a category {@link isPreparedProduct} cannot
 * drop, read one row at a time.
 *
 * `isPreparedProduct` decides a dish mostly from USDA's own filing, and
 * `American Indian/Alaska Native Foods` is not a category it can take: 130 rows,
 * and all but a handful are single-ingredient foods nothing else in the corpus
 * carries — moose meat, bearded seal oil, bowhead blubber, walrus liver. Taking
 * the category would delete about 120 real ingredients to remove nine dishes,
 * which is the trade the `Sweets` and `Baked Products` splits already refuse.
 *
 * So these are written down instead. A hand-written drop is what ADR-0100 §6
 * licenses for a head somebody has read, and all 130 rows of this category were
 * read to produce the nine below.
 *
 * **The line is the corpus's own, not a fresh one.** `isPreparedProduct` keeps
 * bready staples — croissant, bagel, tortilla — and drops sweet treats and
 * composite dishes. So the breads here STAY, every one of them: `Bread, kneel
 * down`, `Piki bread`, `Tennis Bread, plain`, `Tortilla, blue corn, Sakwavikaviki`,
 * `Bread, blue corn, somiviki` and `Frybread, made with lard` are the same kind
 * of thing as a croissant, and dropping them while keeping a croissant would be
 * applying a stricter rule to one population than to another.
 *
 * **A word about parts.** The first attempt at finding these was a regex over
 * `and`, `with` and `bread`, and eight of its twenty-one hits were wrong:
 * `Fish, halibut, with skin`, `Whale, bowhead, skin and subcutaneous fat
 * (muktuk)` and `Walrus, meat and subcutaneous fat` use those words about PARTS
 * of one animal. A lexical rule here deletes real food in the one category where
 * ADR-0055 §1 is most explicit about not doing that, which is the whole reason
 * this is a list and not a predicate.
 *
 * **The descriptions are USDA's own, tag and all.** Each carries the
 * parenthesised population tag — `(Navajo)`, `(Apache)`, `(Alaska Native)` —
 * because that is the row's name when this rule sees it; ADR-0056's strip takes
 * the tag several passes later. Writing the stripped name here would be a
 * verdict about a string the rule never meets, and the guard in
 * `usda-bundle.mjs` refuses it.
 *
 * Two things deliberately NOT here. The brewed teas and
 * `Chilchen (Red Berry Beverage)` stay, because ADR-0042's prepared-food comment
 * keeps `Beverages` out of the dropped categories on the ground that generic
 * coffee, tea and water are reference foods — extending that line is a decision
 * of its own, not a tidy-up. And nothing is dropped for being anybody's food:
 * every row below is a recipe of several ingredients by any reading.
 */
export type AdjudicatedDish = readonly [
  fdcId: number,
  description: string,
  why: string,
];

export const ADJUDICATED_DISHES: readonly AdjudicatedDish[] = [
  [
    169823,
    "Agutuk, fish with shortening (Alaskan ice cream) (Alaska Native)",
    "Whipped fat with fish worked through it. A dish of several ingredients, and USDA's own gloss calls it ice cream.",
  ],
  [
    168976,
    "Agutuk, fish/berry with seal oil (Alaskan ice cream) (Alaska Native)",
    "The same dish with berries and seal oil.",
  ],
  [
    168977,
    "Agutuk, meat-caribou (Alaskan ice cream) (Alaska Native)",
    "The same dish made with caribou.",
  ],
  [
    167656,
    "Corned beef and potatoes in tortilla (Apache)",
    "Three foods assembled into a fourth. A composite dish by any reading, and the plainest case in the category.",
  ],
  [
    167627,
    "Mush, blue corn with ash (Navajo)",
    "Cornmeal cooked into a porridge with ash stirred in. The cooked-form rule cannot see it because `mush` is not one of USDA's preparation words.",
  ],
  [
    168027,
    "Soup, fish, homemade (Alaska Native)",
    "A soup, and USDA says homemade. `isPreparedProduct` drops every other soup by category.",
  ],
  [167636, "Tamales (Navajo)", "Masa wrapped around a filling and steamed."],
  [
    169007,
    "Tamales, masa and pork filling (Hopi)",
    "The same dish with its filling named.",
  ],
  [
    168041,
    "Tortilla, includes plain and from mutton sandwich (Navajo)",
    "Not a tortilla: USDA has averaged a plain tortilla together with a filled sandwich, so the row is partly a dish and its panel is neither thing. It is also what a typed `mutton` now leads with, real mutton having left with the cooked rows.",
  ],
];
