/**
 * ADR-0042's reference-food ranking: how a free-text query orders the foods it
 * reaches. Its own module because it outlives its first caller — the FDC search
 * API built it, and the bundled corpus (ADR-0047) is what runs it now, over
 * 4,429 rows per keystroke rather than over one page of API results.
 */

/**
 * A reference food's name, read the way ranking reads it: as words rather than
 * as a string, with the query-independent half of the score already settled.
 *
 * Separated from the description because the corpus a keystroke ranks is now the
 * whole 4,429-row Search index (ADR-0047 §4). Re-splitting every description on
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
}

/**
 * Reduces a word to its singular, the whole of the stemming this ranking does.
 *
 * Dropping a trailing "s" alone is not enough, and the gap was a real defect:
 * "potatoes" became "potatoe", which no spelling of "potato" ever equals, so
 * searching the food by its own name ranked it below "Sweet potato leaves".
 * The two English plurals that a bare "s" gets wrong and that food names are
 * full of are "-oes" (potatoes, tomatoes, mangoes) and "-ies" (berries,
 * cherries), so both are handled and nothing else is.
 *
 * Deliberately not a real stemmer. Anything more aggressive starts merging words
 * that name different foods, and the tiers below are built on the assumption
 * that two stems being equal means two words being the same word.
 */
const stemOf = (word: string): string => {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("oes")) return word.slice(0, -2);
  return word.endsWith("s") ? word.slice(0, -1) : word;
};

const wordsOf = (text: string): string[] =>
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
  return {
    words,
    stems: words.map(stemOf),
    headLength: head.length,
    headChars: head.reduce((n, w) => n + w.length, 0),
    raw,
    simplicity,
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
  /** The name's raw simplicity, carried through for the same reason. */
  simplicity: number;
}

/** A name that does not answer the query at all — every later key is moot. */
const NO_MATCH: RelevanceKey = { tier: 0, raw: 0, head: 0, simplicity: 0 };

/** A head phrase the query does not cover, ranked below every one it does. */
const HEAD_UNMATCHED = -1e6;

/** Orders two relevance keys best-first, for `Array.prototype.sort`. */
export function compareRelevance(a: RelevanceKey, b: RelevanceKey): number {
  return (
    b.tier - a.tier ||
    b.raw - a.raw ||
    b.head - a.head ||
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
 * An empty query has no tokens, so every test over them passes vacuously and no
 * head word can be one: every name lands in the whole-word tier, undifferentiated.
 * Callers that treat an empty query as "no search" guard it before compiling.
 */
export function compileReferenceFoodQuery(query: string): ReferenceFoodQuery {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/\*+$/, ""))
    .filter(Boolean);
  const tokenStems = tokens.map(stemOf);
  const queryChars = tokens.reduce((n, t) => n + t.length, 0);

  return ({ words, stems, headLength, headChars, raw, simplicity }) => {
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
      simplicity,
    };
  };
}
