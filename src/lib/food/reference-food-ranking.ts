/**
 * ADR-0042's reference-food ranking: how a free-text query orders the foods it
 * reaches. Its own module because it outlives its first caller — the FDC search
 * API built it, and the bundled corpus (ADR-0047) is what runs it now, over
 * 4,360 rows per keystroke rather than over one page of API results.
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
  /\b(imitation|substitute|meatless|low sodium|low fat|lowfat|reduced fat|reduced sodium|fat free|fat-free|nonfat|gluten[- ]free|filled|non-soy)\b/i;

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
 * A reference food's name, read the way ranking reads it: as words rather than
 * as a string, with the query-independent half of the score already settled.
 *
 * Separated from the description because the corpus a keystroke ranks is now the
 * whole 4,360-row Search index (ADR-0047 §4). Re-splitting every description on
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
  /** 1 for a raw food, 0 otherwise — the base-ingredient preference. */
  raw: number;
  /** Raw simplicity: "Bananas, raw" (3) over "Bananas, overripe, raw" (2). */
  simplicity: number;
  /** 1 for a name that is neither a modified form nor a prepared one (#143). */
  plain: number;
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
 * Reads a description into the shape ranking compares. Pure, and cheap enough to
 * call per search hit; the bundled corpus calls it once per row at load instead.
 */
export function readReferenceFoodName(description: string): ReferenceFoodName {
  const words = wordsOf(description);
  const head = wordsOf(description.split(",")[0] ?? "");
  const lower = description.toLowerCase().trim();
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
  const plain = MODIFIED_FORM.test(lower) || PREPARED_FORM.test(lower) ? 0 : 1;
  return {
    words,
    stems: words.map(stemOf),
    headLength: head.length,
    headChars: head.reduce((n, w) => n + w.length, 0),
    raw,
    simplicity,
    plain,
  };
}

/**
 * How well one name answers a query, as the ordered keys the ranking sorts on.
 * Larger is better in every field, and each is only consulted when the one
 * before it ties.
 */
export interface RelevanceKey {
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
  /** The name's raw-ness, carried through so one comparison reads one key. */
  raw: number;
  /** How completely the query fills the head phrase; negative chars-to-go. */
  head: number;
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
  /** The name's raw simplicity, carried through for the same reason. */
  simplicity: number;
}

/** A name that does not answer the query at all — every later key is moot. */
const NO_MATCH: RelevanceKey = {
  tier: 0,
  raw: 0,
  head: 0,
  position: 0,
  plain: 0,
  simplicity: 0,
};

/** A head phrase the query does not cover, ranked below every one it does. */
const HEAD_UNMATCHED = -1e6;

/** Orders two relevance keys best-first, for `Array.prototype.sort`. */
export function compareRelevance(a: RelevanceKey, b: RelevanceKey): number {
  return (
    b.tier - a.tier ||
    b.raw - a.raw ||
    b.head - a.head ||
    b.position - a.position ||
    b.plain - a.plain ||
    b.simplicity - a.simplicity
  );
}

/**
 * A free-text query compiled once: scores one reference-food name, with `tier` 0
 * meaning the name does not answer the query at all.
 */
export type ReferenceFoodQuery = (name: ReferenceFoodName) => RelevanceKey;

/**
 * Compiles a query into the ADR-0042 scorer, the ONE place the ordering of a
 * food search lives.
 *
 * A prefix query returns lookalikes — "grape*" reaches grapefruit, grape-nuts
 * and grape soda, and "soy milk" reaches foods matching only one word
 * ("Beverages, rice milk") — and a source's own relevance floats those above the
 * real thing. So the order is re-derived from how *exactly* the name matches:
 * head-phrase, then whole-word, then mere prefix; then the raw base-ingredient
 * preference; then how completely the query fills the head phrase; then raw
 * simplicity. Sorting is stable, so the candidate order breaks any remaining tie.
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

  return ({ words, stems, headLength, headChars, raw, simplicity, plain }) => {
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
    for (let t = 0; t < tokens.length; t++) {
      for (let i = 0; i < words.length; i++) {
        if (stems[i] === tokenStems[t] || words[i].startsWith(tokens[t])) {
          position -= i;
          break;
        }
      }
    }

    return {
      tier,
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
      position,
      plain,
      simplicity,
    };
  };
}
