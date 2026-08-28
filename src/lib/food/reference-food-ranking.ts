/**
 * ADR-0042's reference-food ranking: how a free-text query orders the foods it
 * reaches. Its own module because it outlives its first caller — the FDC search
 * API built it, and the bundled corpus (ADR-0047) is what runs it now, over
 * 4,238 rows per keystroke rather than over one page of API results.
 *
 * Most of the ordering reads a NAME. Two keys read the ROW instead (ADR-0055),
 * and the section at the bottom of this file is theirs: whether a plainer twin
 * of the food exists elsewhere in the corpus, and whether USDA published the
 * record for a designated population. Neither is legible from a description,
 * which is why they are not fields of {@link ReferenceFoodName}.
 */

/**
 * Names a form that is a MODIFICATION of the food rather than the food: an
 * imitation, a substitute, or a fat/sodium reduction. #143's measure of what
 * makes a record canonical, and the half of it that survived measurement.
 *
 * Phrases, not bare words, and every one priced against the corpus before it
 * landed (#131: an unmeasured precision guard is a hole). A bare "low" matches
 * "Seal, bearded (Oogruk), meat, low quadrant"; "made with" was proposed and
 * REMOVED, because its 20 rows are mostly recipes rather than substitutes
 * ("Frybread, made with lard", "Pasta, homemade, made with egg"). What ships
 * touches 9 rows for `imitation`, 14 for `substitute`, 8 for `meatless` and 3
 * for `filled`, and every one of those was read.
 */
const MODIFIED_FORM =
  /\b(imitation|substitute|meatless|low sodium|low fat|lowfat|reduced fat|reduced sodium|fat free|fat-free|nonfat|non-alcoholic|gluten[- ]free|filled|non-soy)\b/i;

/**
 * Modifiers that name a modified form ONLY when they are the whole qualifier.
 *
 * The same question {@link MODIFIED_FORM} asks, asked of a comma-part rather
 * than of the string, because for these two words the string is where it goes
 * wrong. `light` as a word reaches 49 corpus rows and most are not light
 * anything — chicken and turkey LIGHT MEAT, mushrooms exposed to ultraviolet
 * LIGHT, `light and dark meat`; as a whole qualifier it reaches 15, and every
 * one of them is a reduced form of its food. `cooking` reaches 7 as a word, six
 * of them `salad or cooking` oils, and 1 as a qualifier: a cooking wine, which
 * is salted and is not a drink.
 *
 * So a second mechanism exists for a measured reason rather than a stylistic
 * one, and `non-alcoholic` above deliberately does not use it: that word is
 * safe as a word, and belongs to the family `nonfat` and `non-soy` already name
 * (#154).
 *
 * `cooking` reaching a single row is stated rather than hidden. ADR-0055 §7
 * refused a powder marker that reached four, but the objection there was that
 * the predicate had no safe form at ANY reach — its wider spelling took curry,
 * garlic and onion powder with it. This spelling is exact, the row was read,
 * and `filled` in the list above has shipped at three since #143.
 */
const MODIFIED_PART = new Set(["light", "cooking"]);

/**
 * The head phrases USDA writes as a shelf label instead of as the food's name.
 *
 * USDA names a food "Food, qualifier", and everything below leans on that: the
 * head phrase is the food's identity. For these sixteen it is not. A wine is
 * filed as `Alcoholic beverage, wine, table, red` and a tea as
 * `Beverages, tea, green, …`, so the food's own name starts one or two words
 * in, and every key that reads WHERE a word sits charges the food for the walk
 * down the aisle. That is the whole of #154: `red wine` led with
 * `Vinegar, red wine`, because USDA spends one word naming the vinegar and two
 * getting to the wine.
 *
 * The test for membership, so the roster can be extended without guessing: a
 * shelf label's qualifiers name DISTINCT FOODS, where an ordinary head's name
 * PARTS OR PREPARATIONS of the one food it already named. `Fish, salmon` and
 * `Nuts, almonds` name a different animal and a different tree, and
 * `Cheese, cheddar` a different cheese; `Beef, chuck, arm pot roast` names a
 * cut of the beef the head already named, as every one of the 959 beef rows
 * does. That is what keeps `beef`, `pork`, `lamb`, `veal`, `chicken` and
 * `turkey` out — 1,946 rows between them, and the reason the roster is not
 * simply "a head many rows share".
 *
 * `oil` satisfies the test and is absent anyway, which is a SCOPING refusal and
 * not a test outcome: `Oil, olive` and `Oil, corn` are as distinct as two
 * fishes, but #155 settled that family a week ago and re-opening it belongs to
 * its own ticket. Measured, so the cost of the refusal is known rather than
 * assumed: adding `oil` moves exactly one lead, `safflower` from
 * `Seeds, safflower seed kernels, dried` to `Oil, safflower`.
 *
 * Reaches 720 rows, pinned as a tripwire in `usda-corpus.test.ts` the way
 * ADR-0055 §3 pinned `plainSibling`'s 131 (#131: an unmeasured guard is a hole).
 * Thirty-eight left with ADR-0061's drops — thirty-two under `milk`, which is
 * one of the eighteen labels, and six milk drinks under `beverages`.
 */
const SHELF_LABEL_HEAD = new Set([
  "alcoholic beverage",
  "alcoholic beverages",
  "beverages",
  "cheese",
  "crustaceans",
  "fat",
  "fish",
  "game meat",
  "margarine-like",
  "milk",
  "mollusks",
  "nuts",
  "poultry",
  "seaweed",
  "seeds",
  "spices",
  "sweeteners",
  "syrups",
]);

/**
 * Names a food that has been cooked. The `raw` key above already prefers a raw
 * food, but it cannot separate a PREPARED row from a merely unqualified one:
 * 1,204 of the corpus rows are neither raw nor cooked, so "Spinach, cooked,
 * boiled, drained" and "Spinach, baby" tie on `raw` at 0 and nothing else
 * looked. That gap is the whole of what this closes (#143).
 *
 * Deliberately NOT a corpus filter. A preparation word touches 40% of the rows,
 * and dropping them would leave a logged bowl of rice costed at dry-rice energy
 * — ~360 kcal/100 g against ~130 — which is #126's silent-miscount harm with a
 * plausible number on it. ADR-0042 §5 keeps a plain fried egg for the same
 * reason. The preference belongs here, in the order, not in the filter.
 */
const PREPARED_FORM =
  /\b(cooked|boiled|roasted|baked|fried|broiled|grilled|braised|steamed|stewed|simmered|poached|microwaved|toasted|blanched|sauteed)\b/i;

/**
 * Names a qualifier that is a fat SEPARATED from a food, rather than a food.
 *
 * The distinction #162 turns on, and it is a narrower one than it looks. USDA
 * writes `separable lean and fat` on the rows that ARE the meat and
 * `separable fat` on the fat a butcher trims off it, so a marker reading the
 * words `separable` or `fat` selects for both — which is why #143's part key
 * broke four correct leads. This matches a WHOLE qualifier, the mechanism
 * {@link MODIFIED_PART} exists for, and that exactness is the whole guard.
 * `separable lean and fat` alone is 759 rows spanning 107 to 471 kcal, and
 * `lean and fat`, `boneless separable lean and fat` and
 * `separable lean and fat only` one row each at 172, 127 and 157; all four are
 * real meat, and all four are outside this.
 *
 * Eight qualifier words and the bare form, because demoting one spelling hands
 * the lead to the next: taking `external fat` out of `australian beef` promoted
 * `seam fat` at 562 kcal. Reaches 51 rows, every one of them read, and the
 * panel says what the name does — the lightest is 444 kcal and the heaviest
 * 902, where the heaviest row the exclusions keep is 471. The optional trailing
 * parentheses are USDA's own annotations, `(from ham and arm picnic)` and
 * `(Alaska Native)`.
 *
 * `Whale, bowhead, skin and subcutaneous fat (muktuk) (Alaska Native)` is
 * deliberately outside it at 465 kcal: muktuk is a food people eat, not a
 * fraction anyone discards, and it is what `bowhead whale` leads with now.
 */
const SEPARATED_FAT =
  /^(?:composite of )?(?:(?:separable|external|seam|intermuscular|subcutaneous|leaf|rendered|animal) )?fat(?: only)?(?: \([^)]*\))*$/;

/**
 * Names a row USDA published as the AVERAGE of a food's cuts rather than as one
 * of them: `Beef, composite of trimmed retail cuts, …`,
 * `Game meat, rabbit, domesticated, composite of cuts, …`.
 *
 * A phrase and not the bare word, measured: `composite` alone reaches 70 rows
 * and eight of them are a margarine or a shortening blended from several
 * brands, which is a different sense of the word entirely. `composite of`
 * reaches 61, across five head phrases — beef, pork, lamb, veal and game meat —
 * and every one of them is USDA averaging an animal over its cuts.
 *
 * 70 less 8 is 62, and the ninth row the phrase drops is stated rather than
 * rounded away: `Beef composite, separable lean only, trimmed to 1/8" fat,
 * choice, cooked` is a real composite USDA spelled without the `of`. It is
 * left out. It is cooked, so `raw` demotes it below every raw candidate two
 * keys earlier and it can never lead a bare `beef`; and a clause reaching one
 * row by its head phrase is a denylist entry in a predicate's clothes, which is
 * the test #157 was cut on.
 */
const COMPOSITE_OF_CUTS = /\bcomposite of\b/i;

/**
 * A reference food's name, read the way ranking reads it: as words rather than
 * as a string, with the query-independent half of the score already settled.
 *
 * Separated from the description because the corpus a keystroke ranks is now the
 * whole 4,238-row Search index (ADR-0047 §4). Re-splitting every description on
 * every keystroke measured 17 ms; splitting each once and comparing the words
 * costs 1.4 ms, and the split does not depend on what was typed.
 */
export interface ReferenceFoodName {
  /** Every word of the description, lowercased. */
  words: string[];
  /** Those words with a trailing "s" dropped, so "grapes" answers "grape". */
  stems: string[];
  /**
   * How many leading words belong to the head phrase — the part before the first
   * comma, which is the food itself in USDA's "Food, qualifier" naming. A count
   * rather than a second array: the comma is a word separator too, so the head's
   * words are exactly the first `headLength` of `words`.
   */
  headLength: number;
  /** Characters across the head phrase's words, for head-completeness. */
  headChars: number;
  /**
   * How many leading words are a shelf label rather than the food's own name —
   * 2 for `Alcoholic beverage, wine, …`, 0 for everything USDA names properly.
   * See {@link SHELF_LABEL_HEAD}.
   *
   * Read by the two keys that ask WHERE a word sits, `position` and `accounted`,
   * and deliberately by nothing else: `headLength` and `headChars` still cover
   * the whole head phrase, so the tier a name reaches is exactly what it was
   * (#154). A tea filed under `Beverages` is still a qualifier match — the tier
   * gap that buries it is #153's and untouched here — but a row the typed words
   * reach only PAST its own name is no longer an answer at all where some row
   * names the food better, which is the half of that defect
   * {@link NameKey.named} closes (ADR-0062 §1).
   */
  shelfLength: number;
  /**
   * How many leading words are the food's OWN NAME: the head phrase, or the head
   * phrase plus the qualifier straight after it where the head is a shelf label.
   * `Nuts, coconut milk, raw` is 3 and `Cheese, mozzarella, whole milk` is 2.
   *
   * The distinction ADR-0062 §1 turns on, and deliberately not the head phrase:
   * {@link SHELF_LABEL_HEAD} files `cheese`, `nuts` and `milk` together, so a
   * rule reading the head cannot tell a coconut milk from a cheese made with
   * milk. Which PART the word sits in can. It counts from 0 rather than from
   * `shelfLength`, because a word matched IN the label is not matched past the
   * food's name either — `cheese` names every `Cheese, …` row as it always did.
   */
  nameLength: number;
  /** 1 for a raw food, 0 otherwise — the base-ingredient preference. */
  raw: number;
  /** Raw simplicity: "Bananas, raw" (3) over "Bananas, overripe, raw" (2). */
  simplicity: number;
  /** 1 for a name that is neither a modified form nor a prepared one (#143). */
  plain: number;
  /**
   * How much of its food this row is a record of: 2 the whole animal averaged
   * over its cuts, 0 a fat separated from it, 1 anything in between (#162).
   */
  wholeness: number;
}

/**
 * The plurals English spells with "es" after a sibilant: radishes, peaches,
 * boxes, glasses. A bare "s" leaves "radishe", which no spelling of "radish"
 * equals, so the vegetable ranked below "Radish seeds, sprouted, raw" (#138).
 */
const SIBILANT_PLURAL = /(?:ch|sh|x|ss|z)es$/;

/**
 * Reduces a word to its singular, the whole of the stemming this ranking does.
 *
 * Dropping a trailing "s" alone is not enough, and the gap was a real defect:
 * "potatoes" became "potatoe", which no spelling of "potato" ever equals, so
 * searching the food by its own name ranked it below "Sweet potato leaves".
 * Four English plurals that a bare "s" gets wrong are common enough in food
 * names to handle, and nothing else is: "-oes" (potatoes, tomatoes, mangoes),
 * "-ies" (berries, cherries), "-es" after a sibilant (radishes, peaches), and
 * the single irregular "leaves", without which a typed "grape leaf" reached
 * nothing at all.
 *
 * "leaves" is an entry rather than a "-ves" rule, on measurement. The corpus
 * holds six "-ves" words and only two are plurals; the general rule would stem
 * "chives" to "chif", "cloves" to "clof" and "olives" to "olif". Each still
 * matches itself, because a query and a name run through this same function —
 * but a user typing the SINGULAR "chive", "clove" or "olive" would stop
 * whole-word-matching the plural name, which works today. It breaks three real
 * foods to fix two words. "halves" is rejected the same way: it regresses a
 * search for "halves" from walnut halves to a pork rump half and improves
 * nothing.
 *
 * Deliberately not a real stemmer. Anything more aggressive starts merging words
 * that name different foods, and the tiers below are built on the assumption
 * that two stems being equal means two words being the same word. That
 * assumption is checked rather than trusted: a query stem is only ever tested
 * against corpus stems, so a false positive needs two CORPUS words to collide,
 * and `usda-corpus.test.ts` pins every word these rules touch against what it
 * now shares a stem with. Run that check before adding a fifth rule.
 */
export const stemOf = (word: string): string => {
  if (word === "leaves") return "leaf";
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("oes")) return word.slice(0, -2);
  if (SIBILANT_PLURAL.test(word)) return word.slice(0, -2);
  return word.endsWith("s") ? word.slice(0, -1) : word;
};

/**
 * Splits text into the words ranking compares, on every non-alphanumeric run.
 *
 * The ONE tokeniser: a typed query and a food's description are read by the same
 * function, because a token is only ever compared against a word this produced.
 * They used to differ — the query split on whitespace alone — so a hyphen,
 * apostrophe, bracket or comma inside a typed word produced a token no name word
 * could equal or prefix, and the query collapsed to `NO_MATCH`. `mahi-mahi`,
 * `whole-wheat pasta` and `yambean (jicama)` all found nothing, and 4,394 of the
 * then-4,429 shipped rows could not be reached by their own description (#136).
 *
 * It also drops the Lucene-style trailing `*` that callers pass, since a
 * wildcard is not alphanumeric either.
 */
export const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * The parts of a description, as the qualifier boundaries USDA writes them.
 *
 * Commas rather than words, because a part has to match WHOLE: reading
 * "Cheese, cheddar" as words would make it a prefix of "Cheese, cheddars" and
 * every plural would demote its own singular. Whitespace is collapsed as well as
 * trimmed, because USDA ships `Game meat , bison, ground, raw` with the space
 * before its comma, and a roster lookup that missed it would silently skip 59
 * rows.
 *
 * The one place a qualifier boundary is defined, and exported so it stays that:
 * the shelf-label lookup, the whole-qualifier modifier test,
 * {@link plainSiblingsOf}, the sweep shapes in `usda-ranking-queries.mjs` and
 * the tripwires over the shipped corpus all ask it. A second copy is not a
 * near-duplicate helper but a second answer, free to drift — and the way it
 * drifts is silent, since a copy that forgot the whitespace collapse would
 * measure a predicate the app does not apply.
 */
export const qualifiersOf = (description: string): string[] =>
  description
    .toLowerCase()
    .split(",")
    .map((part) => part.trim().replace(/\s+/g, " "))
    .filter(Boolean);

/**
 * Whether any of a name's qualifiers names a fat separated from the food.
 *
 * Taken over qualifiers already split, so the scoring path does not pay for a
 * second split; {@link isSeparatedFat} is the same question asked of a whole
 * description, and there is still only ONE answer to it.
 */
const hasSeparatedFat = (parts: readonly string[]): boolean =>
  parts.some((part) => SEPARATED_FAT.test(part));

/**
 * Whether a description names a fat separated from a food rather than a food.
 *
 * Exported so a test can ask the predicate rather than restate it (#131): a
 * second spelling of {@link SEPARATED_FAT} in the suite would be free to drift
 * from the one the app applies, and the way it drifts is silent.
 */
export const isSeparatedFat = (description: string): boolean =>
  hasSeparatedFat(qualifiersOf(description));

/**
 * Reads a description into the shape ranking compares. Pure, and cheap enough to
 * call per search hit; the bundled corpus calls it once per row at load instead.
 */
export function readReferenceFoodName(description: string): ReferenceFoodName {
  const words = wordsOf(description);
  const parts = qualifiersOf(description);
  const head = wordsOf(parts[0] ?? "");
  const lower = description.toLowerCase().trim();
  // Where the food's own name starts (#154). A shelf label with nothing after
  // it IS the name, so a lone "Spices" keeps its head rather than losing it.
  const shelfLength =
    parts.length > 1 && SHELF_LABEL_HEAD.has(parts[0]) ? head.length : 0;
  // Where the food's own name ENDS (ADR-0062 §1). Past a shelf label the name is
  // the qualifier the label leads to — `Nuts, coconut milk` names a milk — and
  // `shelfLength` is only ever set where that qualifier exists.
  const nameLength =
    shelfLength > 0 ? shelfLength + wordsOf(parts[1]).length : head.length;
  // Base-ingredient preference: someone searching a food wants the raw base
  // form, so raw ("… raw" anywhere in the name) outranks every processed form.
  const raw = /\braw\b/.test(lower) ? 1 : 0;
  // Simplicity tiebreak among raw foods: "Bananas, raw" (3) over "Bananas,
  // overripe, raw" (2) over anything merely containing "raw" (1) over the rest.
  const simplicity = lower.endsWith(", raw")
    ? (lower.match(/,/g) || []).length === 1
      ? 3
      : 2
    : raw;
  // The canonical-record preference: among rows that tie on everything else,
  // the plain form of the food beats a modified or cooked one.
  const plain =
    MODIFIED_FORM.test(lower) ||
    PREPARED_FORM.test(lower) ||
    parts.some((part) => MODIFIED_PART.has(part))
      ? 0
      : 1;
  // How much of the food the row is a record OF. The separated-fat test runs
  // first because the two markers overlap and the fraction wins when they do:
  // `Veal, composite of trimmed retail cuts, separable fat, raw` is USDA
  // averaging the TRIMMINGS over the cuts, at 638 kcal, and it is the row a
  // composite preference alone would have handed `veal`.
  const wholeness = hasSeparatedFat(parts)
    ? 0
    : COMPOSITE_OF_CUTS.test(lower)
      ? 2
      : 1;
  return {
    words,
    stems: words.map(stemOf),
    headLength: head.length,
    headChars: head.reduce((n, w) => n + w.length, 0),
    shelfLength,
    nameLength,
    raw,
    simplicity,
    plain,
    wholeness,
  };
}

/**
 * How well one name answers a query, as the ordered keys the ranking sorts on.
 * Larger is better in every field, and each is only consulted when the one
 * before it ties.
 *
 * With one field that is not a sorting key at all: `named` decides what a query
 * RETRIEVES rather than how the results order (ADR-0062 §1). It rides here
 * because it is the same reading of the same name against the same tokens, and
 * because a second pass asking it would be free to disagree with this one about
 * what a token matched (#131). See {@link withoutStrayMentions}.
 */
export interface NameKey {
  /**
   * Structural relevance, strongest first. Every rung asks the same question —
   * how much of the food's OWN NAME the query accounts for — because USDA names
   * a food "Food, qualifier", so the head phrase before the first comma is its
   * identity and everything after it is description.
   *
   * - **50** — the head phrase IS the query. "grape" -> "Grapes, raw".
   * - **40** — a typed word IS a head word. "grape" -> "Grape leaves, raw".
   * - **30** — the head COMPLETES the query: every head word starts with a typed
   *   token, so the query is that name still being typed. "pot" -> "Potatoes, …".
   * - **20** — a typed word is a whole word, but only in a qualifier.
   *   "pot" -> "Beef, chuck, arm pot roast, …"; "grape" -> "Tomatoes, grape, raw".
   * - **10** — a token merely prefix-matches some word anywhere.
   * - **0** — no match.
   *
   * The two middle rungs are what the retired ADR-0042 §2 Lucene boost used to
   * do. Its `lowercaseDescription.keyword:<prefix>*^500` was a "name starts with"
   * boost, so it floated head matches over qualifier matches inside FDC's one
   * page; ranking the whole corpus locally had no equivalent, and "pot" reached
   * a beef pot roast 40 rows before it reached a potato.
   *
   * Rung 40 sits above rung 30 because a typed word landing exactly on a head
   * word beats one that merely prefixes a longer, different head word: for
   * "grape", grape leaves are a grape and a grapefruit is not.
   *
   * The numbers are ordinal only — `compareRelevance` reads the keys in order
   * rather than summing them, so a tier is never traded against a later key.
   */
  tier: number;
  /**
   * Whether the query reached the food's OWN NAME: true when some typed token
   * matched within {@link ReferenceFoodName.nameLength}, false when every one of
   * them matched only in a part beyond it.
   *
   * ADR-0062 §1, and it is the reason `milk` reads as an answer. USDA writes an
   * ingredient where a qualifier goes, so `Cheese, mozzarella, whole milk`
   * matches `milk` as a whole word in a part naming what the cheese is MADE OF;
   * twelve cheeses, seven yogurts, a mashed potato and a coffee substitute
   * reached a bare `milk` that way, and ADR-0061's drops promoted every one of
   * them onto the first screen.
   *
   * EVERY typed token, not any, and that is the whole safety argument. Under the
   * vocabulary phrase `yogurt plain whole milk`, `yogurt` and `plain` land on
   * the name, so `Yogurt, plain, whole milk` stays — which it has to, because
   * `vocabulary_local` ships `natural yoghurt` pointing at that row and a hand
   * entry is admitted only where the search leads with the row it recorded
   * (ADR-0049 §4).
   *
   * A boolean, and the one field here that no comparison reads: what it decides
   * is whether the row is RETRIEVED, in {@link withoutStrayMentions}, which
   * needs the whole result set to answer. As an ordering key it was measured at
   * 20 moved leads, two of them a cost, and bought nothing — the milks already
   * outranked the cheeses, so only removing them clears the screen.
   */
  named: boolean;
  /** The name's raw-ness, carried through so one comparison reads one key. */
  raw: number;
  /** How completely the query fills the head phrase; negative chars-to-go. */
  head: number;
  /**
   * Whether the query accounts for the WHOLE name: 1 when every word of the
   * name is answered by a typed token, 0 when any word is left over.
   *
   * `head` above asks this of the head phrase and stops at the first comma, so
   * nothing asked it of the rest of the name. That gap is what left
   * "Oil, soybean" and "Oil, soybean lecithin" agreeing on all eight keys for a
   * typed "soybean oil", with `Array.sort`'s stability handing the lead to the
   * lower `fdcId` — an emulsifier, for a query naming an oil (#155).
   *
   * A BOOLEAN, and the ticket's own "fewer unaccounted words" is refused. USDA
   * writes its most generic animal rows with the most words — a whole chicken
   * is "meat and skin and giblets and neck" — so counting leftovers prefers
   * "Chicken, ground, raw" to the generic row, which is #143's rejected part key
   * arriving by a different route. Measured over the same 3,376-query sweep that
   * priced this key, the count breaks all four of #143's generic-animal leads —
   * every one to a `… ground, raw` row — and moves 339 leads against this
   * key's 4.
   *
   * The boolean cannot reach them, and not by luck: it fires only where some
   * candidate is FULLY accounted, and no chicken row is named "Chicken". Where
   * nothing is fully accounted every candidate scores 0, the key ties uniformly
   * and the order is unchanged — the same self-gating ADR-0055 §4 relies on.
   *
   * Its slot could not be measured. Run after `head`, after `position`, after
   * `simplicity` and dead last, it changes the same four leads and no others, so
   * the placement is an argument rather than a finding: it sits beside `head`
   * because it asks `head`'s question of the whole name, the way `plainSibling`
   * sits beside `plain` because it asks `plain`'s question of the corpus.
   */
  accounted: number;
  /**
   * Where in the name the query landed: for each typed token, the index of the
   * first word that answers it, summed across tokens and negated so that larger
   * is better, as every other key is.
   *
   * Past the head phrase the other four keys are blind to position, so
   * "Oil, olive, salad or cooking" and "Oil, corn, peanut, and olive" scored
   * identically on all of them and `Array.sort`'s stability handed "olive oil"
   * to whichever `fdcId` was lower — a blend, for a query naming a single oil
   * (#124). USDA orders qualifiers by descending importance, so
   * "Oil, olive, extra virgin" names olive first because that is what the food
   * is, and how far in a word sits says how much the food is that thing.
   *
   * SUMMED, not smallest. The obvious reading does nothing at all on the case
   * that prompted it, because "oil" is word 0 of both candidates:
   *
   * ```
   * Oil, corn, peanut, and olive    per-token [4, 0]   min 0   sum 4
   * Oil, olive, salad or cooking    per-token [1, 0]   min 0   sum 1
   * ```
   *
   * Summing reads as "how far into the name did the query's words land, in
   * total". It also settles, for free and with no exclusion rule, whether a head
   * match should count: index 0 contributes 0, so the key never restates what
   * the tier already said.
   *
   * It addresses `adjective + noun` queries and leaves head-only ties untouched
   * by construction — when the query IS the head phrase every candidate matches
   * at index 0 and every candidate still ties. That class is #143.
   */
  position: number;
  /**
   * Whether the name is the PLAIN form of its food: 1 unless it is a modified
   * form (imitation, substitute, reduced-fat) or a prepared one.
   *
   * The key ADR-0042's #124 Amendment reserved this slot for, and it is not the
   * key that Amendment predicted. Two things it assumed did not survive
   * measurement (#143):
   *
   * - It reserved the slot for a "least-qualified" key. Counting qualifiers is
   *   the measure #130 already disproved — USDA writes the canonical milk with
   *   MORE qualifiers than the imitation one — so this is a boolean.
   * - It expected the key to absorb `simplicity`. Deleting `simplicity` breaks
   *   five of the eighteen cases measured as already correct, so it stays.
   *
   * A companion key preferring a WHOLE food over a part of it was measured and
   * rejected outright: USDA names its most GENERIC animal rows with part
   * vocabulary — a whole chicken is "meat and skin and giblets and neck", and
   * the generic pork row is "a composite of … separable lean and fat" — so such
   * markers select FOR the canonical row. It broke four correct leads and fixed
   * none.
   *
   * No query branch, and none is needed: retrieval admits a row only when EVERY
   * typed token matches it, so a typed marker word is present in every retrieved
   * row and this key ties across all of them. Someone searching "boiled egg" or
   * "low fat milk" is not demoted by it, measured over 15 such queries.
   */
  plain: number;
  /**
   * How much of its food this row is a record of: 2 the whole animal averaged
   * over its cuts, 0 a fat separated from it, 1 anything in between.
   *
   * This IS the whole-over-part key #143 measured and rejected, and it works
   * for the reason that one failed: it does not read part vocabulary. USDA
   * names its most GENERIC animal rows with the most part words — a whole
   * chicken is "meat and skin and giblets and neck" — so `separable`, `lean`,
   * `fat` and `retail cuts` select FOR the canonical row as readily as against
   * a trimming, and #143's key broke four correct leads on exactly that. What
   * this reads instead is USDA's own word for a composite of cuts,
   * `composite of`, and a closed list of whole qualifiers naming a separated
   * fat. See {@link COMPOSITE_OF_CUTS} and {@link SEPARATED_FAT}.
   *
   * Measured over the same 3,976-query sweep the other keys are priced on, it
   * moves 16 leads, and it is the only key in this list that EXPLAINS four
   * leads the suite already pinned. `pork` and `lamb` lead with a composite row
   * and always have — but their ties were 84 and 129 rows deep and no key
   * separated them, so both leads were dealt by `fdcId` rather than won
   * (#158 §4). This key takes those ties to 5 and 8, keeping the same two rows.
   * `turkey` has no composite and no fat row in its tie, so it ties uniformly
   * at 1 and nothing moves; `chicken` fires only to demote
   * `Chicken, broilers or fryers, separable fat, raw`, 58 rows to 57, and keeps
   * its lead.
   *
   * Its slot WAS measured, and half of it matters. From `position` downwards —
   * after `position`, after `plainSibling`, here, or after `simplicity` — the
   * same 16 leads move and no others, so among those four the placement is an
   * argument: it sits after `plain` because it asks `plain`'s question one step
   * further out, `plain` asking whether this is the food in its plain form and
   * this asking whether the row is a record of the food at all.
   *
   * ABOVE `position` it is a different key, moving 34 more leads, and those are
   * the reason it is not there. It starts overriding where the query's words
   * landed: `blade pork` goes from `Pork, fresh, loin, blade (chops or roasts),
   * …` to `Pork, fresh, composite of trimmed retail cuts (loin and shoulder
   * blade), …`, which is a composite mentioning "blade" in passing answering a
   * query that names a chop. #124 adopted `position` to stop exactly that, and
   * a wholeness preference is not entitled to outrank it.
   *
   * What it deliberately leaves is the tie UNDER the composite marker. USDA
   * publishes twelve raw beef composites, one per grade and trim, and no key
   * here separates `all grades` from `choice` or 0" from 1/8" — so `beef` is
   * still an `fdcId` accident among rows spanning 130 to 224 kcal. That is a
   * 94 kcal accident where it was a 777 kcal one, and closing it needs a
   * grade/trim preference nothing in this ranking has asked for yet.
   */
  wholeness: number;
  /** The name's raw simplicity, carried through for the same reason. */
  simplicity: number;
}

/**
 * A finished key: how well one NAME answers the query, plus the two facts about
 * the ROW that name belongs to.
 *
 * Split rather than one interface so a query scorer cannot invent a row fact. It
 * scores a name and its return type says so; only `bestNameKey`, which has the
 * row, can produce one of these. The alternative was for
 * {@link compileReferenceFoodQuery} to emit placeholder 1s and trust a later
 * spread to overwrite them, which is an invariant a comment has to carry.
 */
export interface RelevanceKey extends NameKey, RowRank {}

/** A name that does not answer the query at all — every later key is moot. */
const NO_MATCH: NameKey = {
  tier: 0,
  named: false,
  raw: 0,
  head: 0,
  accounted: 0,
  position: 0,
  plain: 0,
  wholeness: 0,
  simplicity: 0,
};

/** A head phrase the query does not cover, ranked below every one it does. */
const HEAD_UNMATCHED = -1e6;

/**
 * Orders two relevance keys best-first, for `Array.prototype.sort`.
 *
 * The one place the order is expressed, which is why the two row keys ADR-0055
 * adds are fields here rather than a second sort in `usda-corpus.ts`.
 *
 * Three of the slots were argued rather than measured, and each says which:
 * `accounted` sits beside `head` because it asks `head`'s question of the whole
 * name; `plainSibling` sits beside `plain` and above it, because it asks
 * `plain`'s question of the corpus rather than of the name; `designated` sits
 * last, because it is the weakest signal available and, measured over every
 * corpus head phrase and head word, placing it last rather than immediately
 * after `position` changes the same two leads and no others.
 *
 * {@link NameKey.named} is deliberately absent: it decides what a query
 * RETRIEVES (ADR-0062 §1) and nothing about the order of what it retrieved.
 * Measured as a key it moves 20 leads from under `tier` and 42 from above it,
 * against nothing at all as a filter — and two of the 20 are a cost, `chili`
 * handed from a pepper to a spice and `butternut` from a squash to a nut.
 */
export function compareRelevance(a: RelevanceKey, b: RelevanceKey): number {
  return (
    b.tier - a.tier ||
    b.raw - a.raw ||
    b.head - a.head ||
    b.accounted - a.accounted ||
    b.position - a.position ||
    b.plainSibling - a.plainSibling ||
    b.plain - a.plain ||
    b.wholeness - a.wholeness ||
    b.simplicity - a.simplicity ||
    b.designated - a.designated
  );
}

/**
 * The scored rows a query keeps, less the ones that merely MENTION what was
 * typed: ADR-0062 §1's rule, applied to a whole result set because that is the
 * only place it can be applied safely.
 *
 * A row whose every typed token landed past the food's own name is dropped —
 * `Cheese, mozzarella, whole milk` under `milk` — but only where some row
 * answers on a STRICTLY HIGHER rung of {@link NameKey.tier}. That second
 * condition is the gate §1 asks for, and the bar being the best rung any name
 * reached is what makes it structural rather than disciplinary:
 *
 * - a query no name answers leaves the bar at 0 and every row clears it, so
 *   `raw` keeps its 1,444 rows where an ungated cut empties the query;
 * - **the lead can never be dropped**, since it holds the highest rung there is;
 * - a word naming one food and qualifying another on the SAME rung keeps both,
 *   which is what leaves the chili peppers under `chili` and the ancho under
 *   `ancho`. Ungated, the rule takes each out of the query that names it.
 *
 * Swept over 3,857 corpus head phrases and head words and over every one of the
 * 4,733 words the corpus contains: 0 leads moved, 0 queries emptied. The
 * Amendment to ADR-0062 carries the rest of that measurement.
 *
 * Generic over the row shape rather than taking `RelevanceKey[]`, because the
 * caller keeps whatever it hangs on the key — the row, the phrase that reached
 * it — and a filter has no business knowing what those are.
 */
export function withoutStrayMentions<T extends { key: NameKey }>(
  scored: readonly T[]
): T[] {
  const bar = scored.reduce(
    (rung, { key }) => (key.named ? Math.max(rung, key.tier) : rung),
    0
  );
  return scored.filter(({ key }) => key.named || key.tier >= bar);
}

/**
 * A free-text query compiled once: scores one reference-food name, with `tier` 0
 * meaning the name does not answer the query at all.
 */
export type ReferenceFoodQuery = (name: ReferenceFoodName) => NameKey;

/**
 * Compiles a query into the ADR-0042 scorer, the ONE place the ordering of a
 * food search lives.
 *
 * A prefix query returns lookalikes — "grape*" reaches grapefruit, grape-nuts
 * and grape soda, and "soy milk" reaches foods matching only one word
 * ("Beverages, rice milk") — and a source's own relevance floats those above the
 * real thing. So the order is re-derived from how *exactly* the name matches:
 * head-phrase, then whole-word, then mere prefix; then the raw base-ingredient
 * preference; then how completely the query fills the head phrase, and whether
 * it accounts for the rest of the name as well; then raw simplicity. Sorting is
 * stable, so the candidate order breaks any remaining tie.
 *
 * It scores each name once rather than comparing two, because a comparator
 * re-derives both sides on every one of the ~n log n comparisons — 205 ms for a
 * bare "b" over the bundled corpus, against 5 ms for scoring then sorting.
 *
 * A query holding no word answers nothing. Every test over its tokens would
 * otherwise pass vacuously and land every name in the whole-word tier, handing
 * back the corpus; and since punctuation is a separator, "-" and "..." reach
 * that state while sailing through a caller's `query.trim()` emptiness guard.
 */
export function compileReferenceFoodQuery(query: string): ReferenceFoodQuery {
  const tokens = wordsOf(query);
  if (tokens.length === 0) return () => NO_MATCH;
  const tokenStems = tokens.map(stemOf);
  const queryChars = tokens.reduce((n, t) => n + t.length, 0);

  return ({
    words,
    stems,
    headLength,
    headChars,
    shelfLength,
    nameLength,
    raw,
    simplicity,
    plain,
    wholeness,
  }) => {
    // Weakest signal: every token prefix-matches some word (this is what lets
    // grapefruit in for a "grape" query). Strongest of the name-wide signals:
    // every token IS some word, modulo plural — "grape" really present as a word
    // rather than merely as the head of a longer one.
    const prefixed = tokens.every((t) => words.some((w) => w.startsWith(t)));
    const wholeWords = tokenStems.every((t) => stems.includes(t));
    if (!prefixed && !wholeWords) return NO_MATCH;

    // Then the two head-phrase questions, which decide the top two tiers. The
    // head is the food's own name in USDA's "Food, qualifier" convention, so a
    // query that accounts for ALL of it names the food rather than one of its
    // qualifiers. `headIsQuery` is the settled form of that ("grape" ->
    // "Grapes, raw"); `headCovered` is the still-being-typed form ("pot" ->
    // "Potatoes, …", "grap" -> "Grapes, …").
    // ALL head words are typed words; SOME head word is a typed word; every head
    // word at least starts with one. Settled name, named-in-its-head, and
    // still-being-typed, in that order.
    let headIsQuery = headLength > 0;
    let headHasTypedWord = false;
    let headCovered = headLength > 0;
    for (let i = 0; i < headLength; i++) {
      const isTyped = tokenStems.includes(stems[i]);
      if (isTyped) headHasTypedWord = true;
      else headIsQuery = false;
      if (headCovered && !tokens.some((t) => words[i].startsWith(t)))
        headCovered = false;
    }

    // `headIsQuery` also requires the prefix match, so a "green grape" query
    // cannot head-match red grapes on the strength of its second word alone.
    const tier =
      headIsQuery && prefixed
        ? 50
        : headHasTypedWord
          ? 40
          : headCovered
            ? 30
            : wholeWords
              ? 20
              : 10;

    // Where each typed word landed. Only reachable past the retrieval test
    // above, which is what guarantees every token has an answering word: a row
    // is admitted when EVERY token prefix-matches some word or EVERY token
    // stem-matches some word, so under either branch the loop below always
    // finds one. A sentinel here would mean retrieval had broken.
    let position = 0;
    let named = false;
    for (let t = 0; t < tokens.length; t++) {
      for (let i = 0; i < words.length; i++) {
        if (stems[i] === tokenStems[t] || words[i].startsWith(tokens[t])) {
          // Whether this token reached the food's own name (ADR-0062 §1). The
          // FIRST answering word settles it: a token whose earliest match is
          // past the name has no earlier one, by definition of earliest. Asked
          // here rather than in a pass of its own so the two questions cannot
          // disagree about what a token matched (#131).
          if (i < nameLength) named = true;
          // Measured from where the food's own name starts, so a drink is not
          // charged for the aisle USDA walks down first (#154). A token that
          // landed IN the shelf label costs 0, which needs no special case and
          // ties every row under that label uniformly.
          position -= Math.max(0, i - shelfLength);
          break;
        }
      }
    }

    // Whether anything of the name is left over. The mirror of the loop above —
    // that one asks each TOKEN which word answered it, this asks each WORD
    // whether any token did — and deliberately its own pass rather than a
    // `matched[]` array threaded through it: the two questions are not the same
    // shape, and the cost of asking them separately is confined to queries that
    // return thousands of rows.
    //
    // The same test retrieval uses, on purpose. A completeness key that
    // disagreed with retrieval about what a token matched would be a second
    // copy of that answer, free to drift from it (#131).
    // Starting past the shelf label for the same reason: if the aisle is not
    // part of the food's name where a word SITS, it is not part of it where the
    // name is counted either. "whiskey sour" names the whole of
    // `Alcoholic beverage, whiskey sour` and used to lose to a powdered mix.
    let accounted = 1;
    for (let i = shelfLength; i < words.length; i++) {
      if (
        !tokenStems.includes(stems[i]) &&
        !tokens.some((t) => words[i].startsWith(t))
      ) {
        accounted = 0;
        break;
      }
    }

    return {
      tier,
      named,
      raw,
      // Within a tier, prefer the head whose length the query most nearly fills:
      // for "grap" this floats "Grapes, …" (2 characters to go) above
      // "Grapefruit, …" (6). A head the query does not cover at all ranks below
      // every head it does.
      //
      // The distance is absolute because a head SHORTER than the query is a
      // mismatch too — the query has words that head does not account for. A
      // signed difference made those score highest of all: "soy milk" ranked
      // "Milk, imitation, non-soy" (head 4 characters, +3) above "Soy milk,
      // unsweetened, …" (head 7, exactly 0).
      head: headCovered ? -Math.abs(headChars - queryChars) : HEAD_UNMATCHED,
      accounted,
      position,
      plain,
      wholeness,
      simplicity,
    };
  };
}

// ---------------------------------------------------------------------------
// The two keys that read a row rather than a name (ADR-0055)
// ---------------------------------------------------------------------------
//
// #134 asked whether four populations belong in a reference-food corpus at all:
// varietal wines, protein powders, the whole American Indian/Alaska Native Foods
// category, and origin-qualified meat. The answer was that prevalence may RANK a
// reference food and may never DROP one (ADR-0055 §1), so four proposed drop
// rules became these two keys and the corpus lost nothing.
//
// Both are facts about a ROW. `ReferenceFoodName` cannot carry either, and the
// attempt was measured and rejected: that shape is per-NAME, and since ADR-0050
// §4 a row is scored as the best of its names, with 80 rows carrying an `also`
// alias. If aliases join the sibling set below, FOURTEEN canonical rows demote
// themselves — `Oil, corn` is a row AND the prefix of its own alias, as are
// `Oil, soybean`, `Oil, peanut`, `Nuts, almonds, whole, raw`, `Pineapple, raw`
// and nine more.
// ---------------------------------------------------------------------------

/**
 * The category USDA files its designated-population records under.
 *
 * The handle is the CATEGORY, never the parenthesised name tags. The four tags
 * #134 named — `(Alaska Native)`, `(Navajo)`, `(Hopi)`, `(Shoshone Bannock)` —
 * reach 129 rows; 22 more say `(Apache)`, `(Southwest)`,
 * `(Northern Plains Indians)` or `(Klamath)`, and all 151 are in this category.
 */
const DESIGNATED_POPULATION_CATEGORY = "American Indian/Alaska Native Foods";

/**
 * The two ranking keys a description cannot answer, read off the row instead.
 *
 * Both are 1 for the undemoted case and 0 for the demoted one, so larger is
 * better as in every other key and {@link compareRelevance} reads them the same
 * way.
 */
export interface RowRank {
  /**
   * 0 when a plainer twin of this food exists elsewhere in the corpus — see
   * {@link plainSiblingsOf}, which decides it once at generation time.
   */
  plainSibling: number;
  /**
   * 0 when USDA published the record for a designated population.
   *
   * The reason is PROVENANCE, not worth: where two rows answer a query equally
   * well, the one published for no particular population is the better default.
   * The key sits last in the order and fires only on an exact tie in every
   * earlier key, so on the twelve head phrases only this category occupies —
   * `seal`, `walrus`, `whale`, `caribou`, `elk`, `agutuk`, `frybread`,
   * `sea lion`, `mouse nuts`, `willow`, `chokecherries`, `tortilla` — every
   * candidate carries it, the key ties uniformly and nothing moves.
   */
  designated: number;
}

/**
 * Which of these descriptions are a qualified form of another one, in order.
 *
 * A row's name is a qualified form when some STRICT prefix of its qualifiers is
 * itself a name in the set: `Alcoholic beverage, wine, table, white, Riesling`
 * sits under `Alcoholic beverage, wine, table, white`, and
 * `Oil, corn, peanut, and olive` under `Oil, corn`. It is the question
 * {@link RelevanceKey.plain} already asks — is this the plain form of its food —
 * asked of the corpus instead of the name.
 *
 * Two properties the caller does not have to remember, because the signature
 * carries them:
 *
 * - **Only descriptions go in.** An `also` alias has no way to contribute a
 *   parent, which is what stops the fourteen self-demotions above.
 * - **A row is never its own sibling.** A strict prefix has strictly fewer
 *   parts, so a name cannot be a prefix of itself however it is spelled.
 *
 * Reaches 131 of the 4,238 shipped rows under 77 parents, the largest two being
 * the 15 red and 13 white varietal wines that sent #134's author looking for a
 * drop rule.
 */
export function plainSiblingsOf(descriptions: readonly string[]): boolean[] {
  const parts = descriptions.map(qualifiersOf);
  const names = new Set(parts.map((p) => p.join(",")));
  return parts.map((p) => {
    let prefix = "";
    for (let n = 0; n < p.length - 1; n++) {
      prefix = n === 0 ? p[0] : `${prefix},${p[n]}`;
      if (names.has(prefix)) return true;
    }
    return false;
  });
}

/**
 * One row's two row-level keys.
 *
 * `plain_sibling` is baked into the Search index at generation time, because
 * deriving it at load costs 24 ms against the 18.5 ms the whole corpus load
 * costs (ADR-0055 §6). `foodCategory` is already on every row, so `designated`
 * is computed here rather than duplicated into a second field that could drift
 * from it — the rule ADR-0041 set for `deriveNovaVerdict`.
 *
 * Structurally typed rather than taking a `UsdaIndexRow`, so this module still
 * imports nothing.
 */
export function readRowRank(row: {
  foodCategory?: string;
  plain_sibling?: boolean;
}): RowRank {
  return {
    plainSibling: row.plain_sibling ? 0 : 1,
    designated: row.foodCategory === DESIGNATED_POPULATION_CATEGORY ? 0 : 1,
  };
}
